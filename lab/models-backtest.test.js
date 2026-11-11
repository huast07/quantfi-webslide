/* Backtest case tests: the lab's case data must reproduce the held-out results quoted on slide 28, and the
 * case-minus-regular-day comparisons must be internally consistent. Run with: node --test slideshow/lab/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

globalThis.window = globalThis;
require('../data/case-data.js');
require('./models-backtest.js');
const heldout = require(path.join(__dirname, '../data/heldout_trader2.json')).rows.find((r) => r.strategy === 'trader2');
const B = globalThis.QF.bt;

// trader2.py's NumPy-free voucher maths differs from the tournament build by at most 36 per day (PLAN.md).
const ROUNDING_TOLERANCE = 40;

test('every case and seed reproduces the held-out P&L on slide 28', () => {
  assert.equal(B.cases().length, Object.keys(heldout.cases).length);
  for (const c of B.cases()) {
    for (const seed of B.seeds()) {
      const expected = heldout.cases[c.id].by_seed[seed];
      const actual = B.totals(c).bySeed[seed];
      assert.ok(Math.abs(actual - expected) <= ROUNDING_TOLERANCE, `${c.id} seed ${seed}: ${actual} vs ${expected}`);
    }
  }
});

test('tier-weighted mean matches the 147,033 held-out headline', () => {
  assert.ok(Math.abs(B.weightedMean() - heldout.weighted_pnl) < ROUNDING_TOLERANCE, `${B.weightedMean()}`);
  const weights = B.cases().reduce((acc, c) => acc + B.caseWeight(c), 0);
  assert.ok(Math.abs(weights - 1) < 1e-12);
});

test('the regular day has zero effect on itself and family deltas add up to the total change', () => {
  B.familyDelta(B.baseline()).forEach((f) => assert.equal(f.mean, 0));
  for (const c of B.cases()) {
    const seed = B.seeds()[0];
    const totalChange = B.totals(c).bySeed[seed] - B.totals(B.baseline()).bySeed[seed];
    const families = B.familyDelta(c).reduce((acc, f) => acc + f.bySeed[0], 0);
    const unowned = B.familyPnl(c, seed).none - B.familyPnl(B.baseline(), seed).none;
    assert.ok(Math.abs(totalChange - families - unowned) < 1e-6, c.id);
  }
});

test('the regular day carries a full trace for every traded product', () => {
  const { owner, every } = B.data();
  for (const product of Object.keys(owner)) {
    const t = B.trace(B.baseline(), product);
    assert.ok(t, product);
    assert.equal(t.mid.length, 10000 / every, product);
    assert.equal(t.pos.length, t.mid.length, product);
    t.pos.forEach((q) => assert.ok(Number.isInteger(q), `${product} position ${q}`));
  }
});

test('each case shows its focus products, and the trace P&L ends at the product P&L', () => {
  const { products, traceSeed } = B.data();
  for (const c of B.cases()) {
    assert.ok(c.focus.length > 0, c.id);
    for (const product of c.focus) {
      const t = B.trace(c, product);
      assert.ok(t && t.pnl, `${c.id} ${product}`);
      const final = c.pnl[String(traceSeed)][products.indexOf(product)];
      // The trace is sampled every 20 ticks, so its last sample is up to 20 ticks before the close.
      assert.ok(Math.abs(t.pnl[t.pnl.length - 1] - final) < Math.max(500, 0.2 * Math.abs(final)), `${c.id} ${product}`);
    }
  }
});

test('S4 direction posterior stays a probability and starts at one half', () => {
  const pup = B.trace(B.baseline(), 'TELLURIUM').sig.pup;
  assert.ok(Math.abs(pup[0] - 0.5) < 1e-9);
  pup.forEach((p) => assert.ok(p >= 0 && p <= 1));
});

test('decode reverses delta encoding with its scale', () => {
  assert.deepEqual(Array.from(B.decode([2, 20001, 1, -2])), [10000.5, 10001, 10000]);
  assert.equal(B.decode(null), null);
});
