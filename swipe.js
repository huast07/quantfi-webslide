/* Touch navigation: a horizontal swipe on the slide moves to the next or previous slide by
 * pressing the same footer buttons as the keyboard arrows, so deck.js stays the single source
 * of navigation state. */
(function () {
  'use strict';
  const MIN_DISTANCE_PX = 50;
  const MAX_DURATION_MS = 700;
  const HORIZONTAL_RATIO = 1.5;

  const stage = document.getElementById('stage');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const index = document.getElementById('index');
  if (!stage || !prev || !next) return;

  const isBlocked = () => Boolean(document.querySelector('dialog[open]')) || (index && !index.hidden);

  let start = null;

  stage.addEventListener('touchstart', (e) => {
    start = e.touches.length === 1 && !isBlocked()
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
      : null;
  }, { passive: true });

  stage.addEventListener('touchcancel', () => { start = null; }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const quick = Date.now() - start.t <= MAX_DURATION_MS;
    start = null;
    if (!quick || Math.abs(dx) < MIN_DISTANCE_PX || Math.abs(dx) < HORIZONTAL_RATIO * Math.abs(dy)) return;
    (dx < 0 ? next : prev).click();
  }, { passive: true });

  // On touch screens the keyboard hint is misleading, so describe the gesture instead.
  const hint = document.querySelector('.keyboard');
  if (hint && window.matchMedia('(hover: none) and (pointer: coarse)').matches) hint.textContent = 'SWIPE TO NAVIGATE';
})();
