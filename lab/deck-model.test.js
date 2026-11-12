/* Deck tests: the slide list, the per-slide explanations and the glossary must stay in step with the
 * rendered slide images and with each other. Run with: node --test slideshow/lab/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
require('../data/embedded.js');
require('../data/glossary.js');
require('../data/notes.js');
require('./deck-model.js');
const QF = globalThis.QF;
const { slides, sections } = QF.deck;
const M = QF.deckModel;

const ROOT = path.join(__dirname, '..');
const LAB_KEYS = fs.readdirSync(__dirname)
  .filter((f) => /^lab-.*\.js$/.test(f))
  .flatMap((f) => [...fs.readFileSync(path.join(__dirname, f), 'utf8').matchAll(/QF\.labs\.register\('([^']+)'/g)].map((m) => m[1]));
const MAX_GIST_LENGTH = 260;
const EM_DASH = '—';

test('there is one explained slide per rendered slide image and per extracted slide text', () => {
  const images = fs.readdirSync(path.join(ROOT, 'pages')).filter((f) => /^slide-\d\d\.jpg$/.test(f)).sort();
  assert.equal(M.total(), 42);
  assert.deepEqual(images, slides.map((_, i) => `slide-${String(i + 1).padStart(2, '0')}.jpg`));
  assert.equal(globalThis.presentationData[0].length, slides.length);
});

test('extracted slide text matches the slide it sits on', () => {
  const text = globalThis.presentationData[0];
  assert.match(text[33].join(' '), /S1 Market Making Logic/);
  assert.match(text[37].join(' '), /S4 Jump Model Mechanics/);
  assert.match(text[40].join(' '), /Fruit Basket/);
  assert.match(text[41].join(' '), /Performance Attribution/);
});

test('every slide has a title, a known section, a short gist and at least two reading notes', () => {
  slides.forEach((s, i) => {
    const where = `slide ${i + 1}`;
    assert.ok(s.title && s.title.trim(), `${where} title`);
    assert.ok(sections.includes(s.section), `${where} section "${s.section}"`);
    assert.ok(s.gist && s.gist.length <= MAX_GIST_LENGTH, `${where} gist length ${s.gist && s.gist.length}`);
    assert.ok(Array.isArray(s.read) && s.read.length >= 2, `${where} reading notes`);
    s.read.forEach((line) => assert.ok(line.trim().length > 20, `${where} reading note "${line}"`));
  });
});

test('sections appear in deck order without interleaving', () => {
  const order = slides.map((s) => sections.indexOf(s.section));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('every key term is defined and every glossary entry is used', () => {
  const used = new Set();
  slides.forEach((s, i) => (s.terms || []).forEach((key) => {
    assert.ok(QF.glossary[key], `slide ${i + 1} uses undefined term "${key}"`);
    used.add(key);
  }));
  Object.entries(QF.glossary).forEach(([key, entry]) => {
    assert.ok(entry.term && entry.def, `glossary "${key}" needs a term and a definition`);
    assert.ok(used.has(key), `glossary "${key}" is never used`);
  });
});

test('labs and related slides point at things that exist', () => {
  slides.forEach((s, i) => {
    if (s.lab) assert.ok(LAB_KEYS.includes(s.lab), `slide ${i + 1} lab "${s.lab}"`);
    (s.related || []).forEach((n) => {
      assert.ok(Number.isInteger(n) && n >= 1 && n <= slides.length && n !== i + 1, `slide ${i + 1} related ${n}`);
    });
  });
  LAB_KEYS.forEach((key) => assert.ok(slides.some((s) => s.lab === key), `lab "${key}" is not reachable from any slide`));
});

test('lab actions cover every lab and always carry a tab, an icon and a label', () => {
  LAB_KEYS.forEach((key) => {
    const actions = M.labActions(key);
    assert.ok(actions.length >= 1, key);
    actions.forEach((a) => assert.ok(['derive', 'replay'].includes(a.tab) && a.icon && a.text, `${key} ${JSON.stringify(a)}`));
  });
  assert.deepEqual(M.labActions(undefined), []);
});

test('the explanation renders the gist, reading notes, terms, lab buttons and related slides', () => {
  const html = M.explainHtml(16);
  assert.match(html, /SLIDE 16 OF 42/);
  assert.ok(html.includes(M.esc(slides[15].gist)));
  const text = html.replace(/<[^>]+>/g, '');
  slides[15].read.forEach((line) => assert.ok(text.includes(M.esc(line)), line));
  slides[15].terms.forEach((key) => assert.ok(html.includes(M.esc(QF.glossary[key].def))));
  assert.match(html, /data-open-lab="s1" data-tab="replay"/);
  slides[15].related.forEach((n) => assert.ok(html.includes(`data-goto="${n}"`)));
});

test('the explanation omits sections a slide does not have and escapes its text', () => {
  const html = M.explainHtml(30);
  assert.doesNotMatch(html, /data-open-lab/);
  assert.doesNotMatch(html, /KEY TERMS/);
  assert.equal(M.esc('<b>"x" & y</b>'), '&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
  assert.equal(M.explainHtml(0), '');
  assert.equal(M.explainHtml(43), '');
});

test('the slide index groups every slide under its section once', () => {
  const html = M.indexHtml();
  assert.equal((html.match(/data-slide="/g) || []).length, slides.length);
  sections.forEach((name) => assert.ok(html.includes(M.esc(name)), name));
});

test('slide references in the labs and notes stay inside the deck', () => {
  const files = fs.readdirSync(__dirname).filter((f) => /^(lab|backtest)-.*\.js$/.test(f)).map((f) => path.join(__dirname, f));
  files.push(path.join(ROOT, 'data', 'notes.js'));
  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    for (const m of body.matchAll(/slides? (\d+(?:(?:, | and | to |-)\d+)*)/gi)) {
      for (const n of m[1].match(/\d+/g).map(Number)) {
        assert.ok(n >= 1 && n <= slides.length, `${path.basename(file)}: "${m[0]}"`);
      }
    }
  }
});

test('the written explanations use no em dash', () => {
  const body = JSON.stringify([slides, QF.glossary]);
  assert.ok(!body.includes(EM_DASH));
});
