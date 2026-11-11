/* S1 model: TOFFEE_CAKE mean-reversion market maker, a simplified replay of the
 * MeanRevertMaker described in Trading_Algorithm/strategies/S1/NOTES.md. */
(function (root) {
  'use strict';
  const QF = root.QF;

  const DEFAULTS = Object.freeze({
    kappa: 0.0046,       // OU reversion speed per tick (half-life ~150 ticks)
    hold: 50,            // forecast horizon H in ticks (OU_HOLD_TICKS)
    gain: 0.5,           // fair-value filter gain (EWMA span 3)
    anchorSpan: 3000,    // slow EWMA that learns the anchor
    anchorPrior: 5000,   // prior for the anchor mu
    penalty: 0.175,      // inventory penalty per lot = half spread / (0.8 x limit)
    takeBandMult: 4,     // takes use penalty / 4 (TAKE_BAND_MULT)
    takeHurdle: 2,       // price edge required before crossing the spread
    limit: 50,
  });

  /** E[F(t+h) | F(t)] for an OU process with per-tick reversion kappa. */
  function forecast(fair, anchor, kappa, h) {
    return fair + (1 - Math.pow(1 - kappa, h)) * (anchor - fair);
  }

  const halfLife = (kappa) => Math.log(2) / -Math.log(1 - kappa);

  /** Target inventory when trading at `price`, valuing inventory at `value`. */
  const targetAt = (value, price, penalty) => (value - price) / penalty;

  function printsByTick(trades) {
    const map = new Map();
    for (const trade of trades) {
      if (!map.has(trade.tick)) map.set(trade.tick, []);
      map.get(trade.tick).push(trade);
    }
    return map;
  }

  /** Replay one real day. Returns per-tick series plus the list of fills. */
  function replay(day, overrides = {}) {
    const p = { ...DEFAULTS, ...overrides };
    const b = QF.book(day, 'toffee');
    const prints = printsByTick(b.trades);
    const n = b.mid.length;
    const out = {
      mid: b.mid, bid: b.bid, ask: b.ask,
      fair: new Float64Array(n), anchor: new Float64Array(n), forecast: new Float64Array(n),
      position: new Float64Array(n), pnl: new Float64Array(n), fills: [],
    };
    const anchorAlpha = QF.ewmaAlpha(p.anchorSpan);
    const takePenalty = p.penalty / p.takeBandMult;
    let fair = b.mid[0];
    let anchor = p.anchorPrior;
    let q = 0;
    let cash = 0;

    const trade = (t, side, price, qty, kind) => {
      if (qty <= 0) return;
      q += side * qty;
      cash -= side * qty * price;
      out.fills.push({ tick: t, side, price, qty, kind });
    };

    for (let t = 0; t < n; t++) {
      const mid = b.mid[t];
      fair += p.gain * (mid - fair);
      anchor += anchorAlpha * (mid - anchor);
      const value = forecast(fair, anchor, p.kappa, p.hold);

      // Aggressive takes: only when the book is through the forecast by the hurdle.
      if (b.ask[t] <= value - p.takeHurdle) {
        const target = Math.floor(targetAt(value - p.takeHurdle, b.ask[t], takePenalty));
        trade(t, 1, b.ask[t], Math.min(b.askVol[t], target - q, p.limit - q), 'take');
      } else if (b.bid[t] >= value + p.takeHurdle) {
        const target = Math.ceil(targetAt(value + p.takeHurdle, b.bid[t], takePenalty));
        trade(t, -1, b.bid[t], Math.min(b.bidVol[t], q - target, p.limit + q), 'take');
      }

      // Passive quotes at the touch, sized by the distance to the target inventory.
      const bidSize = QF.clip(Math.floor(targetAt(value, b.bid[t], p.penalty)) - q, 0, p.limit - q);
      const askSize = QF.clip(q - Math.ceil(targetAt(value, b.ask[t], p.penalty)), 0, p.limit + q);
      let bidLeft = bidSize;
      let askLeft = askSize;
      for (const print of prints.get(t) || []) {
        if (print.price <= b.bid[t] && bidLeft > 0) {
          const qty = Math.min(print.qty, bidLeft);
          trade(t, 1, b.bid[t], qty, 'passive');
          bidLeft -= qty;
        } else if (print.price >= b.ask[t] && askLeft > 0) {
          const qty = Math.min(print.qty, askLeft);
          trade(t, -1, b.ask[t], qty, 'passive');
          askLeft -= qty;
        }
      }

      out.fair[t] = fair;
      out.anchor[t] = anchor;
      out.forecast[t] = value;
      out.position[t] = q;
      out.pnl[t] = cash + q * mid;
    }
    return out;
  }

  QF.s1 = { DEFAULTS, forecast, halfLife, targetAt, replay };
})(typeof window !== 'undefined' ? window : globalThis);
