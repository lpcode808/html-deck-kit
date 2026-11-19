/**
 * deck-edit.js — live edit, speaker notes and a presenter window for any
 * <deck-stage> deck. Nothing to include: deck-stage.js loads this file on
 * demand when you
 *   - press E on a deck (toggles edit mode),
 *   - open a deck with ?edit (handy on an iPad), or
 *   - open a deck this browser holds unsaved edits for (they re-apply).
 *
 * In edit mode, click any text on a slide and type. Enter finishes,
 * Shift+Enter adds a line break, Esc undoes what you typed in that box.
 * Edits are drafts in this browser until you save them:
 *   - Save to file (⌘S): only when the deck is served by
 *     `python3 scripts/deck-edit.py`. Writes the change into the deck's
 *     index.html — just the characters you changed.
 *   - Copy changes / Download: anywhere else (a hosted URL, iPad,
 *     file://). Apply later with `python3 scripts/deck-edit.py apply <file>`
 *     or paste the text to an agent.
 * Drafts re-apply every time this browser opens this deck URL, so a fix you
 * make in a run-through is on screen when you present (same browser, same
 * URL). Drafts on localhost and on a hosted URL are separate.
 *
 * Notes: the Notes button opens a drawer for the current slide's speaker
 * notes (the deck's #speaker-notes JSON, one string per slide). Presenter
 * opens a second window with the notes, a timer, the clock and what's next;
 * it follows the deck and its arrows drive the deck.
 *
 * What's editable: text blocks (headings, paragraphs, bullets, captions,
 * card text). Not editable: icons, images, buttons, anything in an
 * element with data-no-edit, and data-sync values (filled in by a script, so edit the source).
 * Opt a whole deck out with <deck-stage no-edit>.
 */
