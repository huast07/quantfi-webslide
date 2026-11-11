"""Build slideshow/data/lab-data.js from the three real training days.

The strategy labs replay real order-book and trade data, so this script extracts
the series each lab needs and writes them as compact, delta-encoded integer
arrays (prices are stored doubled so that half ticks stay integral).

Usage (from the QuantFi folder):
    python3 slideshow/tools/build_lab_data.py
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRICES = ROOT / "backtester" / "QuantFi Price Data"
TRADES = ROOT / "backtester" / "QuantFi Trades Data"
OUT = ROOT / "slideshow" / "data" / "lab-data.js"

DAYS = (-2, -1, 0)
TICKS_PER_DAY = 10_000
TIMESTAMP_STEP = 100
VOUCHER_SAMPLE_EVERY = 20  # ticks between voucher-surface snapshots
PEARLS = ("PINK_PEARLS", "BLUE_PEARLS", "BLACK_PEARLS", "GOLDEN_PEARLS", "WHITE_PEARLS")
STRIKES = (6800, 7000, 7200, 7300, 7400, 7500, 7600, 7750, 7900, 8100)
VOUCHERS = tuple(f"VOUCHER_{k}" for k in STRIKES)
BOOK_PRODUCTS = ("TOFFEE_CAKE", "PINK_PEARLS", "TELLURIUM")
MID_PRODUCTS = ("GOLDEN_PEARLS", "LYCHEE", *PEARLS, *VOUCHERS)
TRADE_PRODUCTS = ("TOFFEE_CAKE", "PINK_PEARLS")
# Products shown in the S5 allocator lab, with their position limits (trader.py LIMITS).
LIMITS = {"TOFFEE_CAKE": 50, "AMETHYST": 50, "PAPER_LANTERNS": 50, "JELLY": 50,
          "PEANUT_BUTTER": 50, "PINK_PEARLS": 20, "LYCHEE": 200}
ALLOCATION_PRODUCTS = tuple(LIMITS)


def parse_price(raw: str) -> float | None:
    """Return a positive price, or None for a missing book side."""
    if not raw:
        return None
    value = float(raw)
    return value if value > 0 else None


def forward_fill(values: list[float | None], name: str) -> list[float]:
    """Fill gaps (missing book sides) with the last seen value."""
    first = next((v for v in values if v is not None), None)
    if first is None:
        raise ValueError(f"{name}: series has no valid values")
    filled, last = [], first
    for value in values:
        last = value if value is not None else last
        filled.append(last)
    return filled


def doubled_deltas(values: list[float]) -> list[int]:
    """Encode prices as deltas of 2 x price, which is integral for half ticks."""
    doubled = [round(2 * v) for v in values]
    return [doubled[0]] + [b - a for a, b in zip(doubled, doubled[1:])]


def load_prices(day: int) -> dict[str, dict[str, list[float | None]]]:
    path = PRICES / f"prices_day_{day}.csv"
    wanted = set(BOOK_PRODUCTS) | set(MID_PRODUCTS) | set(ALLOCATION_PRODUCTS)
    fields = ("bid", "ask", "mid", "bidVol", "askVol")
    series = {p: {f: [None] * TICKS_PER_DAY for f in fields} for p in wanted}
    with path.open(newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            product = row["product"]
            if product not in wanted:
                continue
            tick = int(row["timestamp"]) // TIMESTAMP_STEP
            bid, ask = parse_price(row["bid_price_1"]), parse_price(row["ask_price_1"])
            series[product]["bid"][tick] = bid
            series[product]["ask"][tick] = ask
            series[product]["mid"][tick] = (bid + ask) / 2 if bid and ask else None
            series[product]["bidVol"][tick] = int(row["bid_volume_1"] or 0)
            series[product]["askVol"][tick] = abs(int(row["ask_volume_1"] or 0))
    return series


def load_trades(day: int) -> dict[str, list[list[int]]]:
    """Return [tick, 2 x price, quantity] for every market print per product."""
    path = TRADES / f"trades_day_{day}.csv"
    prints: dict[str, list[list[int]]] = {p: [] for p in set(TRADE_PRODUCTS) | set(ALLOCATION_PRODUCTS)}
    with path.open(newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            if row["symbol"] in prints:
                tick = int(row["timestamp"]) // TIMESTAMP_STEP
                prints[row["symbol"]].append([tick, round(2 * float(row["price"])), int(row["quantity"])])
    return prints


def book(prices: dict, product: str) -> dict:
    """Best bid/ask (delta-encoded, doubled) and best-level volumes for one product."""
    side = prices[product]
    return {
        "bid": doubled_deltas(forward_fill(side["bid"], f"{product} bid")),
        "ask": doubled_deltas(forward_fill(side["ask"], f"{product} ask")),
        "bidVol": [v or 0 for v in side["bidVol"]],
        "askVol": [v or 0 for v in side["askVol"]],
    }


def build_day(day: int, prices: dict, trades: dict) -> dict:
    mids = {p: forward_fill(prices[p]["mid"], f"{p} day {day}") for p in MID_PRODUCTS}
    pearl_sum = [sum(mids[p][t] for p in PEARLS) for t in range(TICKS_PER_DAY)]
    sampled = range(0, TICKS_PER_DAY, VOUCHER_SAMPLE_EVERY)
    return {
        "toffee": {**book(prices, "TOFFEE_CAKE"), "trades": trades["TOFFEE_CAKE"]},
        "pink": {**book(prices, "PINK_PEARLS"), "sum": doubled_deltas(pearl_sum), "trades": trades["PINK_PEARLS"]},
        "golden": doubled_deltas(mids["GOLDEN_PEARLS"]),
        "tellurium": book(prices, "TELLURIUM"),
        "vouchers": {
            "every": VOUCHER_SAMPLE_EVERY,
            "lychee": doubled_deltas([mids["LYCHEE"][t] for t in sampled]),
            "mids": [doubled_deltas([mids[v][t] for t in sampled]) for v in VOUCHERS],
        },
    }


def product_stats(product: str, loaded: dict[int, tuple[dict, dict]]) -> dict:
    """Pooled 3-day statistics used by the S5 allocator lab.

    sigma is the long-run per-tick volatility sqrt(gamma0 + 2 gamma1) of mid changes,
    the MA(1) estimate S5 uses to strip quote noise; the rest describe taker flow.
    """
    changes, spreads, prints, lots = [], [], 0, 0
    for day in DAYS:
        prices, trades = loaded[day]
        side = prices[product]
        mid = forward_fill(side["mid"], f"{product} day {day}")
        changes += [b - a for a, b in zip(mid, mid[1:])]
        spreads += [a - b for a, b in zip(side["ask"], side["bid"]) if a and b]
        prints += len(trades[product])
        lots += sum(qty for _, _, qty in trades[product])
    n = len(changes)
    mean = sum(changes) / n
    gamma0 = sum((c - mean) ** 2 for c in changes) / n
    gamma1 = sum((a - mean) * (b - mean) for a, b in zip(changes, changes[1:])) / n
    ticks = TICKS_PER_DAY * len(DAYS)
    return {
        "product": product,
        "limit": LIMITS[product],
        "sigma": round(max(gamma0 + 2 * gamma1, 1e-6) ** 0.5, 4),
        "halfSpread": round(sum(spreads) / len(spreads) / 2, 3),
        "printsPerTick": round(prints / ticks, 5),
        "lotsPerPrint": round(lots / max(prints, 1), 3),
    }


def main() -> int:
    loaded = {day: (load_prices(day), load_trades(day)) for day in DAYS}
    payload = {
        "ticksPerDay": TICKS_PER_DAY,
        "strikes": list(STRIKES),
        "days": {str(day): build_day(day, *loaded[day]) for day in DAYS},
        "allocation": [product_stats(p, loaded) for p in ALLOCATION_PRODUCTS],
    }
    body = json.dumps(payload, separators=(",", ":"))
    OUT.write_text(f"/* Generated by slideshow/tools/build_lab_data.py - do not edit. */\nwindow.labData={body};\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(body) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
