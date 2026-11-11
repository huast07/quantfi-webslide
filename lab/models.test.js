/* Model tests for the strategy labs. They pin the replays to the statistics quoted on the
 * slides and in the strategy notes. Run with: node --test slideshow/lab/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../data/lab-data.js');
require('./core.js');
require('./models-s1.js');
require('./models-s2.js');
require('./models-s3.js');
require('./models-s4.js');
require('./models-s5.js');
const QF = globalThis.QF;

test('core decodes doubled delta prices back to half-tick prices', () => {
  const book = QF.book('-1', 'toffee');
  assert.equal(book.mid.length, 10000);
  for (let t = 0; t < 50; t++) assert.ok(book.ask[t] > book.bid[t]);
});

test('S1 OU forecast closes (1 - (1 - kappa)^h) of the gap and half-life is ~150 ticks', () => {
  const half = QF.s1.halfLife(0.0046);
  assert.ok(Math.abs(half - 150) < 1, `half-life ${half}`);
  assert.ok(Math.abs(QF.s1.forecast(4980, 5000, 0.0046, half) - 4990) < 1e-9);
});

test('S1 TOFFEE replay is profitable on every real day without breaching the limit', () => {
  for (const day of QF.DAYS) {
    const r = QF.s1.replay(day);
    assert.ok(r.pnl.at(-1) > 15000, `day ${day} pnl ${r.pnl.at(-1)}`);
    assert.ok(r.position.every((q) => Math.abs(q) <= 50));
  }
});

test('S2 worked example: D = 12, h = 0.05, beta = -1.1 gives P ~ 0.64 and E ~ -8.5', () => {
  assert.ok(Math.abs(QF.s2.jumpProbability(0.05, 20) - 0.6415) < 1e-3);
  assert.ok(Math.abs(QF.s2.expectedMove(12, 0.05, -1.1, 20) + 8.47) < 0.02);
});

test('S2 fits beta ~ -1.1 and the bucket hazards from the raw data', () => {
  const beta = QF.s2.fitBeta(QF.s2.jumps(QF.DAYS));
  assert.ok(beta < -1.05 && beta > -1.15, `beta ${beta}`);
  const [calm, mid, wide] = QF.s2.fitHazards(QF.DAYS);
  assert.ok(calm.h < 0.001 && mid.h > 0.008 && mid.h < 0.012 && wide.h > 0.05 && wide.h < 0.08);
});

test('S2 evidence reproduces the slide-17 pattern: PINK moves against the deviation', () => {
  const ev = QF.s2.evidence(QF.DAYS, 20);
  assert.ok(ev[0].mean > 4 && ev[5].mean < -6);
  for (let k = 1; k < ev.length; k++) assert.ok(ev[k].mean < ev[k - 1].mean);
});

test('S3 smile IVs sit near 0.02 and residual sd is widest in the 7,300-7,600 strikes', () => {
  const snap = QF.s3.snapshot('-1', 250);
  for (const row of snap.rows) assert.ok(row.iv > 0.015 && row.iv < 0.03, `${row.K}: ${row.iv}`);
  const stats = QF.s3.residualStats(QF.s3.residuals('-1'));
  const widest = stats.reduce((best, s, i) => (s.sd > stats[best].sd ? i : best), 0);
  assert.ok([3, 4, 5, 6].includes(widest));
  for (const s of stats) assert.ok(s.phiTick > 0.98 && s.phiTick < 0.999);
});

test('S3 implied vol inverts Black-Scholes', () => {
  const price = QF.s3.bs(7500, 7400, 6, 0.019).price;
  assert.ok(Math.abs(QF.s3.impliedVol(price, 7500, 7400, 6) - 0.019) < 1e-6);
});

test('S4 detector finds 8 / 9 / 13 jumps with the slide-20 direction pattern', () => {
  const expected = { '-2': [8, 1], '-1': [9, 9], 0: [13, 6] };
  for (const day of QF.DAYS) {
    const { jumps } = QF.s4.detect(QF.book(day, 'tellurium').mid);
    const up = jumps.filter((j) => j.dir > 0).length;
    assert.deepEqual([jumps.length, up], expected[day], `day ${day}`);
    assert.ok(Math.min(...jumps.map((j) => j.size)) >= 77.5);
  }
});

test('S4 direction posterior moves to ~0.9 after 3 one-way jumps and stays near 0.5 when mixed', () => {
  assert.ok(QF.s4.directionPosterior(3, 0).pUp > 0.85);
  assert.ok(Math.abs(QF.s4.directionPosterior(6, 7).pUp - 0.5) < 0.05);
});

test('S4 simulated day matches the slide-20 caption: 9 jumps, all up', () => {
  const { jumps } = QF.s4.detect(QF.s4.simulate().mid);
  assert.equal(jumps.length, 9);
  assert.ok(jumps.every((j) => j.dir > 0));
});

test('S5 allocation respects the risk budget and every limit', () => {
  const products = window.labData.allocation.map((s) => ({ ...s, mu: QF.s5.defaultMu(s) }));
  for (const rule of Object.keys(QF.s5.RULES)) {
    const { caps, risk } = QF.s5.allocate(products, rule, 300);
    assert.ok(risk <= 300 + 1e-6, `${rule} risk ${risk}`);
    caps.forEach((q, i) => assert.ok(q <= products[i].limit + 1e-9));
  }
});

test('S5 Kelly maximiser is mu / (lambda sigma^2)', () => {
  const q = QF.s5.kellyQ(3, 2, 1);
  assert.equal(q, 0.75);
  assert.ok(QF.s5.utility(q, 3, 2, 1) > QF.s5.utility(q + 0.1, 3, 2, 1));
});

test('orchestrator reproduces slide 23: +40, buy 15 -> 10, fill 6 -> +46 with 4 lots of room', () => {
  const r = QF.s5.orchestrate({ position: 40, limit: 50, proposal: 15, filled: 6 });
  assert.deepEqual([r.approved, r.fill, r.next, r.buyRoom], [10, 6, 46, 4]);
});
