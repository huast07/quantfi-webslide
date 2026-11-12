"""Build slideshow/data/case-data.js for the backtesting lab (slides 26 and 27).

For every case in the backtester's catalogue this runs the submitted trader (Trading_Algorithm/trader2.py)
through the unmodified prosperity3bt engine on seeds 3, 4 and 5, the held-out seeds quoted on slide 27.
Cases share random numbers, so a case on seed s differs from the regular day on seed s only by what the
case changes. That lets the lab show the exact effect of each case and how each strategy reacted.

On the trace seed it also records, every SAMPLE_EVERY ticks, each product's market (mid, spread, prints),
our position and P&L, and the owning strategy's internal state read from traderData.

Runs are cached per (case, seed) in slideshow/tools/.case-cache, so re-emitting the JS is quick.

Usage (from the QuantFi folder, about 30 minutes on 8 cores the first time):
    cd backtester && uv run python ../slideshow/tools/build_case_data.py
"""

from __future__ import annotations

import json
import math
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BACKTESTER = ROOT / "backtester"
TRADER = ROOT / "Trading_Algorithm" / "trader2.py"
PARAMS = BACKTESTER / "params" / "params.json"
CACHE = Path(__file__).resolve().parent / ".case-cache"
OUT = ROOT / "slideshow" / "data" / "case-data.js"

SEEDS = (3, 4, 5)
TRACE_SEED = 3
BASELINE = "regular-day"
SAMPLE_EVERY = 20  # ticks between trace samples (500 points a day)
TOTAL_EVERY = 100  # ticks between total-P&L samples for every seed
TIMESTAMP_STEP = 100
FOCUS_TRADED = 3  # traded products shown per case, ranked by |P&L change|
FOCUS_MARKET = 4  # extra products whose market path is shown, ranked by how much the case moved them
WORKERS = 7
STRIKES = (6800, 7000, 7200, 7300, 7400, 7500, 7600, 7750, 7900, 8100)
OWNER = {
    "AMETHYST": "S1", "TOFFEE_CAKE": "S1", "PAPER_LANTERNS": "S1", "WHITE_PEARLS": "S1",
    "PINK_PEARLS": "S2", "GOLDEN_PEARLS": "S2", "BLACK_PEARLS": "S2", "BLUE_PEARLS": "S2",
    "LYCHEE": "S3", **{f"VOUCHER_{k}": "S3" for k in STRIKES},
    "TELLURIUM": "S4", "JELLY": "S5",
}


# ---------- reading the trader's state ----------

def _sub(raw: str) -> dict:
    """The orchestrator's per-strategy states, each decoded from its JSON string."""
    top = json.loads(raw) if raw else {}
    return {name: json.loads(v) if isinstance(v, str) else v for name, v in top.get("sub", {}).items()}


def signals(product: str, sub: dict) -> dict[str, float | None]:
    """The owning strategy's belief about `product`: what it thinks fair value is, how volatile, which way."""
    family = OWNER[product]
    state = sub.get(family) or {}
    if family == "S1":
        own = state.get(product) or {}
        return {"fair": own.get("fv"), "vol": own.get("v")}
    if family == "S2":
        if product == "PINK_PEARLS":
            return {"dev": (state.get("pk") or {}).get("dev")}
        if product == "GOLDEN_PEARLS":
            gp = state.get("gp") or [None] * 4
            return {"fair": gp[0], "mode": gp[3]}
        if product == "BLUE_PEARLS":
            bl = state.get("bl") or [None] * 4
            return {"mom": bl[3]}
        return {}
    if family == "S3":
        if product == "LYCHEE":
            return {"vol": (state.get("u") or {}).get("sv")}
        ivs = (state.get("s") or {}).get("iv") or []
        i = STRIKES.index(int(product.split("_")[1]))
        return {"iv": ivs[i] if i < len(ivs) else None}
    if family == "S4":
        jm = state.get("jm") or {}
        return {"follow": jm.get("bm"), "vol": jm.get("cv")}
    if family == "S5":
        own = (state.get("s") or {}).get(product) or {}
        return {"share": own.get("w"), "edge": own.get("k"), "pause": own.get("p")}
    return {}


# S4's direction posterior (trader2.py S4 `up_prob`): a Beta-Binomial on up vs down jumps, averaged over a grid
# of prior concentrations c with a log-normal prior centred on C_CENTER.
C_GRID = (0.1, 0.25, 0.55, 1.2, 2.5, 5.0)
C_CENTER, C_LOG_SD = 0.55, 1.1


def _betaln(a: float, b: float) -> float:
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def up_prob(nu: int, nd: int) -> float:
    logw = [-0.5 * ((math.log(c) - math.log(C_CENTER)) / C_LOG_SD) ** 2 + _betaln(c + nu, c + nd) - _betaln(c, c)
            for c in C_GRID]
    top = max(logw)
    weights = [math.exp(x - top) for x in logw]
    preds = [(c + nu) / (2 * c + nu + nd) for c in C_GRID]
    return sum(w * p for w, p in zip(weights, preds)) / sum(weights)


