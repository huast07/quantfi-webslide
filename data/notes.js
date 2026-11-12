/* The slide list and a plain-language explanation of every slide.
 * One entry per slide, in deck order:
 *   title    name shown in the header, the slide index and the Explain panel
 *   section  agenda section, one of QF.deck.sections
 *   gist     what the slide says, in one or two plain sentences
 *   read     how to read the slide: what each part shows and why it matters
 *   terms    glossary keys (data/glossary.js) for the jargon on the slide
 *   lab      key of the interactive lab that goes deeper, if any
 *   related  other slides that carry the detail or the evidence
 * Text is plain (no HTML); the Explain panel escapes it. */
(function (root) {
  'use strict';
  const QF = (root.QF = root.QF || {});

  const OPENING = 'Opening';
  const INTRO = 'Trading strategy introduction';
  const MARKET = 'Market analysis';
  const DEVELOP = 'Strategy development and testing';
  const ARCH = 'Final algorithm architecture';
  const TRADEOFF = 'Key trade-offs and decisions';
  const PERF = 'Performance and robustness';
  const CLOSING = 'Closing';
  const APPENDIX = 'Appendix';

  const slides = [
    {
      title: '26 assets. 26 different behaviours.', section: OPENING,
      gist: 'The competition has 26 products and each one behaves differently. The deck asks whether one strategy can profit from all of them.',
      read: [
        'The answer the deck builds toward is no: each product gets the strategy that fits its behaviour.',
        'Open the Explain panel on any slide for a plain-language summary and definitions of the terms used.',
      ],
      related: [7, 29],
    },
    {
      title: 'QuantiFi: Exploiting Market Structures', section: OPENING,
      gist: 'Title slide for Team 5. "Market structures" means repeatable patterns in how each product is priced, which is where all of our profit comes from.',
      read: [
        'The team: Jiyoo Noh, Oliver de Boer, Sterling Huang, Kathleen Wu, Krystana Alvear and Alex Zhu.',
        'The patterns themselves are listed on slide 10 and each one becomes a strategy later in the deck.',
      ],
      related: [10],
    },
    {
      title: 'Meet the team', section: OPENING,
      gist: 'The six team members, each with a fun fact.',
      read: [
        'Nothing technical here. The trading content starts on the next slide.',
        'Use the arrow keys, swipe, or the SLIDES button to move around the deck.',
      ],
    },
    {
      title: 'What we achieved', section: OPENING,
      gist: 'The headline results: about 417.7k profit over the three historical days, 21 of 26 products traded, and a profit in every one of 126 held-out test runs.',
      read: [
        '417.7k is the total P&L when the final algorithm is replayed on the three real days of data.',
        '21 / 26: five products were left untraded on purpose, because no strategy showed a reliable edge on them.',
        '126 / 126: 42 synthetic scenarios, each on 3 random seeds the strategy was never tuned on. All 126 runs made money.',
      ],
      terms: ['pnl', 'held-out', 'case', 'seed'],
      related: [27, 13],
    },
    {
      title: 'Agenda', section: OPENING,
      gist: 'The six parts of the talk, from the core idea through to performance.',
      read: [
        'Parts 1 to 3 explain why the strategies exist: the idea, the data analysis and how strategies were selected.',
        'Parts 4 to 6 explain what was built, the trade-offs made and how well it holds up.',
      ],
    },
    {
      title: 'Trading strategy introduction', section: INTRO,
      gist: 'Section divider. This part states the one idea the whole system is built on.',
      read: [
        'The bar at the bottom shows the six agenda sections; the highlighted one is where the talk is.',
        'This section is a single slide: the central idea on the next page.',
      ],
    },
    {
      title: 'Different assets demand different strategies', section: INTRO,
      gist: 'The central idea: no single strategy fits all 26 products, so the work is matching each product to the strategy that best captures its behaviour.',
      read: [
        'Everything after this slide answers the key question: how do we decide which strategy gets which product?',
        'The answer has two halves: find each product\'s pattern in the data (slides 9 and 10), then test candidate strategies against each other (slide 13).',
      ],
      related: [10, 13],
    },
    {
      title: 'Market analysis', section: MARKET,
      gist: 'Section divider. This part shows what the historical data can and cannot support.',
      read: [
        'Two slides follow: the first rules out ideas that do not work here, the second lists the patterns that do.',
        'Each finding has an evidence lab that recomputes it live from the raw data.',
      ],
    },
    {
      title: 'EDA results: The data', section: MARKET,
      gist: 'Four facts about the market that decided what we did not build: the data is clean, the order book does not predict price, most traders are random, and profit comes from structure.',
      read: [
        '01: 780k snapshots with no errors, and each day starts where the last ended, so the three days can be treated as one continuous history.',
        '02: order-book imbalance barely correlates with the next move (below 0.035 on every product), so we built no order-book signal.',
        '03: the other traders are noise bots that trade at the best bid and ask and pay half the spread. That is the income a market maker collects.',
        '04: the profitable patterns are structural (fixed prices, a constant sum, jumps, overpriced options), covered on the next slide.',
      ],
      terms: ['eda', 'order-book', 'imbalance', 'noise-trader', 'spread', 'touch'],
      lab: 'eda-data', related: [10, 12],
    },
    {
      title: 'EDA: Where the profit comes from', section: MARKET,
      gist: 'Six patterns in the data that a random market would not show. Each one is predictable enough to trade and each became a strategy.',
      read: [
        'Fixed anchor and mean reversion: AMETHYST sits at 10,000 and TOFFEE_CAKE keeps returning to about 5,000. Both go to S1, market making (slide 16).',
        'Sum constraint and step-downs: the five pearls add up to 50,000 and GOLDEN_PEARLS moves in steps. Both go to S2 (slide 17).',
        'Big jumps: TELLURIUM jumps 150+ points 8 to 13 times a day, and the jumps tend to go the same way. That goes to S4 (slide 19).',
        'Mispriced options: vouchers cost 20 to 30% more than LYCHEE\'s actual movement justifies. That goes to S3 (slide 18).',
      ],
      terms: ['mean-reversion', 'random-walk', 'pearl-sum', 'jump', 'voucher', 'implied-vol'],
      lab: 'eda', related: [16, 17, 18, 19],
    },
    {
      title: 'Strategy development and testing', section: DEVELOP,
      gist: 'Section divider. This part covers the rules that shaped every strategy and how products were assigned to strategies.',
      read: [
        'Slide 12 gives three rules that follow from how the exchange simulation works.',
        'Slide 13 shows the selection process that decided which 21 products are traded and by which strategy.',
      ],
    },
    {
      title: 'Three shaping rules', section: DEVELOP,
      gist: 'Three rules that come from how this exchange works, and that every strategy follows.',
      read: [
        'Quote at the touch: a resting order fills against any trade at its price, so offering a better price earns no extra fills and only gives away profit.',
        'Estimate fair value, not impact: the order book is regenerated every tick and does not react to our orders, so the whole edge is in knowing what each product is worth.',
        'Trade every edge, all at once: there is no cash limit, only a position limit per product, so every product with a real edge is traded at the same time.',
      ],
      terms: ['touch', 'fair-value', 'position-limit', 'tick'],
      related: [9, 16],
    },
    {
      title: 'Selection in action: 21 products earned a spot', section: DEVELOP,
      gist: 'How products were matched to strategies: six candidate strategies were scored on simulated days, and a product is traded only if its best strategy clears a minimum edge.',
      read: [
        'Left: the process. Score on 84 development days, keep pairs with an edge of at least 500 that are also positive on every real day, give each product one owner, then confirm on 126 new days.',
        'Right: each traded product\'s development edge on a log scale. The dashed line is the 500 minimum. TELLURIUM (62,624) and TOFFEE_CAKE (31,224) lead.',
        'Bottom left: the five products that were cut. Their best scores were FRUIT_BASKET 376, DRAGONFRUIT -34 and MANGOSTEEN -183, all below the bar.',
      ],
      terms: ['dev-edge', 'tier-weighted', 'case', 'seed', 'held-out', 'routing'],
      related: [31, 41],
    },
    {
      title: 'Final algorithm architecture', section: ARCH,
      gist: 'Section divider. This part walks through the system: five strategy families and the orchestrator that coordinates them.',
      read: [
        'Slide 15 is the overview. Slides 16 to 20 take one strategy family each (S1 to S5).',
        'Slides 21 and 22 show how the orchestrator turns their orders into safe, combined orders.',
      ],
    },
    {
      title: 'Overall architecture', section: ARCH,
      gist: 'The system has two phases: offline, where strategies are built and each product is assigned one; and runtime, where those strategies trade every tick through one orchestrator.',
      read: [
        'Top row (before trading): build candidate strategies, backtest and compare them, then fix which strategy owns which product.',
        'Bottom row (every tick): read the market, let each assigned strategy propose orders, and pass them through the orchestrator to the exchange.',
        'The loop at the bottom matters: actual fills and positions feed the next decision, so the system reacts to what really happened, not to what it asked for.',
      ],
      terms: ['routing', 'orchestrator', 'tick'],
      related: [21, 13],
    },
    {
      title: 'Market making', section: ARCH,
      gist: 'S1 earns the spread: it estimates a fair price, rests buy and sell orders at the best prices, and keeps its position small. It made about 97k over the three days.',
      read: [
        'Left: profit by product. TOFFEE_CAKE earns 82,598 of the 97,242 because its price keeps returning to about 5,000, which makes its fair value easy to estimate.',
        'Right: cumulative profit across the three days. It climbs steadily with no losing day, which is what many small spread captures look like.',
        'Bottom: the recipe in three steps. Fair price, quote at the touch, manage inventory.',
      ],
      terms: ['market-making', 'fair-value', 'touch', 'inventory', 'mean-reversion'],
      lab: 's1', related: [33, 34],
    },
    {
      title: 'Structural alpha: Product-specific signals', section: ARCH,
      gist: 'S2 trades the pearls. The five pearl prices add up to 50,000, so when the total drifts, PINK_PEARLS is about to jump back; GOLDEN and BLUE get their own signals.',
      read: [
        'Chart: when the pearl total is above 50,000 (right side), PINK falls over the next 20 ticks; when it is below, PINK rises. The gap from 50,000 forecasts the move.',
        'PINK: estimate how likely the corrective jump is and how big, then trade ahead of it when the expected move beats the cost of crossing the spread.',
        'GOLDEN + BLACK: GOLDEN moves in steps, so a step detector spots one starting and trades the rest of the move. BLUE combines recent momentum with a drift estimate.',
      ],
      terms: ['pearl-sum', 'hazard', 'cusum', 'crossing'],
      lab: 's2', related: [35, 36],
    },
    {
      title: 'S3: Voucher IV mispricing', section: ARCH,
      gist: 'S3 trades the options. Vouchers are priced as if LYCHEE moved 20 to 30% more than it does, so S3 sells the overpriced strikes, buys the cheap ones and hedges away LYCHEE\'s direction.',
      read: [
        'Top chart: each dot is one strike\'s implied volatility; the line is the smooth smile fitted through them. Dots above the line are rich, dots below are cheap.',
        'Bottom chart: the residuals, meaning each voucher\'s price minus its smile price. Blue bars (above zero) are sold, green bars (below zero) are bought.',
        'The signal: 57% of a residual disappears within 120 ticks, so a mispriced strike tends to come back to the curve. We enter when the value gap is above 1.5.',
        'The bottom line is the key: S3 does not bet on which way LYCHEE moves. It hedges that with LYCHEE itself once net exposure passes 50.',
      ],
      terms: ['voucher', 'implied-vol', 'realised-vol', 'smile', 'residual', 'black-scholes', 'delta-hedge'],
      lab: 's3', related: [37],
    },
    {
      title: 'S4: Jump diffusion processes', section: ARCH,
      gist: 'S4 trades TELLURIUM, which mostly drifts quietly but jumps hard several times a day. S4 detects each jump as it happens and bets that the next ones go the same way.',
      read: [
        'Chart: every tick-to-tick price change over one day. Almost all sit in the flat band near zero; the green dots are the jumps, the largest +260.',
        'The dashed lines at ±38.75 are the detection threshold. Anything outside is treated as a jump.',
        'Top right: after each jump S4 updates its estimate of the chance the next jump is up. On this day every jump is up, so it leans long.',
      ],
      terms: ['jump', 'random-walk', 'beta-binomial', 'tick', 'mid'],
      lab: 's4', related: [38],
    },
    {
      title: 'S5: Adaptive allocation', section: ARCH,
      gist: 'S5 decides how much risk each product gets. It gives more room to products with a high expected edge and low volatility, and that rule beat equal sharing by 17.8% in testing.',
      read: [
        'Bar chart: four ways to split the same risk budget, on the same engine. A2 (Kelly) earns 34,040 against 28,894 for equal risk.',
        'The interval under the chart (+3,466 to +6,720) does not include zero, so the gain over equal risk is unlikely to be luck.',
        'Allocation math: a product\'s inventory cap Q grows with its expected edge μ and shrinks with its volatility σ, inside a total risk budget of 800.',
        'Held-out: 34,580 on seeds never used for tuning, with no position-limit breaches and no crashes.',
      ],
      terms: ['kelly', 'risk-budget', 'inventory', 'bootstrap', 'held-out', 'tier-weighted'],
      lab: 's5', related: [39],
    },
    {
      title: 'One centralized orchestrator', section: ARCH,
      gist: 'All five strategies send their orders through one orchestrator. It decides who trades what, combines the orders and makes sure no position limit is ever broken.',
      read: [
        'Route: each product belongs to one strategy, and strategies run independently of each other.',
        'Coordinate: orders for the same product are added together, and fills are tracked back to the strategy that asked for them.',
        'Control: every order is checked against the position limit before it is sent. A breach would cancel all of that product\'s orders for the tick.',
      ],
      terms: ['orchestrator', 'routing', 'netting', 'position-limit'],
      lab: 'orch', related: [22, 32],
    },
    {
      title: 'Illustrative example: TOFFEE_CAKE', section: ARCH,
      gist: 'One order followed through the orchestrator: S1 wants to buy 15 TOFFEE_CAKE, only 10 fit under the limit, 6 actually fill, and the next tick starts from the real position of +46.',
      read: [
        '1 and 2: the position is +40 and the limit is 50, so only 10 more can be bought. The orchestrator cuts the order from 15 to 10.',
        '3: the order for 10 is sent, but the market only fills 6. Asking is not the same as getting.',
        '4: the position becomes +46, counted from the actual fills, leaving 4 lots of room to buy.',
      ],
      terms: ['orchestrator', 'position-limit', 'inventory'],
      lab: 'orch', related: [21, 32],
    },
    {
      title: 'Key trade-offs and decisions', section: TRADEOFF,
      gist: 'Section divider. This part explains why the slightly less profitable version was the one submitted.',
      read: [
        'One slide follows, comparing the selected version 3 against version 4.',
        'The theme is stability: a higher worst case was preferred over a slightly higher average.',
      ],
    },
    {
      title: 'Stability vs. P&L', section: TRADEOFF,
      gist: 'Version 4 earned about 1% more on average, but version 3 was submitted: it holds up better on a bad day, trades only products with a proven edge, and runs faster.',
      read: [
        'Each pair of bars compares version 3 (light, selected) with version 4 (green).',
        'Mean held-out P&L is nearly equal (147,033 vs 148,792), but version 3\'s worst seed is higher (83,670 vs 80,674). A higher floor was worth more than a slightly higher average.',
        'Version 4 traded 24 products instead of 21 and took 3.2 ms per tick instead of 2.3 ms. The extra three products did not earn their risk.',
        'Right: the five design choices behind version 3 and what each one bought.',
      ],
      terms: ['held-out', 'seed', 'routing', 'latency', 'adverse-selection'],
      related: [13, 27],
    },
    {
      title: 'Performance and robustness', section: PERF,
      gist: 'Section divider. This part shows how the algorithm was tested, what it earned and where it could fail.',
      read: [
        'Slide 26 describes the custom backtesting platform and its assumptions.',
        'Slide 27 gives the results and slide 28 lists the known weaknesses.',
      ],
    },
    {
      title: 'Custom backtesting platform', section: PERF,
      gist: 'We built our own simulator to test beyond the three real days: 42 synthetic versions of the next day, each changing one thing about the market.',
      read: [
        'Key details: each product\'s behaviour is calibrated to the patterns found in the data analysis, then each case applies one outside change to it.',
        'Underlying assumptions: nobody trades on better information, execution time costs nothing, and bots and prices behave tomorrow as they did before.',
        'The note at the bottom is a real limit: these assumptions hold in this competition, not in real markets.',
      ],
      terms: ['case', 'seed', 'noise-trader'],
      lab: 'backtest', related: [27, 28],
    },
    {
      title: 'Backtesting results', section: PERF,
      gist: 'Two independent tests agree. On the official platform the algorithm made 417,529 over three days; on our own suite it beat the reference in all 42 scenarios.',
      read: [
        'Left: the official platform. 131k to 154k per day, and the cumulative line climbs steadily across all three days.',
        'Right: our synthetic suite. Each bar is one scenario\'s mean daily profit, sorted from best (a TELLURIUM storm, about 337k) to worst (a quiet day, about 123k).',
        'Even the worst scenario is profitable and above the reference strategy, which is the robustness claim.',
        'TELLURIUM is the best product and LYCHEE the worst in both tests. LYCHEE loses a little because it is used as the hedge for the vouchers.',
      ],
      terms: ['pnl', 'case', 'seed', 'held-out', 'delta-hedge'],
      lab: 'backtest', related: [26, 42],
    },
    {
      title: 'Limitations: Where our edge could break down', section: PERF,
      gist: 'Four ways the strategy could fail, what protects against each today, and what we would do next.',
      read: [
        'Read each row left to right: the risk, the current safeguard, the next improvement.',
        'Market regime changes and concentrated alpha are the biggest: the patterns could stop holding, and a large share of profit comes from a few products.',
        'Execution model risk is specific to simulation: real markets have queues, slippage and delay that this exchange does not.',
      ],
      terms: ['adverse-selection', 'position-limit', 'latency', 'attribution'],
      related: [42, 26],
    },
    {
      title: '26 assets. 26 micro-markets.', section: CLOSING,
      gist: 'The closing answer to the opening question: not one strategy for everything, but a specialist for each product, run as one coordinated system.',
      read: [
        'It mirrors slide 1: "26 different behaviours" became "26 micro-markets", each matched to the strategy that fits it.',
        '"One coordinated system" is the orchestrator: specialised strategies, shared execution and central risk control.',
      ],
      related: [1, 21],
    },
    {
      title: 'Thank you', section: CLOSING,
      gist: 'End of the main talk. The appendix slides that follow carry the detail behind each strategy.',
      read: [
        'Appendices A and B cover selection and execution; C to I cover strategies S1 to S5 in depth.',
        'Appendix J explains why the fruit basket was not traded and K shows where the profit came from.',
      ],
    },
    {
      title: 'Appendix A: Strategy selection and validation', section: APPENDIX,
      gist: 'The four checks every strategy and product pair had to pass before it was allowed to trade.',
      read: [
        'Backtest every candidate strategy on every product, then keep only pairs that made money on the real training days.',
        'Validate: the pair must also earn at least 500 a day on the simulated development suite.',
        'Assign: where several strategies qualify for one product, the best one becomes its single owner.',
      ],
      terms: ['dev-edge', 'routing', 'case'],
      related: [13],
    },
    {
      title: 'Appendix B: Execution mechanics and risk controls', section: APPENDIX,
      gist: 'The three rules the orchestrator applies every tick, written as formulas: add up the orders, keep inside the limit, and count only real fills.',
      read: [
        '1. Order netting: the order sent for product i is the sum of what every strategy k proposed for it.',
        '2. Position limits: the current position q plus the new order must stay between -L and +L, so the order is clipped if needed.',
        '3. Fill attribution: the next position is the old position plus what actually filled (f), not what was submitted.',
      ],
      terms: ['netting', 'position-limit', 'orchestrator'],
      lab: 'orch', related: [21, 22],
    },
    {
      title: 'Appendix C: S1 fair-value models and quoting', section: APPENDIX,
      gist: 'The detail behind S1: how fair value is estimated for each of its products, how it quotes, and what stops it when the price misbehaves.',
      read: [
        'Each row is one product group, read left to right: the signal it uses, how it trades, and its risk guard.',
        'AMETHYST uses a fixed 10,000. TOFFEE_CAKE uses a filter that pulls its estimate toward 5,000. LANTERNS and WHITE_PEARLS use a smoothed price.',
        'Bottom formula: quote size is the edge after inventory cost, divided by a risk factor, and never targets more than 80% of the position limit.',
      ],
      terms: ['fair-value', 'touch', 'mean-reversion', 'thompson', 'inventory', 'position-limit'],
      lab: 's1', related: [16, 34],
    },
    {
      title: 'Appendix D: S1 market making logic', section: APPENDIX,
      gist: 'The two models under S1\'s fair value: a price pulled back to a fixed level, and a version where that level is allowed to move slowly.',
      read: [
        'Left: the OU process. The price (black) keeps crossing a constant mean (dashed), like a dog on a leash. θ sets how hard it is pulled back and σ how noisy it is.',
        'Right: when the level itself drifts, the mean is updated a little each tick toward the latest price (weight α), so the anchor follows a trend instead of fighting it.',
        'Spread = Base + κ · Vol: quotes are set wider when the market is more volatile, to be paid more for the extra risk.',
      ],
      terms: ['ou', 'mean-reversion', 'ewma', 'spread', 'market-making'],
      lab: 's1', related: [16, 33],
    },
    {
      title: 'Appendix E: S2 signal models and trading decisions', section: APPENDIX,
      gist: 'The detail behind S2: one model per pearl product, each with its signal, its trading rule and its safeguard.',
      read: [
        'PINK formula: expected move = chance the jump arrives within H ticks × slope β × current deviation d. S2 trades only when that beats the cost of crossing.',
        'GOLDEN + BLACK: R is the part of the step still to come, the expected full step given what has been seen minus the move already made.',
        'BLUE: the target position scales with smoothed momentum, and a guard stops it when a fast trend contradicts the signal.',
      ],
      terms: ['pearl-sum', 'hazard', 'cusum', 'crossing'],
      lab: 's2', related: [17, 36],
    },
    {
      title: 'Appendix F: S2 validation of PINK corrective jumps', section: APPENDIX,
      gist: 'Evidence that the PINK pattern is real: it shows up on every day separately, and nearly all of it comes from the jumps S2 is built to catch.',
      read: [
        'Left: PINK\'s average move over the next 20 ticks, grouped by how far the pearl total is from 50,000. The same downward slope appears on each day and pooled.',
        'Right: the same effect split in two. The blue dots (detected jumps) carry it; the green dots (ordinary moves) sit at zero.',
        'The bars are 95% intervals from a bootstrap. The caveat at the bottom is honest: overlapping 20-tick windows are not independent, so the pooled chart is descriptive.',
      ],
      terms: ['pearl-sum', 'jump', 'bootstrap', 'tick'],
      lab: 's2', related: [17, 35],
    },
    {
      title: 'Appendix G: S3 risk and trade', section: APPENDIX,
      gist: 'The detail behind S3: how it values and trades each voucher, how it hedges with LYCHEE, and which ideas were tested and switched off.',
      read: [
        'Top row: the value of a voucher is its smile price plus the share of the residual expected to remain (about 0.43). S3 takes prices at least 1.5 through that value.',
        'Middle row: the hedge. Net exposure to LYCHEE is kept inside a band of ±50 rather than hedged to zero every tick, which saves on spread.',
        'Tiles: 162.4k over the three real days (38.9% of the total, the largest family), profitable on all three, with no limit breaches.',
      ],
      terms: ['voucher', 'smile', 'residual', 'delta-hedge', 'implied-vol', 'position-limit'],
      lab: 's3', related: [18],
    },
    {
      title: 'Appendix H: S4 jump model mechanics', section: APPENDIX,
      gist: 'The three parts of S4: which way the next jump is likely to go, how the price behaves right after a jump, and how long to hold the position.',
      read: [
        'Directional tilt: counts up jumps versus down jumps to estimate the chance the next one is up. After three jumps one way it is about 0.9; on mixed days it stays near 0.5 and S4 stands aside.',
        'Drift rider: the price follows a typical path after a jump, measured from history, and this part trades that path.',
        'Horizon: the position is the expected move divided by risk (γ times variance), using whichever holding period from 10 to 2,000 ticks gives the best ratio.',
      ],
      terms: ['jump', 'beta-binomial', 'kelly', 'tick'],
      lab: 's4', related: [19],
    },
    {
      title: 'Appendix I: S5 adaptive allocation', section: APPENDIX,
      gist: 'The detail behind S5: how it estimates each product\'s edge and volatility live, turns them into position caps, and where the gain over equal risk came from.',
      read: [
        'Online estimates: edge μ is how often we get filled × size × how good the fills were, plus any signal edge. Volatility σ is measured with quote noise removed.',
        'Allocation and guards: caps are clipped to position limits, unused risk is handed to other products, and shares move slowly so one noisy tick cannot swing them.',
        'Chart: the +5,146 gain over equal risk is mostly TOFFEE_CAKE (+6,925), partly given back on PINK (-1,937).',
        'Tiles: in the final algorithm S5 owns only JELLY; the other numbers are for S5 running alone.',
      ],
      terms: ['kelly', 'risk-budget', 'markout', 'position-limit', 'held-out', 'tier-weighted'],
      lab: 's5', related: [20],
    },
    {
      title: 'Appendix I: S5 (part 2)', section: APPENDIX,
      gist: 'A continuation of the S5 appendix. It currently repeats the previous slide, so the same reading applies.',
      read: [
        'μ is the expected edge per product and σ its volatility; each product\'s cap is its share of the 800 risk budget divided by its volatility.',
        'The S5 lab lets you change the edge and volatility of each product and watch the allocation move.',
      ],
      terms: ['kelly', 'risk-budget'],
      lab: 's5', related: [20, 39],
    },
    {
      title: 'Appendix J: Fruit basket', section: APPENDIX,
      gist: 'Why the fruit basket was not traded: the classic basket-versus-parts trade costs about 15 ticks to put on, but the mispricing it captures is only about 3.6 ticks.',
      read: [
        'Dark box: the cost of trading one basket against its parts. Seven lots across four order books add up to 15 ticks one way, 30 for a round trip.',
        'The green number is the short-term swing in the basket premium, about 3.6 ticks. Paying 15 to capture 3.6 loses money.',
        'Right: the parts explain only 64 to 78% of the basket\'s moves, so the hedge is leaky, and the parts trade so thinly (about 2 lots per print) that size is hard to get.',
      ],
      terms: ['basket', 'crossing', 'spread', 'random-walk'],
      related: [13],
    },
    {
      title: 'Appendix K: Performance attribution', section: APPENDIX,
      gist: 'Where the 417,529 came from. Three strategy groups each earned a meaningful share, but profit is not spread evenly.',
      read: [
        'Bar: S1 market making about 23%, S3 vouchers about 39%, and S2 + S4 + S5 together about 38%.',
        'Right: the two largest disclosed sources. The voucher strategy is 38.9% of the total and TOFFEE_CAKE alone is 19.8%.',
        'This is the "concentrated alpha" risk from slide 28: if the voucher mispricing closed, over a third of the profit would go with it.',
      ],
      terms: ['attribution', 'pnl'],
      related: [27, 28, 16, 18],
    },
  ];

  QF.deck = {
    sections: [OPENING, INTRO, MARKET, DEVELOP, ARCH, TRADEOFF, PERF, CLOSING, APPENDIX],
    slides,
  };
})(typeof window !== 'undefined' ? window : globalThis);
