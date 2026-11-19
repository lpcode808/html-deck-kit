/**
 * slide-search.js — find a slide by its words and jump to it.
 *
 * Press F or / in a <deck-stage> deck. Type a few words; matches show
 * slide number, label and a snippet. ↑/↓ to pick, Enter (or click) to
 * jump, Esc to close. Searches slide text, the slide's label and its
 * speaker note. Skipped slides are included and marked, so appendix and
 * parked slides are one search away during Q&A.
 *
 * Load after deck-stage.js:
 *   <script src="engine/slide-search.js" defer></script>
 * Ignored while typing in a field or while live edit is on.
 */
(() => {
  'use strict';
  if (window.__slideSearch) return;
  window.__slideSearch = true;

  const css = `
  .ss-wrap { position: fixed; inset: 0; z-index: 2147483100; display: none; align-items: flex-start; justify-content: center; background: rgba(20,22,27,.55); padding-top: 10vh; font-family: system-ui, sans-serif; }
  .ss-wrap[data-open] { display: flex; }
  .ss-box { width: min(760px, 92vw); background: #f6f5f1; color: #14161b; border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.35); overflow: hidden; }
  .ss-in { width: 100%; box-sizing: border-box; border: 0; outline: 0; padding: 20px 24px; font: 600 22px system-ui, sans-serif; background: transparent; color: inherit; border-bottom: 1px solid rgba(30,42,68,.15); }
  .ss-list { list-style: none; margin: 0; padding: 6px; max-height: 60vh; overflow: auto; }
  .ss-item { display: grid; grid-template-columns: 48px 1fr; gap: 2px 12px; padding: 10px 14px; border-radius: 10px; cursor: pointer; }
  .ss-item[aria-selected="true"] { background: #1e2a44; color: #f6f5f1; }
  .ss-num { grid-row: span 2; font: 700 20px system-ui, sans-serif; opacity: .7; align-self: center; }
  .ss-lab { font-weight: 700; font-size: 16px; }
  .ss-skip { font-weight: 600; font-size: 12px; margin-left: 8px; padding: 1px 6px; border-radius: 6px; background: rgba(200,83,29,.18); }
  .ss-snip { font-size: 14px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ss-snip mark { background: #ffd166; color: #14161b; border-radius: 3px; }
  .ss-empty { padding: 16px 24px; opacity: .7; font-size: 15px; }
  .ss-hint { padding: 8px 24px 12px; font-size: 12px; opacity: .6; }
  @media print { .ss-wrap { display: none !important; } }`;

  let deck, wrap, input, list, index = [], hits = [], sel = 0;

  const slidesOf = (d) => (Array.isArray(d._slides) && d._slides.length ? d._slides : [...d.querySelectorAll(':scope > section')]);

  function notes() {
    const el = document.getElementById('speaker-notes');
    if (!el) return [];
    try { const v = JSON.parse(el.textContent); return Array.isArray(v) ? v : []; } catch { return []; }
  }

  function textOf(sec) {
    const c = sec.cloneNode(true);
    c.querySelectorAll('style,script,svg').forEach((n) => n.remove());
    const alts = [...sec.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ');
    return (c.textContent + ' ' + alts).replace(/\s+/g, ' ').trim();
  }

  function build() {
    const ns = notes();
    const domOrder = [...deck.querySelectorAll(':scope > section')];
    index = slidesOf(deck).map((sec, i) => {
      const label = (sec.dataset.screenLabel || sec.dataset.label || '').replace(/^\d+\s+/, '');
      const note = ns[domOrder.indexOf(sec)] || '';
      return { i, sec, label, text: textOf(sec), note };
    });
  }

  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function snippet(t, words) {
    const low = t.toLowerCase();
    let at = -1;
    for (const w of words) { at = low.indexOf(w); if (at >= 0) break; }
    const start = Math.max(0, at - 40);
    let s = esc((start ? '…' : '') + t.slice(start, start + 140));
    for (const w of words) s = s.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    return s;
  }

  function run() {
    const q = input.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.length) { hits = []; render(words); return; }
    hits = index
      .map((e) => {
        const hay = (e.label + ' ' + e.text + ' ' + e.note).toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const score = words.reduce((n, w) => n + (e.label.toLowerCase().includes(w) ? 3 : 0) + (e.text.toLowerCase().includes(w) ? 1 : 0), 0);
        return { e, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.e.i - b.e.i)
      .slice(0, 12)
      .map((h) => h.e);
    sel = 0;
    render(words);
  }

  function render(words) {
    if (!input.value.trim()) { list.innerHTML = '<li class="ss-empty">Type to search every slide, appendix included</li>'; return; }
    if (!hits.length) { list.innerHTML = '<li class="ss-empty">No slide matches</li>'; return; }
    list.innerHTML = hits.map((e, k) => {
      const inText = words.some((w) => e.text.toLowerCase().includes(w));
      const src = inText ? e.text : (e.note ? 'Note: ' + e.note : e.text);
      return `<li class="ss-item" role="option" data-k="${k}" aria-selected="${k === sel}">
        <span class="ss-num">${e.i + 1}</span>
        <span class="ss-lab">${esc(e.label || 'Slide ' + (e.i + 1))}${e.sec.hasAttribute('data-deck-skip') ? '<span class="ss-skip">skipped</span>' : ''}</span>
        <span class="ss-snip">${snippet(src, words)}</span></li>`;
    }).join('');
    const cur = list.querySelector('[aria-selected="true"]');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function go(k) {
    const e = hits[k];
    if (!e) return;
    close();
    deck.goTo(e.i);
  }

  function open() {
    build();
    wrap.setAttribute('data-open', '');
    input.value = '';
    run();
    input.focus();
  }
  function close() { wrap.removeAttribute('data-open'); input.blur(); }
  const isOpen = () => wrap && wrap.hasAttribute('data-open');

  function setup() {
    deck = document.querySelector('deck-stage');
    if (!deck || typeof deck.goTo !== 'function') return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    wrap = document.createElement('div');
    wrap.className = 'ss-wrap';
    wrap.innerHTML = '<div class="ss-box" role="dialog" aria-label="Search slides"><input class="ss-in" type="search" placeholder="Search slides…" aria-label="Search slides" autocomplete="off" spellcheck="false"><ul class="ss-list" role="listbox"></ul><div class="ss-hint">↑ ↓ pick · Enter jump · Esc close</div></div>';
    document.body.appendChild(wrap);
    input = wrap.querySelector('.ss-in');
    list = wrap.querySelector('.ss-list');
    input.addEventListener('input', run);
    list.addEventListener('click', (ev) => { const li = ev.target.closest('.ss-item'); if (li) go(+li.dataset.k); });
    wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });

    // Capture phase so the deck's own keys don't fire while the box is open.
    window.addEventListener('keydown', (ev) => {
      if (isOpen()) {
        ev.stopImmediatePropagation();
        if (ev.key === 'Escape') { ev.preventDefault(); close(); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); if (hits.length) { sel = (sel + 1) % hits.length; render(input.value.trim().toLowerCase().split(/\s+/)); } }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (hits.length) { sel = (sel - 1 + hits.length) % hits.length; render(input.value.trim().toLowerCase().split(/\s+/)); } }
        else if (ev.key === 'Enter') { ev.preventDefault(); go(sel); }
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key !== 'f' && ev.key !== 'F' && ev.key !== '/') return;
      const t = ev.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[contenteditable="true"]')) return; // live edit on
      ev.preventDefault();
      ev.stopImmediatePropagation();
      open();
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