def derived_signals(product: str, raw: dict, jumps: list[list[float]]) -> dict:
    """Variances become standard deviations; TELLURIUM gains S4's P(next jump up) from the jumps seen so far."""
    out = {k: list(v) for k, v in raw.items()}
    if "vol" in out:
        out["vol"] = [math.sqrt(max(v, 0.0)) if v is not None else None for v in out["vol"]]
    if product == "TELLURIUM" and "follow" in out:
        pup = []
        for i in range(len(out["follow"])):
            seen = [j for j in jumps if j[0] <= i * SAMPLE_EVERY]
            pup.append(up_prob(sum(j[1] > 0 for j in seen), sum(j[1] < 0 for j in seen)))
        out["pup"] = pup
    return out


def tellurium_jumps(sub: dict) -> list[list[float]]:
    return [list(j) for j in ((sub.get("S4") or {}).get("jm") or {}).get("J") or []]


# ---------- one run ----------

def _filled(values: np.ndarray) -> np.ndarray:
    """Forward-fill NaNs (a missing book side) so every sample has a price."""
    out = values.astype(float).copy()
    first = np.flatnonzero(~np.isnan(out))
    if first.size == 0:
        return np.zeros_like(out)
    out[: first[0]] = out[first[0]]
    for i in range(1, out.size):
        if math.isnan(out[i]):
            out[i] = out[i - 1]
    return out


def market_summary(market) -> dict:
    """Per product: sampled mid, mean spread, prints per day and the std of one-tick mid changes."""
    out = {}
    for product, book in market.products.items():
        mid = _filled(book.mid)
        spread = book.ask_prices[:, 0] - book.bid_prices[:, 0]
        out[product] = {
            "mid": [round(float(x), 1) for x in mid[::SAMPLE_EVERY]],
            "spread": round(float(np.nanmean(spread)), 3),
            "prints": int(book.trade_ticks.size),
            "vol": round(float(np.std(np.diff(mid))), 4),
        }
    return out


def run_case(case_id: str, seed: int) -> dict:
    from prosperity3bt.file_reader import FileSystemReader
    from prosperity3bt.runner import run_backtest

    from quantgen.adapter.dataset import ROUND, stage_day
    from quantgen.adapter.detail import run_detail
    from quantgen.adapter.limits import quantifi_limits
    from quantgen.adapter.runner import MatchMode, summarise
    from quantgen.adapter.strategy import Strategy, load_trader
    from quantgen.cases.case import case_day, find_cases, load_catalog
    from quantgen.generator.params import load_params
    from quantgen.market_day import to_day_data

    (case,) = find_cases(load_catalog(), [case_id])
    market = case_day(load_params(PARAMS), case, seed)
    day = to_day_data(market)
    trader = load_trader(Strategy("trader2.py", TRADER.read_text(encoding="utf-8")))
    trace = seed == TRACE_SEED
    samples: list[dict] = []
    jumps: dict[int, list[float]] = {}

    if trace:
        inner = trader.run

        def recording_run(state):
            out = inner(state)
            tick = state.timestamp // TIMESTAMP_STEP
            if tick % SAMPLE_EVERY == 0:
                sub = _sub(out[2])
                samples.append({p: signals(p, sub) for p in OWNER})
                for j in tellurium_jumps(sub):
                    jumps[int(j[0])] = j
            return out

        trader.run = recording_run

    with tempfile.TemporaryDirectory(prefix="casedata-") as tmp, quantifi_limits():
        stage_day(day, Path(tmp))
        result = run_backtest(trader, FileSystemReader(Path(tmp)), ROUND, day.day, False, MatchMode.ALL, True, False)

    summary = summarise(day.day, result, with_log=False)
    record = {
        "case": case_id,
        "seed": seed,
        "pnl": {p: round(v, 1) for p, v in summary.product_pnl.items()},
        "total": [round(v, 1) for v in summary.pnl_path[::TOTAL_EVERY]] + [round(summary.total_pnl, 1)],
        "breaches": summary.limit_breaches,
    }
    if trace:
        detail = run_detail(result)
        traces = {pt.product: pt for pt in detail.products}
        record["market"] = market_summary(market)
        record["traces"] = {
            p: {
                "pos": list(traces[p].position[::SAMPLE_EVERY]),
                "pnl": [round(v, 1) for v in traces[p].pnl[::SAMPLE_EVERY]],
                "fills": len(traces[p].fills),
                "signals": {k: [s[p].get(k) for s in samples] for k in samples[0][p]} if samples else {},
            }
            for p in OWNER
            if p in traces
        }
        record["jumps"] = sorted(jumps.values())
    return record


def cached_run(case_id: str, seed: int) -> dict:
    path = CACHE / f"{case_id}--{seed}.json"
    if path.exists():
        return json.loads(path.read_text())
    record = run_case(case_id, seed)
    path.write_text(json.dumps(record, separators=(",", ":")))
    return record


# ---------- emitting the lab data ----------