(() => {
  'use strict';
  if (window.DeckEdit) return;
  const deck = document.querySelector('deck-stage');
  if (!deck) return;

  // Keep in step with deck-stage.js, which checks this key to auto-load.
  const deckPath = location.pathname.replace(/index\.html$/, '');
  const STORE_KEY = 'deck-edit:v1:' + deckPath;
  const API = '/__deck-edit/';
  const fileGuess = (() => {
    let p = decodeURIComponent(location.pathname).replace(/^\/+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    return p;
  })();

  const ISLAND = 'svg, img, picture, video, audio, canvas, iframe, object, embed, input, textarea, select, button, [data-lucide], [data-sync], [data-no-edit]';
  const NEVER = 'script, style, template, noscript, svg, button, select, textarea, [data-no-edit], [data-de-ui]';

  const norm = (s) => String(s || '').replace(/[\s ]+/g, ' ').trim();
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const slides = () => Array.from(deck.children).filter((el) => !/^(TEMPLATE|SCRIPT|STYLE)$/.test(el.tagName));
  const labelOf = (el) => (el && (el.getAttribute('data-screen-label') || el.getAttribute('data-label'))) || '';

  // Where a slide sits in the file, and its label there. deck-stage.js
  // records both the first time it sees the slide, before any reorder in the
  // grid view and before it rewrites data-screen-label. Edits and notes are
  // keyed by these, so moving slides around during a session can't send a
  // change to the wrong slide; scripts/deck-edit.py checks the label too.
  const srcOf = (slide) => (slide && slide.__deckSrc) || null;
  const srcIndex = (slide) => { const s = srcOf(slide); return s ? s.index : slides().indexOf(slide); };
  const srcKey = (slide) => { const s = srcOf(slide); return s ? norm(s.label) : null; };
  const slideAtSrc = (i) => slides().find((s) => srcIndex(s) === i) || null;

  // The text that identifies an element: its text, minus shared values
  // (data-sync, filled in by a script at runtime, so the file's
  // fallback can differ) and script bodies. deck-edit.py's text_of() matches.
  function idText(node) {
    let out = '';
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const p = t.parentElement;
      if (p && p.closest('script, style')) continue;
      const sync = p && p.closest('[data-sync]');
      if (sync && (sync === node || node.contains(sync))) continue;
      out += t.nodeValue;
    }
    return norm(out);
  }
  const fragOf = (h) => { const t = document.createElement('template'); t.innerHTML = h; return t.content; };
  const idTextOfHtml = (h) => idText(fragOf(h));
  const plainOfHtml = (h) => norm(fragOf(h).textContent);

  // ── Drafts (localStorage) ─────────────────────────────────────────────
  const blank = () => ({ v: 1, deckPath, file: fileGuess, title: document.title, edits: {}, notes: {} });
  // The stored drafts, a blank store when there are none, or null when this
  // browser won't let the page read storage at all.
  function readDisk() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (s && s.v === 1) return Object.assign(blank(), s, { edits: s.edits || {}, notes: s.notes || {} });
      return blank();
    } catch (e) {
      return null;
    }
  }
  let store = readDisk() || blank();
  const count = () => Object.keys(store.edits).length + Object.keys(store.notes).length;
  // Ids this tab changed since its last write. Each write merges just those
  // into what's stored, so two tabs on the same deck keep each other's drafts.
  const touched = { edits: new Set(), notes: new Set() };
  const putEdit = (id, e) => { store.edits[id] = e; touched.edits.add(id); };
  const dropEdit = (id) => { delete store.edits[id]; touched.edits.add(id); };
  const putNote = (k, n) => { store.notes[k] = n; touched.notes.add(String(k)); };
  const dropNote = (k) => { delete store.notes[k]; touched.notes.add(String(k)); };
  function mergeInto(disk) {
    touched.edits.forEach((id) => { if (store.edits[id]) disk.edits[id] = store.edits[id]; else delete disk.edits[id]; });
    touched.notes.forEach((k) => { if (store.notes[k]) disk.notes[k] = store.notes[k]; else delete disk.notes[k]; });
    return disk;
  }
  let storeWarned = false;
  let persistTimer = 0;
  function persist() {
    clearTimeout(persistTimer);
    const disk = readDisk();
    if (disk) {
      store = mergeInto(disk);
      touched.edits.clear();
      touched.notes.clear();
    }
    store.updated = new Date().toISOString();
    try {
      if (!count()) localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      if (!storeWarned) flash('This browser won’t keep drafts. Copy your changes before you close the tab.', 'warn');
      storeWarned = true;
    }
    syncNotesTag();
    renderBar();
  }
  const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 250); };
  // Another tab of this deck wrote drafts: take them in, keep ours pending.
  let tabsWarned = false;
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY && e.key !== null) return;
    const disk = readDisk();
    if (!disk) return;
    store = mergeInto(disk);
    syncNotesTag();
    renderBar();
    renderDrawer();
    if (editing && !tabsWarned) {
      tabsWarned = true;
      flash('This deck is being edited in another tab too. Drafts from both are kept, but this tab only shows its own until you reload.', 'warn');
    }
  });

  // ── Speaker notes ─────────────────────────────────────────────────────
  // Read once the page has parsed (this file can load mid-parse, and some
  // decks put #speaker-notes after the slides). Notes are keyed by the
  // slide's place in the file (the array index); callers pass the slide's
  // place on screen.
  let notesTag = null;
  let fileNotes = [];
  function readNotes() {
    notesTag = document.getElementById('speaker-notes');
    fileNotes = [];
    try {
      const v = JSON.parse((notesTag && notesTag.textContent) || '[]');
      if (Array.isArray(v)) fileNotes = v.map((x) => (typeof x === 'string' ? x : ''));
    } catch (e) { /* malformed notes: treat as none */ }
  }
  const noteAt = (k) => (store.notes[k] ? store.notes[k].after : (fileNotes[k] || ''));
  const noteFor = (i) => { const s = slides()[i]; return s ? noteAt(srcIndex(s)) : ''; };
  function setNote(i, text) {
    const slide = slides()[i];
    if (!slide) return;
    const k = srcIndex(slide);
    const before = fileNotes[k] || '';
    if (text === before) dropNote(k);
    else putNote(k, { slide: k, slideKey: srcKey(slide), label: labelOf(slide), before, after: text });
    syncNotesTag();
    persistSoon();
  }
  // Mirror drafts into the page's #speaker-notes so anything reading it
  // live (the slam deck's practice notes) sees the same text.
  function syncNotesTag() {
    if (!notesTag) return;
    const arr = fileNotes.slice();
    Object.values(store.notes).forEach((n) => { while (arr.length <= n.slide) arr.push(''); arr[n.slide] = n.after; });
    notesTag.textContent = JSON.stringify(arr);
  }

  // ── Finding editable text ─────────────────────────────────────────────
  const blockish = (el) => { const d = getComputedStyle(el).display; return d !== 'inline' && d !== 'contents'; };
  function editablesIn(slide) {
    const found = new Set();
    const tw = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!/\S/.test(t.nodeValue)) continue;
      let el = t.parentElement;
      if (!el || el.closest(NEVER) || el.closest(ISLAND)) continue;
      while (el && el !== slide && !blockish(el)) el = el.parentElement;
      if (el && el !== slide) found.add(el);
    }
    // A box holding another text box is mixed content: keep the inner ones.
    const list = Array.from(found);
    return list.filter((el) => !list.some((o) => o !== el && el.contains(o)));
  }

  const bound = new WeakMap();   // element → its identity + the file's HTML for it
  const elById = new Map();      // draft id → element
  // Which element an edit belongs to: its slide (place + label in the file),
  // tag, text as the file has it, and which same-text occurrence it is on
  // that slide. Already-edited elements count with their file text, so
  // editing one of two identical bullets can't shift the other one.
  const fileText = (n) => (bound.has(n) ? bound.get(n).text : idText(n));
  const sameText = (slide, tag, text) => Array.from(slide.getElementsByTagName(tag)).filter((n) => fileText(n) === text);
  function identify(el, text) {
    const slide = slides().find((s) => s.contains(el));
    const t = text === undefined ? idText(el) : text;
    const same = Array.from(slide.getElementsByTagName(el.tagName)).filter((n) => (n === el ? t : fileText(n)) === t);
    return { slide: srcIndex(slide), slideKey: srcKey(slide), label: labelOf(slide), tag: el.tagName.toLowerCase(), text: t, nth: Math.max(0, same.indexOf(el)) };
  }
  const idOf = (x) => `${x.slide}|${x.tag}|${x.nth}|${x.text}`;
  function serialize(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('[data-de-island]').forEach((n) => { n.removeAttribute('contenteditable'); n.removeAttribute('data-de-island'); });
    return c.innerHTML;
  }
  // Undo the browser's typing artifacts (it types &nbsp; next to spaces and
  // leaves a trailing <br>) so the file gets clean HTML. Only the changed
  // stretch is touched; the rest stays byte-for-byte as it was.
  function tidy(html, before) {
    let p = 0;
    while (p < html.length && p < before.length && html[p] === before[p]) p++;
    let s = 0;
    while (s < html.length - p && s < before.length - p && html[html.length - 1 - s] === before[before.length - 1 - s]) s++;
    // Don't split an entity at either edge: shrink the shared parts instead.
    const amp = html.lastIndexOf('&', p - 1);
    if (amp !== -1 && /^&[#\w]*$/.test(html.slice(amp, p))) p = amp;
    const cut = html.length - s;
    const rest = /^[#\w]*;/.exec(html.slice(cut));
    const amp2 = html.lastIndexOf('&', cut - 1);
    if (rest && amp2 >= p && /^&[#\w]*$/.test(html.slice(amp2, cut))) s = Math.max(0, html.length - cut - rest[0].length);
    const head = html.slice(0, p), tail = html.slice(html.length - s);
    let mid = html.slice(p, html.length - s);
    const oldMid = before.slice(p, before.length - s);
    if (!/&nbsp;/.test(oldMid)) mid = mid.replace(/&nbsp;/g, ' ');
    mid = mid.replace(/ {2,}/g, ' ');
    if (mid.startsWith(' ') && /\s$/.test(head)) mid = mid.slice(1);
    if (mid.endsWith(' ') && /^\s/.test(tail)) mid = mid.slice(0, -1);
    let h = head + mid + tail;
    if (/<br>$/.test(h) && !/<br>$/.test(before)) h = h.replace(/(<br>)+$/, '');
    if (/ $/.test(h) && !/\s$/.test(before)) h = h.replace(/ +$/, '');
    if (/^ /.test(h) && !/^\s/.test(before)) h = h.replace(/^ +/, '');
    if (/^(\s|&nbsp;|<br>)*$/.test(h)) h = '';
    return h;
  }

  function bind(el) {
    if (!bound.has(el)) bound.set(el, Object.assign(identify(el), { before: serialize(el) }));
    return bound.get(el);
  }
  function commit(el) {
    const rec = bound.get(el);
    if (!rec) return;
    const id = idOf(rec);
    const owner = elById.get(id);
    if (owner && owner !== el && owner.isConnected) {
      // Belt and braces: two boxes the editor can't tell apart.
      el.setAttribute('data-de-problem', '');
      flash('This box looks identical to another one on the slide, so the change wasn’t kept. Edit it in the file instead.', 'warn');
      return;
    }
    const after = tidy(serialize(el), rec.before);
    if (after === rec.before) {
      dropEdit(id);
      elById.delete(id);
      el.removeAttribute('data-de-edited');
    } else {
      putEdit(id, { id, slide: rec.slide, slideKey: rec.slideKey, label: rec.label, tag: rec.tag, text: rec.text, nth: rec.nth, before: rec.before, after, at: new Date().toISOString() });
      elById.set(id, el);
      el.setAttribute('data-de-edited', '');
    }
    el.removeAttribute('data-de-problem');
    persist();
  }
  // After a save the element's baseline is what the file now holds. Anything
  // typed since the save was sent becomes a new draft on top of it.
  function rebase(el, fileHtml) {
    bound.set(el, Object.assign(identify(el, idTextOfHtml(fileHtml)), { before: fileHtml }));
    el.removeAttribute('data-de-problem');
    if (tidy(serialize(el), fileHtml) === fileHtml) el.removeAttribute('data-de-edited');
    else commit(el);
  }

  // Re-apply this browser's drafts on load. A draft whose element isn't in
  // the file any more is kept and flagged stale; one whose new text is
  // exactly what the file now has (saved or applied elsewhere) is dropped.
  let staleCount = 0;
  function applyDrafts() {
    let applied = 0, landed = 0;
    staleCount = 0;
    Object.keys(store.edits).forEach((id) => {
      const e = store.edits[id];
      const slide = slideAtSrc(e.slide);
      const keyOk = slide && (!e.slideKey || srcKey(slide) == null || srcKey(slide) === e.slideKey);
      const el = keyOk ? (sameText(slide, e.tag, e.text)[e.nth] || null) : null;
      if (el && !bound.has(el)) {
        el.innerHTML = e.after;
        el.setAttribute('data-de-edited', '');
        bound.set(el, Object.assign({}, e));
        elById.set(id, el);
        delete e.stale;
        applied++;
        return;
      }
      if (keyOk && Array.from(slide.getElementsByTagName(e.tag)).some((n) => !bound.has(n) && serialize(n) === e.after)) {
        dropEdit(id);
        landed++;
        return;
      }
      e.stale = true;
      staleCount++;
    });
    Object.keys(store.notes).forEach((k) => {
      if ((fileNotes[k] || '') === store.notes[k].after) { dropNote(k); landed++; }
    });
    if (landed) persist();
    syncNotesTag();
    return { applied, landed, stale: staleCount, notes: Object.keys(store.notes).length };
  }

  // ── Edit mode ─────────────────────────────────────────────────────────
  let editing = false;
  let announced = false;
  const focusSnap = new WeakMap();
  function makeEditable(el) {
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    el.setAttribute('data-de-editable', '');
    // Icons, images and shared values can't be typed into; neither can
    // empty decorative shapes (dots, bars), or the caret can get lost in one.
    el.querySelectorAll('*').forEach((n) => {
      if (n.hasAttribute('contenteditable') || /^(BR|WBR)$/.test(n.tagName)) return;
      if (n.matches(ISLAND) || (!n.firstElementChild && !/\S/.test(n.textContent))) {
        n.setAttribute('contenteditable', 'false');
        n.setAttribute('data-de-island', '');
      }
    });
  }
  function enter() {
    if (editing) return;
    editing = true;
    announced = true;
    document.documentElement.setAttribute('data-deck-edit', '');
    deck.setAttribute('data-deck-editing', '');
    slides().forEach((s) => editablesIn(s).forEach(makeEditable));
    // Boxes with a draft stay editable even if it emptied them.
    elById.forEach((el) => { if (el.isConnected && !el.hasAttribute('data-de-editable')) makeEditable(el); });
    ensureUI();
    bar.hidden = false;
    renderBar();
    checkServer();
    if (staleCount) flash(`${plural(staleCount, 'draft')} no longer ${staleCount === 1 ? 'matches' : 'match'} the slide (the file changed). Copy changes to see ${staleCount === 1 ? 'it' : 'them'}, or Discard.`, 'warn');
  }
  function exit() {
    if (!editing) return;
    const a = document.activeElement;
    if (a && a.hasAttribute && a.hasAttribute('data-de-editable')) a.blur();
    editing = false;
    document.querySelectorAll('[data-de-editable]').forEach((el) => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
      el.removeAttribute('data-de-editable');
    });
    document.querySelectorAll('[data-de-island]').forEach((n) => { n.removeAttribute('contenteditable'); n.removeAttribute('data-de-island'); });
    document.documentElement.removeAttribute('data-deck-edit');
    deck.removeAttribute('data-deck-editing');
    if (bar) bar.hidden = true;
    if (drawer) drawer.hidden = true;
    if (count()) toast(`${plural(count(), 'unsaved change')} kept in this browser · E to edit`);
  }
  const toggle = () => (editing ? exit() : enter());
  const hostOf = (t) => (t && t.closest ? t.closest('[data-de-editable]') : null);

  document.addEventListener('focusin', (e) => {
    const el = hostOf(e.target);
    if (!editing || !el) return;
    bind(el);
    focusSnap.set(el, el.innerHTML);
  });
  document.addEventListener('focusout', (e) => {
    const el = hostOf(e.target);
    if (el && bound.has(el)) commit(el);
  });
  let inputTimer = 0;
  document.addEventListener('input', (e) => {
    const el = hostOf(e.target);
    if (!el) return;
    bind(el);
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => commit(el), 400);
  });
  // Plain-text paste only: no fonts or colors from wherever it came from.
  document.addEventListener('paste', (e) => {
    if (!hostOf(e.target)) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
  }, true);
  // While typing, keys belong to the text box, not the deck or its effects.
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (editing && mod && !e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      e.stopPropagation();
      const el = hostOf(e.target);
      if (el) { clearTimeout(inputTimer); commit(el); }
      save();
      return;
    }
    const el = hostOf(e.target);
    if (!el || !editing) return;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (e.shiftKey) {
        if (!document.execCommand('insertLineBreak')) document.execCommand('insertHTML', false, '<br>');
      } else {
        el.blur();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (focusSnap.has(el)) el.innerHTML = focusSnap.get(el);
      el.blur();
    }
    e.stopPropagation();
  }, true);
  // (Clicks into slide text are kept away from the slide's own handlers by a
  // guard in deck-stage.js, which loads before the deck's scripts.)
  deck.addEventListener('slidechange', () => {
    const a = document.activeElement;
    if (a && hostOf(a)) a.blur();
    renderDrawer();
  });

  // ── UI: toolbar, notes drawer, toast ──────────────────────────────────
  const CSS = `
  html[data-deck-edit] [data-de-editable] { cursor: text; outline: 3px dashed transparent; outline-offset: 6px; transition: outline-color .12s; pointer-events: auto; -webkit-user-select: text; user-select: text; }
  html[data-deck-edit] [data-de-editable]:not([data-de-edited]):hover { outline-color: rgba(79,140,255,.6); }
  html[data-deck-edit] [data-de-edited] { outline: 3px solid rgba(255,209,102,.95); outline-offset: 6px; }
  html[data-deck-edit] [data-de-editable]:focus { outline: 3px solid #4f8cff; outline-offset: 6px; }
  html[data-deck-edit] [data-de-problem] { outline: 3px solid #c8531d !important; outline-offset: 6px; }
  html[data-deck-edit] deck-stage [data-sync] { outline: 2px dotted rgba(200,83,29,.55); outline-offset: 3px; }
  .de-bar, .de-notes, .de-toast { font: 500 13px/1.3 system-ui, -apple-system, sans-serif; color: #f6f5f1; -webkit-font-smoothing: antialiased; }
  .de-bar { position: fixed; top: 12px; right: 12px; z-index: 2147483600; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; max-width: calc(100vw - 24px); padding: 7px 8px 7px 12px; background: rgba(20,22,27,.94); border: 1px solid rgba(246,245,241,.18); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.35); }
  .de-bar[hidden], .de-notes[hidden] { display: none; }
  .de-bar b { font-weight: 700; }
  .de-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: #4f8cff; box-shadow: 0 0 0 3px rgba(79,140,255,.25); vertical-align: 1px; }
  .de-count { color: rgba(246,245,241,.72); margin: 0 4px 0 2px; white-space: nowrap; }
  .de-count.has { color: #ffd166; }
  .de-sep { width: 1px; height: 20px; background: rgba(246,245,241,.18); margin: 0 2px; }
  .de-bar button, .de-notes button { font: inherit; color: inherit; cursor: pointer; min-height: 30px; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(246,245,241,.22); background: rgba(246,245,241,.06); }
  .de-bar button:hover, .de-notes button:hover { background: rgba(246,245,241,.14); }
  .de-bar button.de-primary { background: #4f8cff; border-color: #4f8cff; color: #14161b; font-weight: 700; }
  .de-bar button.de-primary:hover { background: #0bc0c0; }
  .de-bar button[aria-pressed="true"] { background: rgba(79,140,255,.28); border-color: #4f8cff; }
  .de-bar button[hidden] { display: none; }
  .de-msg { flex-basis: 100%; color: rgba(246,245,241,.86); font-size: 12px; line-height: 1.4; padding: 2px 2px 0; }
  .de-msg:empty { display: none; }
  .de-msg.warn { color: #ffb38a; }
  .de-msg.ok { color: #ffd166; }
  .de-notes { position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 2147483500; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px 12px; background: rgba(20,22,27,.95); border: 1px solid rgba(246,245,241,.18); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.35); }
  .de-notes-head { display: flex; align-items: center; gap: 10px; }
  .de-notes-head span { color: rgba(246,245,241,.66); }
  .de-notes-head button { margin-left: auto; }
  .de-notes textarea { font: 400 18px/1.45 system-ui, sans-serif; color: #f6f5f1; background: rgba(246,245,241,.05); border: 1px solid rgba(246,245,241,.18); border-radius: 8px; padding: 10px 12px; height: 22vh; min-height: 90px; resize: vertical; }
  .de-notes textarea:focus { outline: 2px solid #4f8cff; outline-offset: 1px; }
  .de-toast { position: fixed; left: 16px; bottom: 16px; z-index: 2147483600; padding: 8px 12px; background: rgba(20,22,27,.92); border: 1px solid rgba(246,245,241,.18); border-radius: 10px; opacity: 0; transform: translateY(6px); transition: opacity .25s, transform .25s; pointer-events: none; }
  .de-toast.on { opacity: 1; transform: none; }
  @media print {
    .de-bar, .de-notes, .de-toast { display: none !important; }
    html[data-deck-edit] [data-de-editable], html[data-deck-edit] [data-de-edited], html[data-deck-edit] [data-sync] { outline: none !important; }
  }`;
  let bar = null, drawer = null, msgTimer = 0;
  function ensureUI() {
    if (bar) return;
    const style = document.createElement('style');
    style.id = 'deck-edit-css';
    style.textContent = CSS;
    document.head.appendChild(style);

    bar = document.createElement('div');
    bar.className = 'de-bar';
    bar.setAttribute('data-de-ui', '');
    bar.hidden = true;
    bar.innerHTML = `
      <span><span class="de-dot"></span><b>Editing</b></span>
      <span class="de-count"></span>
      <button type="button" data-act="notes" aria-pressed="false" title="Speaker notes for this slide">Notes</button>
      <button type="button" data-act="presenter" title="Second window: notes, timer, clock, next slide">Presenter</button>
      <span class="de-sep"></span>
      <button type="button" data-act="save" class="de-primary" hidden title="Write these edits into the deck file (⌘S)">Save to file</button>
      <button type="button" data-act="copy" title="Copy the changes as text: paste to an agent, or save and apply later">Copy changes</button>
      <button type="button" data-act="download" title="Download the changes as a .json file">Download</button>
      <button type="button" data-act="discard" title="Throw away every unsaved change and reload">Discard</button>
      <button type="button" data-act="done" title="Leave edit mode (E). Unsaved changes stay in this browser.">Done</button>
      <div class="de-msg" role="status" aria-live="polite"></div>`;
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      b.blur();
      ACTIONS[b.dataset.act]();
    });
    document.body.appendChild(bar);

    drawer = document.createElement('div');
    drawer.className = 'de-notes';
    drawer.setAttribute('data-de-ui', '');
    drawer.hidden = true;
    drawer.innerHTML = `
      <div class="de-notes-head"><b>Notes</b><span class="de-notes-slide"></span><span>Kept with your edits · shown in Presenter</span><button type="button" data-act="close" aria-label="Close notes">Close</button></div>
      <textarea spellcheck="true" placeholder="What you want to say on this slide…"></textarea>`;
    const ta = drawer.querySelector('textarea');
    ta.addEventListener('input', () => setNote(drawer._slide, ta.value));
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); ta.blur(); } });
    drawer.querySelector('[data-act="close"]').addEventListener('click', () => toggleDrawer(false));
    document.body.appendChild(drawer);
  }
  function renderBar() {
    if (!bar) return;
    const n = count();
    const c = bar.querySelector('.de-count');
    c.textContent = n ? `${plural(n, 'unsaved change')}` : 'No changes yet';
    c.classList.toggle('has', !!n);
    const saveBtn = bar.querySelector('[data-act="save"]');
    const copyBtn = bar.querySelector('[data-act="copy"]');
    saveBtn.hidden = !server;
    copyBtn.classList.toggle('de-primary', !server && n > 0);
    bar.querySelector('[data-act="notes"]').setAttribute('aria-pressed', drawer && !drawer.hidden ? 'true' : 'false');
  }
  function flash(text, tone) {
    ensureUI();
    const m = bar.querySelector('.de-msg');
    m.textContent = text;
    m.className = 'de-msg' + (tone ? ' ' + tone : '');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { m.textContent = ''; }, tone === 'warn' ? 12000 : 6000);
    if (!editing) toast(text);
  }
  let toastEl = null, toastTimer = 0;
  function toast(text) {
    ensureUI();
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'de-toast';
      toastEl.setAttribute('data-de-ui', '');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    requestAnimationFrame(() => toastEl.classList.add('on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 4000);
  }
  function toggleDrawer(show) {
    ensureUI();
    drawer.hidden = show === undefined ? !drawer.hidden : !show;
    renderDrawer();
    renderBar();
    if (!drawer.hidden) drawer.querySelector('textarea').focus();
  }
  function renderDrawer() {
    if (!drawer || drawer.hidden) return;
    const i = deck.index || 0;
    const ta = drawer.querySelector('textarea');
    if (drawer._slide !== i || document.activeElement !== ta) ta.value = noteFor(i);
    drawer._slide = i;
    drawer.querySelector('.de-notes-slide').textContent = labelOf(slides()[i]) || `Slide ${i + 1}`;
  }

  // ── Save / copy / download / discard ──────────────────────────────────
  let server = null;
  function checkServer() {
    if (server !== null) return Promise.resolve(server);
    if (!/^https?:$/.test(location.protocol)) { server = false; renderBar(); return Promise.resolve(false); }
    return fetch(API + 'status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { server = !!(j && j.ok); }, () => { server = false; })
      .then(() => { renderBar(); return server; });
  }
  function payload() {
    return {
      kind: 'deck-edits', v: 1, file: fileGuess, deckPath,
      url: location.href.split('#')[0], title: document.title, created: new Date().toISOString(),
      edits: Object.values(store.edits).map((e) => { const o = Object.assign({}, e); delete o.stale; return o; }),
      notes: Object.values(store.notes).map((n) => Object.assign({ id: 'note|' + n.slide }, n)),
    };
  }
  let saving = false;
  async function save() {
    if (saving) return;
    if (!count()) { flash('Nothing to save yet.'); return; }
    await checkServer();
    if (!server) { copy(); return; }
    // What was sent is what the file will hold; anything typed while the
    // request is out is compared against this, not lost.
    const sent = payload();
    const sentEdits = new Map(sent.edits.map((e) => [e.id, e]));
    const sentNotes = new Map(sent.notes.map((n) => [n.id, n]));
    saving = true;
    let res;
    try {
      const r = await fetch(API + 'apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) });
      res = await r.json();
      if (!r.ok || !res.ok) throw new Error((res && res.message) || r.statusText);
    } catch (err) {
      flash(`Save failed: ${err.message} Your changes are still here as drafts.`, 'warn');
      return;
    } finally {
      saving = false;
    }
    let ok = 0;
    const problems = [];
    res.results.forEach((r) => {
      const fine = r.status === 'applied' || r.status === 'already';
      if (r.kind === 'note') {
        const sn = sentNotes.get(r.id);
        if (!sn) return;
        const k = sn.slide;
        if (fine) {
          fileNotes[k] = sn.after;
          const cur = store.notes[k];
          if (cur && cur.after === sn.after) dropNote(k);
          else if (cur) putNote(k, Object.assign({}, cur, { before: sn.after }));
          ok++;
        } else {
          problems.push(`Note on ${sn.label || 'slide ' + (k + 1)}: ${r.message || r.status}`);
        }
        return;
      }
      const se = sentEdits.get(r.id);
      if (!se) return;
      const el = elById.get(r.id);
      if (fine) {
        dropEdit(r.id);
        elById.delete(r.id);
        if (el && el.isConnected) rebase(el, se.after);
        ok++;
      } else {
        problems.push(`${se.label || 'Slide ' + (se.slide + 1)}: ${r.message || r.status}`);
        if (el) el.setAttribute('data-de-problem', '');
      }
    });
    persist();
    renderDrawer();
    const where = res.file || fileGuess;
    if (problems.length) flash(`Saved ${ok} to ${where}. Not saved (kept as drafts, outlined orange): ${problems.join(' · ')}`, 'warn');
    else flash(`Saved ${plural(ok, 'change')} to ${where}. Commit when you’re ready.${res.note ? ' ' + res.note : ''}`, 'ok');
  }
  function changesText() {
    const p = payload();
    const out = [
      `## Deck edits: ${p.file}`,
      `${plural(p.edits.length, 'text change')}, ${plural(p.notes.length, 'note')} · ${new Date().toLocaleString()} · ${p.url}`,
      '',
      'Apply from the deck folder: save this text to a file and run `python scripts/deck-edit.py apply <file>`',
      '(python3 on a Mac, py on Windows). Or paste it to your agent.',
      '',
    ];
    p.edits.forEach((e, i) => {
      out.push(`${i + 1}. ${e.label || 'Slide ' + (e.slide + 1)} · <${e.tag}>${e.stale ? ' (no longer matches the slide)' : ''}`);
      out.push(`   was: ${e.text}`);
      out.push(`   now: ${plainOfHtml(e.after)}`);
    });
    p.notes.forEach((n) => out.push(`- Note · ${n.label || 'slide ' + (n.slide + 1)}: ${n.after.replace(/\n+/g, ' / ')}`));
    out.push('', '```json', JSON.stringify(p, null, 1), '```', '');
    return out.join('\n');
  }
  async function copy() {
    if (!count()) { flash('Nothing to copy yet.'); return; }
    const text = changesText();
    let done = false;
    try { await navigator.clipboard.writeText(text); done = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('data-de-ui', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      try { done = document.execCommand('copy'); } catch (err) { done = false; }
      ta.remove();
    }
    if (done) flash(`Copied ${plural(count(), 'change')}. Paste into a note or an agent; they stay here as drafts too.`, 'ok');
    else { flash('Couldn’t reach the clipboard here, so it downloaded instead.', 'warn'); download(); }
  }
  function download() {
    if (!count()) { flash('Nothing to download yet.'); return; }
    const name = (fileGuess.split('/').slice(-2, -1)[0] || 'deck').replace(/[^\w-]+/g, '-');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(payload(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deck-edits-${name}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    flash(`Downloaded. Apply with: python3 scripts/deck-edit.py apply ${a.download}`, 'ok');
  }
  function discard() {
    const n = count();
    if (!n) { flash('Nothing to discard.'); return; }
    if (!window.confirm(`Throw away ${plural(n, 'unsaved change')} and reload the deck from the file?`)) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing stored */ }
    location.reload();
  }

  // ── Presenter window ──────────────────────────────────────────────────
  // The window's own script polls this tab (window.opener), so it keeps
  // working across reloads of the deck and needs no extra file.
  const PRESENTER_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Presenter</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: grid; grid-template-rows: auto 1fr auto; background: #14161b; color: #f6f5f1; font: 500 15px/1.35 system-ui, -apple-system, sans-serif; }
  header, footer { display: flex; align-items: center; gap: 14px; padding: 12px 18px; background: rgba(246,245,241,.05); }
  header .where { font-weight: 700; font-size: 18px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header .count { color: rgba(246,245,241,.6); white-space: nowrap; }
  .timer { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .time { font: 600 28px/1 ui-monospace, Consolas, Menlo, monospace; font-variant-numeric: tabular-nums; }
  .clock { color: rgba(246,245,241,.6); font-variant-numeric: tabular-nums; white-space: nowrap; }
  button { font: inherit; color: inherit; cursor: pointer; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(246,245,241,.25); background: rgba(246,245,241,.07); }
  button:hover { background: rgba(246,245,241,.16); }
  main { display: flex; flex-direction: column; padding: 14px 18px; min-height: 0; }
  main label { color: rgba(246,245,241,.6); font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 12px; }
  textarea { flex: 1; width: 100%; resize: none; font: 400 var(--fs, 26px)/1.45 system-ui, sans-serif; color: #f6f5f1; background: transparent; border: 1px solid rgba(246,245,241,.14); border-radius: 10px; padding: 14px 16px; }
  textarea:focus { outline: 2px solid #4f8cff; }
  textarea::placeholder { color: rgba(246,245,241,.35); }
  footer .next { flex: 1; min-width: 0; color: rgba(246,245,241,.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  footer .next b { color: #f6f5f1; }
  .lost { display: none; padding: 10px 18px; background: #c8531d; color: #fff; }
  body.disconnected .lost { display: block; }
</style></head><body>
<header><span class="where">…</span><span class="count"></span>
  <span class="timer"><span class="time">0:00</span><button id="tgo">Start</button><button id="treset">Reset</button></span><span class="clock"></span></header>
<main><div class="lost">Lost the deck window. Reopen Presenter from the deck.</div>
  <label><span>Notes · edits here are saved with the deck’s other changes</span><span><button id="smaller" title="Smaller text">A−</button> <button id="bigger" title="Bigger text">A+</button></span></label>
  <textarea id="notes" spellcheck="true" placeholder="No notes for this slide. Type here to add some."></textarea></main>
<footer><span class="next"></span><button id="prev">◀ Back</button><button id="next">Next ▶</button></footer>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const ta = $('notes');
  let shown = -1, fs = 26;
  try { fs = Number(localStorage.getItem('deck-presenter-fs')) || 26; } catch (e) { /* storage blocked */ }
  const t = { start: 0, acc: 0, on: false };
  const deckEl = () => { try { return opener && !opener.closed ? opener.document.querySelector('deck-stage') : null; } catch (e) { return null; } };
  const api = () => { try { return opener && opener.DeckEdit; } catch (e) { return null; } };
  const setFs = (v) => { fs = Math.max(14, Math.min(64, v)); document.documentElement.style.setProperty('--fs', fs + 'px'); try { localStorage.setItem('deck-presenter-fs', fs); } catch (e) {} };
  setFs(fs);
  const fmt = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss; };
  let loading = false;
  function tick() {
    const d = deckEl(), a = api();
    document.body.classList.toggle('disconnected', !d);
    document.querySelector('.time').textContent = fmt(t.acc + (t.on ? Date.now() - t.start : 0));
    document.querySelector('.clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    // The deck tab reloaded without the editor: load it again.
    if (d && !a && !loading && typeof d.loadEditor === 'function') { loading = true; d.loadEditor().then(() => { loading = false; }, () => { loading = false; }); }
    if (!d || !a) return;
    const i = d.index, n = d.length, labels = a.labels();
    document.querySelector('.where').textContent = labels[i] || ('Slide ' + (i + 1));
    document.querySelector('.count').textContent = (i + 1) + ' / ' + n;
    const next = labels[i + 1];
    document.querySelector('.next').innerHTML = next ? '<b>Next:</b> ' + next.replace(/[&<]/g, (c) => c === '&' ? '&amp;' : '&lt;') : '<b>Last slide</b>';
    if (i !== shown || document.activeElement !== ta) { const v = a.noteFor(i); if (ta.value !== v) ta.value = v; }
    shown = i;
  }
  ta.addEventListener('input', () => { const a = api(); if (a) a.setNote(shown, ta.value); });
  $('tgo').onclick = () => { if (t.on) { t.acc += Date.now() - t.start; t.on = false; $('tgo').textContent = 'Start'; } else { t.start = Date.now(); t.on = true; $('tgo').textContent = 'Pause'; } };
  $('treset').onclick = () => { t.acc = 0; t.start = Date.now(); tick(); };
  $('prev').onclick = () => { const d = deckEl(); if (d) d.prev(); };
  $('next').onclick = () => { const d = deckEl(); if (d) d.next(); };
  $('smaller').onclick = () => setFs(fs - 2);
  $('bigger').onclick = () => setFs(fs + 2);
  document.addEventListener('keydown', (e) => {
    if (e.target === ta) { if (e.key === 'Escape') ta.blur(); return; }
    const d = deckEl(); if (!d || e.metaKey || e.ctrlKey || e.altKey) return;
    if (['ArrowRight', 'PageDown', ' ', 'j'].includes(e.key)) { d.next(); e.preventDefault(); }
    else if (['ArrowLeft', 'PageUp', 'k'].includes(e.key)) { d.prev(); e.preventDefault(); }
  });
  setInterval(tick, 250);
  tick();
})();
<\/script></body></html>`;
  function openPresenter() {
    const name = 'deck_presenter_' + deckPath.replace(/\W+/g, '_');
    const w = window.open('', name, 'popup=yes,width=1000,height=680');
    if (!w) { flash('The browser blocked the window. Allow pop-ups for this page, then try again.', 'warn'); return; }
    let fresh = true;
    try { fresh = !w.document.getElementById('notes'); } catch (e) { fresh = true; }
    if (fresh) { w.document.open(); w.document.write(PRESENTER_HTML); w.document.close(); }
    w.document.title = 'Presenter · ' + document.title;
    w.focus();
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  const ACTIONS = { notes: () => toggleDrawer(), presenter: openPresenter, save, copy, download, discard, done: exit };
  let readyPromise = null;
  function ready() {
    if (!readyPromise) {
      readyPromise = new Promise((resolve) => {
        const go = () => setTimeout(() => requestAnimationFrame(() => {
          readNotes();
          store = readDisk() || store;
          const r = count() ? applyDrafts() : null;
          resolve(r);
        }), 0);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
        else go();
      });
    }
    return readyPromise;
  }
  function init(opts) {
    return ready().then((r) => {
      if (opts && opts.edit) enter();
      else if (!editing && !announced && r && (r.applied || r.notes) && count()) {
        announced = true;
        const n = r.applied + r.notes;
        toast(`${plural(n, 'unsaved change')} from this browser applied · E to review`);
      }
      return window.DeckEdit;
    });
  }

  window.DeckEdit = {
    version: 1,
    init,
    ready,
    toggle: () => ready().then(toggle),
    enter: () => ready().then(enter),
    exit,
    isEditing: () => editing,
    count,
    noteFor,
    setNote,
    labels: () => slides().map((s, i) => labelOf(s) || `Slide ${i + 1}`),
    openPresenter,
    save,
    copy,
    download,
    changesText,
  };
})();
