# QuantiFi interactive presentation

Open `index.html` in a browser.
It works straight from the file system, with no server or build step.
The published copy is at https://huast07.github.io/quantfi-webslide/ and works on phones too.
On a touch screen, swipe left or right on the slide to change slides.

## Slides

The 38 slide backgrounds are rendered from `Team05Quantifi2026.pptx` (exported to PDF) in the original order and proportions.
The chart marked "EXPLORE" on slide 27 is an interactive SVG chart backed by saved project data.
Select a chart to explore asset, day, range, smoothing, P&L, position, or held-out scenarios where available.
The held-out product attribution is an aggregate across cases and seeds, not scenario-specific.

Range and smoothing alter the display only; they do not rerun the backtester.
The scenario chart uses held-out seeds 3-5; the original slide's five-seed metric covers a different set.

Slide 19 (S4) carries its own chart in the slide image, and the S4 lab shows TELLURIUM from the real price data and a simulated day, with the jump detector drawn on top.
The blank appendix slides 37 (S4) and 38 (S5) are filled from `Trading_Algorithm/strategies/S4/NOTES.md` and `S5/NOTES.md` in the style of the other appendix slides.

## EDA evidence labs

Slides 9 and 10 open evidence labs that show how each EDA finding was reached, not just the data behind it.
Click any card or chart on those slides (the small ↗ chip marks each one), or use SEE THE EVIDENCE in the footer dock.

Each finding is walked through the same five-step chain.

1. **Question:** what we asked of the data.
2. **If there were no structure:** what a random walk, independent prices, instant gaps, normal tails or fairly priced options would produce.
3. **What the data shows:** the statistic recomputed live, with sliders to test how robust it is.
4. **So we concluded:** the claim the gap between data and baseline supports, including its limits.
5. **Which became:** the strategy and slides that exploit it.

Slide 9 covers data continuity, order-book imbalance and trade flow, which explain what we chose not to build.
Slide 10 covers the fixed anchor, mean reversion, the pearl sum, GOLDEN step-downs, TELLURIUM jumps and voucher implied volatility, which explain what we did build.
The SCORECARD tab puts all nine findings next to their baselines in one table.

## Backtest lab

Slides 26 and 27 open a lab that shows what each of the 42 synthetic day-1 cases does and how the submitted trader reacts.
It runs the real `Trading_Algorithm/trader2.py`, not a re-implementation, through the backtester's unmodified `prosperity3bt` engine on seeds 3, 4 and 5.
Every case changes one thing from the regular day on the same random numbers, so case minus regular day is the exact effect of that change.

- **Case board:** every case ranked by how much it moved mean daily P&L against the regular day.
- **Market:** how the case changed each product's price, spread, prints and volatility.
- **Reaction:** price, position, P&L and the owning strategy's own belief (fair value, TELLURIUM's direction posterior, fitted implied volatility, JELLY's risk share), read from the trader's state.
- **Seeds:** the change per strategy on each seed, to separate the case from luck.
- **Case map:** every case against every strategy.
- **Case in action:** a playable replay of the case day against the regular day.

The lab data reproduces every held-out figure on slide 27 to within floating-point rounding, which the tests check.

## Strategy labs

On slides 16-22 and the appendices 33-38 a LAB dock appears in the footer (slides 26 and 27 have the backtest lab described above).
Each lab has two tabs.

- **Derivation** walks through the model one step at a time, with sliders that recompute each formula and chart from the real data.
- **Strategy in action** replays a simplified version of the strategy on the real order books for days -2, -1 and 0, with play, scrub and speed controls.

| Lab | Slides | Derivation | In action |
|---|---|---|---|
| S1 | 16, 33 | OU fair value, reservation price, when to cross | TOFFEE_CAKE quoting and takes |
| S2 | 17, 34, 35 | pearl-sum deviation, slope β, hazard, expected move, GOLDEN CUSUM | PINK_PEARLS corrective trades |
| S3 | 18, 36 | implied vol, smile fit, residual AR(1), reservation curve | one delta-hedged voucher strike |
| S4 | 19, 37 | jump detector, Beta-Binomial direction posterior, tilt sizing | DirectionTilt on TELLURIUM |
| S5 | 20, 38 | Kelly size, risk shares Q = B·w/σ | allocator comparing EQ, A1, A2 and A3 |
| Orchestrator | 21, 22 | routing, netting and limit clipping | the slide 22 TOFFEE_CAKE walkthrough |

The replays are simplified re-implementations written for teaching.
They trade against the recorded books and prints, but they are not the submitted algorithm or the backtester, so their P&L differs from the slide figures.
Each lab's note states what is simplified and quotes the backtested numbers for comparison.

## Code layout

- `deck.js` and `deck.css` run the slide deck and dispatch a `slidechange` event.
- `swipe.js` adds touch swipe navigation by pressing the same footer buttons as the arrow keys.
- `data/lab-data.js` holds the price and trade data for the labs, generated by `tools/build_lab_data.py`.
- `lab/core.js` decodes that data and holds shared math helpers.
- `lab/models-s1.js` to `lab/models-s5.js` are the pure strategy models, `lab/models-eda.js` holds the EDA statistics and baselines, and `lab/models-backtest.js` decodes and compares the backtest cases.
- `data/case-data.js` holds the backtest cases, generated by `tools/build_case_data.py`.
- `lab/charts.js` draws the SVG charts and `lab/kit.js` holds small layout helpers.
- `lab/ui.js` builds the lab dialog and `lab/lab-*.js` define each lab.
- `lab/inline.js` mounts the footer dock, the slide 9 and 10 evidence hotspots, and the appendix content for slides 37 and 38.

All scripts are plain browser scripts on a shared `window.QF` namespace, so the deck still opens from `file://`.

## Maintenance

Rebuild the lab data after the price CSVs change:

```sh
python3 slideshow/tools/build_lab_data.py
```

Rebuild the backtest case data after the trader or the backtester changes (about an hour on 8 cores; runs are cached in `tools/.case-cache`):

```sh
cd backtester && uv run python ../slideshow/tools/build_case_data.py
```

Run the model, EDA evidence and backtest tests with Node 18 or later:

```sh
node --test slideshow/lab/
```