def encode(values: list[float | None], scale: int) -> list[int] | None:
    """Delta-encoded integers of value x scale (nulls carry the last value forward)."""
    if not values or all(v is None for v in values):
        return None
    first = next(v for v in values if v is not None)
    out, last_int, last = [], 0, first
    for v in values:
        last = v if v is not None else last
        current = int(round(last * scale))
        out.append(current - last_int)
        last_int = current
    return [scale, *out]


SIGNAL_SCALE = {"fair": 10, "vol": 1000, "dev": 10, "mode": 1, "mom": 10000, "iv": 100000, "pup": 1000, "follow": 1000,
                "share": 10000, "edge": 100, "pause": 1}


def divergence(case_mid: list[float], base_mid: list[float], base_vol: float) -> float:
    """Mean gap between the case's and the regular day's mid, in units of one regular-day tick move."""
    gaps = [abs(a - b) for a, b in zip(case_mid, base_mid)]
    return sum(gaps) / len(gaps) / max(base_vol, 1e-9)


def focus_products(case_id: str, runs: dict, products: list[str]) -> tuple[list[str], list[str]]:
    traded = [p for p in OWNER]
    deltas = {p: np.mean([runs[(case_id, s)]["pnl"].get(p, 0) - runs[(BASELINE, s)]["pnl"].get(p, 0) for s in SEEDS])
              for p in traded}
    focus = sorted(traded, key=lambda p: -abs(deltas[p]))[:FOCUS_TRADED]
    case_m, base_m = runs[(case_id, TRACE_SEED)]["market"], runs[(BASELINE, TRACE_SEED)]["market"]

    def moved(p: str) -> float:
        c, b = case_m[p], base_m[p]
        return max(divergence(c["mid"], b["mid"], b["vol"]) / 25,
                   abs(c["vol"] / max(b["vol"], 1e-9) - 1),
                   abs(c["spread"] / max(b["spread"], 1e-9) - 1),
                   abs(c["prints"] / max(b["prints"], 1) - 1))

    market = [p for p in sorted(products, key=lambda p: -moved(p)) if p not in focus and moved(p) > 0.05][:FOCUS_MARKET]
    return focus, market


def trace_payload(record: dict, product: str) -> dict:
    t = record["traces"].get(product)
    out = {"mid": encode(record["market"][product]["mid"], 2)}
    if t:
        out.update({
            "pos": encode(t["pos"], 1),
            "pnl": encode(t["pnl"], 1),
            "fills": t["fills"],
            "sig": {k: encode(v, SIGNAL_SCALE[k])
                    for k, v in derived_signals(product, t["signals"], record.get("jumps", [])).items()
                    if encode(v, 1) is not None},
        })
    return out


def emit(runs: dict, catalog) -> None:
    products = sorted(runs[(BASELINE, TRACE_SEED)]["market"])
    base = runs[(BASELINE, TRACE_SEED)]
    cases = []
    for case in catalog:
        trace = runs[(case.id, TRACE_SEED)]
        focus, market = focus_products(case.id, runs, products)
        shown = products if case.id == BASELINE else [*focus, *market]
        cases.append({
            "id": case.id, "title": case.title, "tier": case.tier, "family": case.family,
            "summary": case.summary, "description": case.description, "refs": list(case.references),
            "pnl": {str(s): [runs[(case.id, s)]["pnl"].get(p, 0) for p in products] for s in SEEDS},
            "total": {str(s): encode(runs[(case.id, s)]["total"], 1) for s in SEEDS},
            "breaches": sum(runs[(case.id, s)]["breaches"] for s in SEEDS),
            "stats": {p: [trace["market"][p][k] for k in ("spread", "prints", "vol")] for p in products},
            "focus": focus, "moved": market,
            "traces": {p: trace_payload(trace, p) for p in shown},
            "jumps": trace.get("jumps", []),
        })
    data = {
        "seeds": list(SEEDS), "traceSeed": TRACE_SEED, "every": SAMPLE_EVERY, "totalEvery": TOTAL_EVERY,
        "baseline": BASELINE, "products": products, "owner": OWNER, "cases": cases,
    }
    body = json.dumps(data, separators=(",", ":"))
    OUT.write_text(f"/* Generated by slideshow/tools/build_case_data.py. Do not edit. */\nwindow.caseData={body};\n")
    print(f"wrote {OUT} ({len(body) / 1e6:.2f} MB, {len(cases)} cases, base total {base['total'][-1]:,.0f})")


def main() -> int:
    sys.path.insert(0, str(BACKTESTER))
    from quantgen.cases.case import load_catalog

    CACHE.mkdir(exist_ok=True)
    catalog = load_catalog()
    jobs = [(c.id, s) for c in catalog for s in SEEDS]
    runs: dict = {}
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(cached_run, cid, s): (cid, s) for cid, s in jobs}
        for done, future in enumerate(as_completed(futures), 1):
            key = futures[future]
            runs[key] = future.result()
            print(f"\r{done}/{len(jobs)} runs ({key[0]} seed {key[1]})" + " " * 20, end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)
    emit(runs, catalog)
    return 0


if __name__ == "__main__":
    sys.exit(main())
