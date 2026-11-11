/* Strategy lab dialog: a derivation stepper and a real-data replay with playback.
 * Each lab registers a definition with QF.labs.register(key, definition):
 *   { kicker, title, evidence, source,
 *     steps: [{ title, controls, render(p) -> html }],
 *     replay: { label, controls, run(p) -> result, length(result), view(result, i, p) -> {panels, fullWidth?, stats, event}, note }
 *          or { label, controls, render(p) -> html, note }   (static interactive panel)
 *   }
 * A control is { id, label, type: 'range' | 'select', min, max, step, value, options: [[value, label]], format }. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const { esc } = QF.chart;
  const registry = new Map();
  const SPEEDS = [[10, '0.5×'], [25, '1×'], [60, '2×'], [150, '5×']];
  const RERUN_DELAY_MS = 120;

  let dialog = null;
  let lab = null;
  let stepIndex = 0;
  let stepParams = {};
  let replayParams = {};
  let result = null;
  let cursor = 0;
  let playing = false;
  let speed = SPEEDS[1][0];
  let frame = 0;
  let rerunTimer = 0;

  const $ = (sel) => dialog.querySelector(sel);

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'lab';
    dialog.setAttribute('aria-labelledby', 'labTitle');
    dialog.innerHTML = `
      <header class="lab-head">
        <div><p class="lab-kicker"></p><h2 id="labTitle" class="lab-title"></h2></div>
        <button class="lab-close" aria-label="Close strategy lab">×</button>
      </header>
      <p class="lab-evidence"></p>
      <div class="lab-tabs" role="tablist">
        <button role="tab" data-tab="derive" aria-selected="true">① Derivation</button>
        <button role="tab" data-tab="replay" aria-selected="false"></button>
      </div>
      <section class="lab-derive" role="tabpanel">
        <ol class="lab-steps"></ol>
        <article class="lab-step">
          <h3 class="lab-step-title"></h3>
          <div class="lab-controls lab-step-controls"></div>
          <div class="lab-step-body"></div>
          <footer class="lab-step-nav"><button data-step="-1">← Previous</button><span class="lab-step-count"></span><button data-step="1">Next →</button></footer>
        </article>
      </section>
      <section class="lab-replay" role="tabpanel" hidden>
        <div class="lab-controls lab-replay-controls"></div>
        <div class="lab-static"></div>
        <div class="lab-player">
          <div class="lab-panels"></div>
          <div class="lab-transport">
            <button class="lab-play" aria-label="Play">▶ Play</button>
            <button class="lab-restart" aria-label="Restart">↺</button>
            <label class="lab-speed">Speed <select>${SPEEDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
            <input class="lab-scrub" type="range" min="0" max="1" value="0" aria-label="Replay position">
            <span class="lab-tick"></span>
          </div>
          <div class="lab-stats"></div>
          <p class="lab-event" aria-live="polite"></p>
        </div>
        <p class="lab-note"></p>
      </section>
      <p class="lab-source"></p>`;
    document.body.appendChild(dialog);

    $('.lab-close').onclick = () => dialog.close();
    dialog.addEventListener('close', stop);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    $('.lab-tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b.dataset.tab); };
    $('.lab-steps').onclick = (e) => { const b = e.target.closest('[data-index]'); if (b) showStep(+b.dataset.index); };
    $('.lab-step-nav').onclick = (e) => { const b = e.target.closest('[data-step]'); if (b) showStep(stepIndex + +b.dataset.step); };
    $('.lab-play').onclick = togglePlay;
    $('.lab-restart').onclick = () => { cursor = 0; draw(); play(); };
    $('.lab-speed select').value = String(speed);
    $('.lab-speed select').onchange = (e) => { speed = +e.target.value; };
    $('.lab-scrub').oninput = (e) => { pause(); cursor = +e.target.value; draw(); };
    dialog.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !$('.lab-replay').hidden && !e.target.matches('input,select,button')) {
        e.preventDefault();
        togglePlay();
      }
    });
  }

  /* ---------- controls ---------- */

  function controlHtml(c, value, scope) {
    const id = `lab-${scope}-${c.id}`;
    const shown = c.format ? c.format(value) : value;
    if (c.type === 'select') {
      const opts = c.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('');
      return `<label class="lab-control" for="${id}"><span>${esc(c.label)}</span><select id="${id}" data-id="${c.id}">${opts}</select></label>`;
    }
    return `<label class="lab-control" for="${id}"><span>${esc(c.label)} <output>${esc(shown)}</output></span>
      <input id="${id}" data-id="${c.id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${value}"></label>`;
  }

  function readValue(control, raw) {
    return control.type === 'select' && typeof control.value === 'string' ? raw : +raw;
  }

  function mountControls(container, controls, params, scope, onChange) {
    container.innerHTML = controls.map((c) => controlHtml(c, params[c.id], scope)).join('');
    container.hidden = controls.length === 0;
    container.oninput = (e) => {
      const input = e.target.closest('[data-id]');
      if (!input) return;
      const control = controls.find((c) => c.id === input.dataset.id);
      params[control.id] = readValue(control, input.value);
      const out = input.parentElement.querySelector('output');
      if (out) out.textContent = control.format ? control.format(params[control.id]) : params[control.id];
      onChange();
    };
  }

  const defaults = (controls) => Object.fromEntries(controls.map((c) => [c.id, c.value]));

  /* ---------- derivation ---------- */

  function showStep(i) {
    stepIndex = QF.clip(i, 0, lab.steps.length - 1);
    const step = lab.steps[stepIndex];
    stepParams = defaults(step.controls || []);
    $('.lab-steps').innerHTML = lab.steps.map((s, k) => `<li><button data-index="${k}" class="${k === stepIndex ? 'active' : ''}" aria-current="${k === stepIndex ? 'step' : 'false'}"><span>${k + 1}</span>${esc(s.title)}</button></li>`).join('');
    $('.lab-step-title').textContent = `${stepIndex + 1}. ${step.title}`;
    $('.lab-step-count').textContent = `Step ${stepIndex + 1} of ${lab.steps.length}`;
    $('.lab-step-nav [data-step="-1"]').disabled = stepIndex === 0;
    $('.lab-step-nav [data-step="1"]').disabled = stepIndex === lab.steps.length - 1;
    mountControls($('.lab-step-controls'), step.controls || [], stepParams, 'step', renderStep);
    renderStep();
  }

  function renderStep() {
    try {
      $('.lab-step-body').innerHTML = lab.steps[stepIndex].render(stepParams);
    } catch (err) {
      console.error('Lab step failed to render', err);
      $('.lab-step-body').innerHTML = '<p class="lab-error">This step could not be drawn. Try different inputs.</p>';
    }
  }

  /* ---------- replay ---------- */

  function setupReplay() {
    const r = lab.replay;
    replayParams = defaults(r.controls);
    mountControls($('.lab-replay-controls'), r.controls, replayParams, 'replay', scheduleRerun);
    $('.lab-note').innerHTML = r.note || '';
    const isStatic = typeof r.render === 'function';
    $('.lab-static').hidden = !isStatic;
    $('.lab-player').hidden = isStatic;
    result = null;
    cursor = 0;
    if (isStatic) renderStatic();
  }

  function renderStatic() {
    try {
      $('.lab-static').innerHTML = lab.replay.render(replayParams);
    } catch (err) {
      console.error('Lab panel failed to render', err);
      $('.lab-static').innerHTML = '<p class="lab-error">This panel could not be drawn. Try different inputs.</p>';
    }
  }

  function scheduleRerun() {
    if (typeof lab.replay.render === 'function') {
      renderStatic();
      return;
    }
    clearTimeout(rerunTimer);
    rerunTimer = setTimeout(() => runReplay(true), RERUN_DELAY_MS);
  }

  function runReplay(keepCursor) {
    try {
      const fraction = result && keepCursor ? cursor / Math.max(lab.replay.length(result) - 1, 1) : 0;
      result = lab.replay.run(replayParams);
      const n = lab.replay.length(result);
      cursor = keepCursor ? Math.round(fraction * (n - 1)) : 0;
      $('.lab-scrub').max = String(n - 1);
      draw();
    } catch (err) {
      console.error('Lab replay failed', err);
      result = null;
      $('.lab-panels').innerHTML = '<p class="lab-error">The replay could not run with these inputs.</p>';
    }
  }

  function draw() {
    if (!result) return;
    const n = lab.replay.length(result);
    cursor = QF.clip(Math.round(cursor), 0, n - 1);
    const view = lab.replay.view(result, cursor, replayParams);
    $('.lab-panels').innerHTML = view.panels.map((p, k) => `<figure class="lab-panel${k < (view.fullWidth ?? 1) ? ' full' : ''}">${p}</figure>`).join('');
    $('.lab-stats').innerHTML = view.stats.map(([label, value, tone]) => `<div class="lab-stat ${tone || ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('.lab-event').innerHTML = view.event || '&nbsp;';
    $('.lab-scrub').value = String(cursor);
    $('.lab-tick').textContent = view.tickLabel || `Tick ${QF.chart.fmt(cursor)} / ${QF.chart.fmt(n - 1)}`;
  }

  function loop() {
    if (!playing || !result) return;
    const n = lab.replay.length(result);
    const step = Math.max(1, Math.round(speed * (lab.replay.speedScale || 1)));
    cursor = Math.min(n - 1, cursor + step);
    draw();
    if (cursor >= n - 1) pause();
    else frame = requestAnimationFrame(loop);
  }

  function play() {
    if (!result) return;
    if (cursor >= lab.replay.length(result) - 1) cursor = 0;
    playing = true;
    $('.lab-play').textContent = '❚❚ Pause';
    $('.lab-play').setAttribute('aria-label', 'Pause');
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(frame);
    if (dialog) {
      $('.lab-play').textContent = '▶ Play';
      $('.lab-play').setAttribute('aria-label', 'Play');
    }
  }

  const togglePlay = () => (playing ? pause() : play());

  function stop() {
    pause();
    clearTimeout(rerunTimer);
  }

  /* ---------- tabs and open ---------- */

  function selectTab(tab) {
    const replay = tab === 'replay';
    $('.lab-derive').hidden = replay;
    $('.lab-replay').hidden = !replay;
    dialog.querySelectorAll('.lab-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (!replay) {
      pause();
      return;
    }
    if (typeof lab.replay.render !== 'function' && !result) {
      runReplay(false);
      play();
    }
  }

  function open(key, tab = 'derive', step = 0) {
    const definition = registry.get(key);
    if (!definition) throw new Error(`Unknown strategy lab: ${key}`);
    if (!dialog) build();
    stop();
    lab = definition;
    $('.lab-kicker').textContent = lab.kicker;
    $('.lab-title').textContent = lab.title;
    $('.lab-evidence').innerHTML = lab.evidence;
    $('.lab-source').textContent = lab.source;
    $('.lab-tabs [data-tab="derive"]').textContent = `① ${lab.deriveLabel || 'Derivation'}`;
    $('.lab-tabs [data-tab="replay"]').textContent = `② ${lab.replay.label || 'Strategy in action'}`;
    stepParams = {};
    showStep(QF.clip(step, 0, lab.steps.length - 1));
    setupReplay();
    if (!dialog.open) dialog.showModal();
    selectTab(tab);
  }

  QF.labs = { register: (key, def) => registry.set(key, def), open, has: (key) => registry.has(key) };
})(window);
