/* Backtest case models: decode data/case-data.js and compare each synthetic case with the regular day.
 * Cases share random numbers with the regular day on the same seed, so case minus regular day is the
 * exact effect of the case. Runs in the browser and in Node tests (which alias window to globalThis). */
(function (root) {
  'use strict';
  const QF = (root.QF = root.QF || {});

  const TIERS = ['observed', 'plausible', 'stress'];
  const TIER_WEIGHTS = { observed: 0.6, plausible: 0.3, stress: 0.1 };
  const FAMILIES = ['S1', 'S2', 'S3', 'S4', 'S5'];
  const MIN_EFFECT = 100; // mean daily P&L change below which a product or strategy counts as untouched
  const cache = new Map();

  function data() {
    if (!root.caseData) throw new Error('Backtest case data (data/case-data.js) is not loaded');
    return root.caseData;
  }

  const memo = (key, build) => {
    if (!cache.has(key)) cache.set(key, build());
    return cache.get(key);
  };

  /** Decode [scale, ...deltas] into real values; null stays null. */
  function decode(encoded) {
    if (!encoded) return null;
    const [scale, ...deltas] = encoded;
    const out = new Float64Array(deltas.length);
    let acc = 0;
    for (let i = 0; i < deltas.length; i++) {
      acc += deltas[i];
      out[i] = acc / scale;
    }
    return out;
  }

  const cases = () => data().cases;
  const seeds = () => data().seeds.map(String);

  function caseById(id) {
    const found = cases().find((c) => c.id === id);
    if (!found) throw new Error(`Unknown case: ${id}`);
    return found;
  }

  const baseline = () => caseById(data().baseline);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);

  /** Total P&L per seed, its mean and worst seed. */
  function totals(c) {
    return memo(`tot:${c.id}`, () => {
      const bySeed = Object.fromEntries(seeds().map((s) => [s, sum(c.pnl[s])]));
      const values = Object.values(bySeed);
      return { bySeed, mean: mean(values), worst: Math.min(...values) };
    });
  }

  /** Tier-weighted mean P&L: each tier's weight is split equally among its cases (as on slide 27). */
  function weightedMean() {
    return memo('weighted', () => TIERS.reduce((acc, tier) => {
      const inTier = cases().filter((c) => c.tier === tier);
      return acc + TIER_WEIGHTS[tier] * mean(inTier.map((c) => totals(c).mean));
    }, 0));
  }

  const caseWeight = (c) => TIER_WEIGHTS[c.tier] / cases().filter((x) => x.tier === c.tier).length;

  /** P&L by owning strategy family for one seed. Products nobody owns are summed as 'none'. */
  function familyPnl(c, seed) {
    const { products, owner } = data();
    const out = Object.fromEntries([...FAMILIES, 'none'].map((f) => [f, 0]));
    products.forEach((p, i) => { out[owner[p] || 'none'] += c.pnl[seed][i]; });
    return out;
  }

  /** Case minus regular day, per family and seed: the exact effect of the case on each strategy. */
  function familyDelta(c) {
    return memo(`fam:${c.id}`, () => {
      const base = baseline();
      return FAMILIES.map((family) => {
        const bySeed = seeds().map((s) => familyPnl(c, s)[family] - familyPnl(base, s)[family]);
        return { family, bySeed, mean: mean(bySeed) };
      });
    });
  }

  /** Case minus regular day per product (mean over seeds), largest moves first. */
  function productDelta(c) {
    return memo(`prod:${c.id}`, () => {
      const base = baseline();
      const { products, owner } = data();
      return products
        .map((product, i) => {
          const bySeed = seeds().map((s) => c.pnl[s][i] - base.pnl[s][i]);
          const sameSign = bySeed.every((d) => Math.sign(d) === Math.sign(bySeed[0]));
          return { product, family: owner[product] || null, bySeed, mean: mean(bySeed), sameSign };
        })
        .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));
    });
  }

  /** How the case changed each product's market (trace seed): spread, prints and tick volatility vs regular day. */
  function marketChanges(c) {
    return memo(`mkt:${c.id}`, () => {
      const base = baseline();
      return data().products
        .map((product) => {
          const [spread, prints, vol] = c.stats[product];
          const [bSpread, bPrints, bVol] = base.stats[product];
          const ratios = { spread: spread / bSpread, prints: prints / Math.max(bPrints, 1), vol: vol / bVol };
          const size = Math.max(...Object.values(ratios).map((r) => Math.abs(Math.log(r || 1))));
          return { product, spread, prints, vol, bSpread, bPrints, bVol, ratios, size };
        })
        .sort((a, b) => b.size - a.size);
    });
  }

  /** Decoded trace-seed series of one product in one case: mid, position, P&L and the owner's signals. */
  function trace(c, product) {
    return memo(`trace:${c.id}:${product}`, () => {
      const raw = c.traces[product];
      if (!raw) return null;
      const sig = Object.fromEntries(Object.entries(raw.sig || {}).map(([k, v]) => [k, decode(v)]));
      return { mid: decode(raw.mid), pos: decode(raw.pos), pnl: decode(raw.pnl), fills: raw.fills ?? 0, sig };
    });
  }

  /** The case's traded products whose P&L it moved by at least MIN_EFFECT a day (always at least one). */
  function focusProducts(c) {
    const moved = c.focus.filter((p) => Math.abs(productDelta(c).find((d) => d.product === p).mean) >= MIN_EFFECT);
    return moved.length ? moved : c.focus.slice(0, 1);
  }

  const totalPath = (c, seed) => memo(`path:${c.id}:${seed}`, () => decode(c.total[seed]));

  /** How the strategy behaved on one product: average and peak exposure, fills, final P&L, signal ranges. */
  function behaviour(c, product) {
    const t = trace(c, product);
    if (!t || !t.pos) return null;
    const abs = Array.from(t.pos, Math.abs);
    const sig = Object.fromEntries(Object.entries(t.sig).map(([k, v]) => {
      const xs = Array.from(v);
      return [k, { mean: mean(xs), last: xs[xs.length - 1], max: Math.max(...xs), min: Math.min(...xs) }];
    }));
    return { exposure: mean(abs), maxExposure: Math.max(...abs), fills: t.fills, finalPnl: t.pnl[t.pnl.length - 1], sig };
  }

  QF.bt = {
    TIERS, TIER_WEIGHTS, FAMILIES, MIN_EFFECT,
    data, decode, cases, baseline, caseById, seeds, totals, weightedMean, caseWeight,
    familyPnl, familyDelta, productDelta, focusProducts, marketChanges, trace, totalPath, behaviour,
  };
})(window);
