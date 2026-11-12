/* Explain panel: a plain-language reading of the current slide, its key terms and links into the labs.
 * The content comes from data/notes.js through QF.deckModel.explainHtml; this file only mounts it,
 * toggles it and remembers whether the viewer wants it open.
 * Listens for the `slidechange` event dispatched by deck.js. */
(function () {
  'use strict';
  const M = window.QF.deckModel;
  const STORAGE_KEY = 'qf.explain';
  const OPEN_CLASS = 'explain-open';

  const panel = document.getElementById('explain');
  const body = document.getElementById('explainBody');
  const scroller = document.getElementById('explainScroll');
  const toggle = document.getElementById('explainToggle');
  const close = document.getElementById('explainClose');
  const index = document.getElementById('index');
  if (!panel || !body || !toggle) return;

  // Storage can be unavailable (private windows, blocked site data); the panel then simply starts open.
  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== '0';
    } catch (err) {
      return true;
    }
  }

  function writePreference(open) {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch (err) {
      /* The preference just will not persist. */
    }
  }

  let open = readPreference();

  function apply() {
    document.body.classList.toggle(OPEN_CLASS, open);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function setOpen(next) {
    // Hiding the panel would strand keyboard focus inside it, so hand focus back to the toggle first.
    if (!next && panel.contains(document.activeElement)) toggle.focus();
    open = next;
    apply();
    writePreference(open);
  }

  const isTyping = (target) => target.matches('input,select,textarea');
  const isCovered = () => Boolean(document.querySelector('dialog[open]')) || (index && !index.hidden);

  toggle.addEventListener('click', () => setOpen(!open));
  if (close) close.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(e.target) || isCovered()) return;
    setOpen(!open);
  });

  // Related-slide links navigate through the hash, which deck.js already follows.
  body.addEventListener('click', (e) => {
    const link = e.target.closest('[data-goto]');
    if (link) window.location.hash = `#${link.dataset.goto}`;
  });

  document.addEventListener('slidechange', (e) => {
    // Re-rendering removes the focused element when the viewer navigated from inside the panel
    // (a related-slide link), so focus moves to the new title instead of falling back to the page.
    const focusWasInside = body.contains(document.activeElement);
    body.innerHTML = M.explainHtml(e.detail.slide);
    if (scroller) scroller.scrollTop = 0;
    const title = body.querySelector('.explain-title');
    if (focusWasInside && title) title.focus();
  });

  apply();
})();
