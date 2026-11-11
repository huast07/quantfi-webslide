/* EDA evidence tests: each finding on slides 9 and 10 must hold in the data and sit far from its
 * no-structure baseline. Run with: node --test slideshow/lab/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../data/eda.js');
require('../data/lab-data.js');
require('./core.js');
require('./models-s2.js');
require('./models-s3.js');
require('./models-s4.js');
require('./models-eda.js');
const QF = globalThis.QF;
const E = QF.eda;

test('fixed anchor: AMETHYST only ever shows 9,999.5, 10,000 and 10,000.5, far inside a random walk', () => {
  const a = E.anchor();
  assert.deepEqual(a.values.map((v) => v.value), [9999.5, 10000, 10000.5]);
  assert.equal(a.maxDev, 0.5);
  assert.ok(a.randomWalkSd > 20 * a.maxDev, `random walk ${a.randomWalkSd}`);
});

test('mean reversion: TOFFEE 2,000-tick moves are under a third of a random walk and excursions return', () => {
  const [far] = E.horizonSpread('toffee', [2000]);
  assert.ok(far.actual < far.randomWalk / 3, `${far.actual} vs ${far.randomWalk}`);
  const [one] = E.horizonSpread('toffee', [1]);
  assert.ok(Math.abs(one.actual - one.randomWalk) < 1e-9, 'the baseline is calibrated on 1-tick moves');
  assert.ok(E.reversion('toffee', 5000, 20, 500).share > 0.95);
});

test('sum constraint: the five-pearl total stays near 50,000 and PINK leads the restoring moves', () => {
  const all = E.pearlSum();
  assert.ok(all.lo > 49980 && all.hi < 50020, `${all.lo}-${all.hi}`);
  assert.ok(Math.max(...all.pearls.map((p) => p.width)) > 20 * all.width);
  assert.ok(E.pearlSum(E.PEARLS.slice(1)).width > 100, 'dropping PINK breaks the constraint');
  const r = E.restoration(5);
  assert.ok(r.pinkShare > 0.8 && r.pinkShare > 3 * r.equalShare, `PINK share ${r.pinkShare}`);
  assert.equal(r.pinkJumpsRestoring, r.pinkJumps);
});

test('step-downs: GOLDEN has three ramps and a 5-point trigger leaves most of each move ahead', () => {
  const g = E.goldenSteps();
  assert.equal(g.steps.length, 3);
  assert.ok(g.calmShare > 0.99);
  const early = E.stepDetection(g.steps, 5);
  const late = E.stepDetection(g.steps, 40);
  early.forEach((s, i) => {
    assert.ok(s.remainingShare > 0.85, `step ${i} early ${s.remainingShare}`);
    assert.ok(late[i].remainingShare < s.remainingShare, 'a larger trigger gives more of the move away');
  });
});

test('big jumps: TELLURIUM has 8 / 9 / 13 jumps that normal tails cannot produce', () => {
  const counts = QF.DAYS.map((d) => E.jumpEvidence(d, 50));
  assert.deepEqual(counts.map((j) => j.jumps.length), [8, 9, 13]);
  counts.forEach((j) => {
    assert.ok(j.expected < 1e-6, `expected ${j.expected}`);
    assert.ok(j.kurtosis > 100);
  });
  assert.ok(counts[1].sameSideP < 0.01, 'day -1: 9 of 9 up is not chance');
  assert.ok(counts[2].sameSideP > 0.5, 'day 0 is mixed');
});

test('binomial tail: 9 of 9 the same way has two-sided probability 2 / 512', () => {
  assert.ok(Math.abs(E.binomialTail(9, 9) - 2 / 512) < 1e-12);
  assert.equal(E.binomialTail(4, 2), 1);
});

test('mispriced options: voucher implied vol is 15-35% above LYCHEE realised vol on every day', () => {
  QF.DAYS.forEach((d) => {
    const v = E.volEvidence(d);
    assert.ok(v.ratio > 1.15 && v.ratio < 1.35, `day ${d}: ${v.ratio}`);
  });
});

test('slide 9: days join up, imbalance stays under 0.035 and prints sit at the touch', () => {
  const gaps = E.continuity().flatMap((r) => r.gaps.map(Math.abs)).sort((a, b) => a - b);
  assert.equal(E.continuity().length, 26);
  assert.ok(gaps[Math.floor(gaps.length / 2)] < 1.5, 'median overnight gap is an ordinary move');
  for (const p of ['toffee', 'pink', 'tellurium']) {
    for (const h of [1, 10, 100]) assert.ok(Math.abs(E.imbalanceCorrelation(p, h).corr) < 0.035, `${p} h=${h}`);
  }
  for (const p of ['toffee', 'pink']) {
    const t = E.tradePrints(p);
    assert.ok(t.atTouchShare > 0.95, `${p} at touch ${t.atTouchShare}`);
    assert.ok(t.meanEdge > 0.5 * t.meanHalf, `${p} maker keeps the spread`);
  }
});

test('correlation helper returns 1, -1 and 0 on simple series', () => {
  assert.ok(Math.abs(E.correlation([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
  assert.ok(Math.abs(E.correlation([1, 2, 3], [3, 2, 1]) + 1) < 1e-12);
  assert.equal(E.correlation([1, 1, 1], [1, 2, 3]), 0);
});
