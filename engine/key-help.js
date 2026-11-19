/**
 * key-help.js — press ? to see every key this deck answers to.
 *
 * Load after deck-stage.js:  <script src="engine/key-help.js" defer></script>
 * ? opens and closes it; Esc or a click closes it. The list adapts: it adds
 * suggestion keys when the agent left suggestions, magic keys when
 * magic-keys.js is on, and a "This slide" line for any effect on the slide
 * you're on (steps, flip cards, a timer…). Hidden in print.
 */
(function () {
  'use strict';
  if (window.__keyHelp) return;
  window.__keyHelp = true;

  var css = [
    '.kh-wrap { position: fixed; inset: 0; z-index: 2147483200; display: none; align-items: center; justify-content: center;',
    '  padding: 3vh 3vw; background: rgba(10, 12, 16, .62); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
    '.kh-wrap[data-open] { display: flex; }',
    '.kh-panel { width: min(1040px, 100%); max-height: 100%; overflow: auto; padding: 28px 34px 22px; border-radius: 20px;',
    '  background: #f6f5f1; color: #17191e; box-shadow: 0 30px 80px rgba(0, 0, 0, .45); }',
    '.kh-panel h2 { margin: 0 0 14px; font: 800 28px/1.1 system-ui, sans-serif; }',
    '.kh-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 6px 40px; }',
    '.kh-cols h3 { margin: 14px 0 6px; font: 700 12px/1 ui-monospace, Consolas, monospace; letter-spacing: .14em; text-transform: uppercase; color: #4b505a; }',
    '.kh-row { display: flex; align-items: baseline; gap: 12px; padding: 5px 0; font-size: 16px; line-height: 1.3; }',
    '.kh-keys { flex: 0 0 104px; display: flex; flex-wrap: wrap; gap: 4px; }',
    '.kh-row kbd { min-width: 26px; padding: 3px 7px; border-radius: 7px; background: #17191e; color: #f6f5f1; text-align: center;',
    '  font: 600 13px/1.3 ui-monospace, Consolas, monospace; box-shadow: 0 2px 0 rgba(0, 0, 0, .25); }',
    '.kh-now { margin: 0 0 6px; padding: 12px 16px; border-radius: 12px; background: #ffe27a; font-size: 16px; line-height: 1.35; }',
    '.kh-foot { margin: 16px 0 0; font-size: 13px; color: #5b606b; }',
    '@media print { .kh-wrap { display: none !important; } }'
  ].join('\n');

  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var MOD = MAC ? '⌘' : 'Ctrl';

  var SLIDE_HINTS = {
    steps: '→ reveals the next item, ← takes one back. When everything is out, → moves on',
    stagger: 'Items arrive one by one. R replays it',
    typewriter: 'The words type themselves. R types them again',
    scramble: 'The words decode themselves. R replays it',
    count: 'The number counts up. R replays it',
    pop: 'Something lands after a beat. R replays it',
    mark: 'The highlighter sweeps in. R replays it',
    zoom: 'The picture slowly zooms. R restarts it',
    reveal: 'Click the blurred part to reveal it (click again to hide)',
    flip: 'Click a card to flip it over',
    timer: 'The countdown runs while this slide is up. R restarts it',
    clock: 'That\'s your own time, live',
    until: 'Counts down to a set time, live',
    today: 'That\'s your own day of the week'
  };

  function row(keys, label) {
    return '<div class="kh-row"><span class="kh-keys">' + keys.map(function (k) { return '<kbd>' + k + '</kbd>'; }).join('') +
      '</span><span>' + label + '</span></div>';
  }
  function section(title, rows) { return '<div><h3>' + title + '</h3>' + rows.join('') + '</div>'; }

  function currentSlide() {
    var deck = document.querySelector('deck-stage');
    return deck && deck.querySelector(':scope > section[data-deck-active]');
  }

  function build() {
    var magic = !!window.__magicKeys;
    var cols = [];
    cols.push(section('Move around', [
      row(['→', 'Space'], 'Next (clicker too)'),
      row(['←'], 'Back'),
      row(magic ? ['H'] : ['1–9'], magic ? 'First slide' : 'Jump to that slide'),
      magic ? '' : row(['H'], 'First slide'),
      row(['G'], 'Grid of every slide: click to jump, drag to reorder, right-click to skip'),
      row(['F', '/'], 'Search slides and notes, Enter to jump')
    ]));
    cols.push(section('Present', [
      row(['L'], 'Laser pointer'),
      row(['R'], 'Replay this slide\'s effect'),
      window.DeckThemes && window.DeckThemes.list.length > 1 ? row(['T'], 'Switch the look: colors, typefaces, shapes (Shift+T: back)') : '',
      window.DeckPeek ? row(['V'], 'Under the hood: this slide\'s map, code and CSS, ready to copy') : '',
      row(['E'], 'Edit words and notes; Presenter view is in its toolbar'),
      row([MOD, 'P'], 'Print: one page per slide, save as PDF'),
      row(['?'], 'This list')
    ]));
    if (document.querySelector('[data-sg], ins.sg, del.sg')) {
      cols.push(section('Suggestions', [
        row(['S'], 'Next slide with a suggestion (Shift+S: back)'),
        row(['P'], 'Preview everything accepted, and back')
      ]));
    }
    if (magic) {
      cols.push(section('Magic keys', [
        row(['B', '.'], 'Blur the slide (again to clear)'),
        row(['C'], 'Confetti'),
        row(['D'], 'Drumroll'),
        row(['M'], 'Mic drop'),
        row(['O'], 'Bubbles'),
        row(['Q'], 'Shh'),
        row(['U'], 'Curtain (again to open)'),
        row(['1–9', '0'], 'A timer of that many minutes (0 = 10)'),
        row(['X'], 'Clear every effect')
      ]));
    }
    var now = '';
    var slide = currentSlide();
    if (slide) {
      var seen = {}, hints = [];
      var els = [slide].concat(Array.prototype.slice.call(slide.querySelectorAll('[data-fx]')));
      els.forEach(function (el) {
        (el.getAttribute('data-fx') || '').split(/\s+/).forEach(function (n) {
          if (n && SLIDE_HINTS[n] && !seen[n]) { seen[n] = 1; hints.push(SLIDE_HINTS[n]); }
        });
      });
      if (hints.length) now = '<p class="kh-now"><b>This slide:</b> ' + hints.join('. ') + '</p>';
    }
    return '<div class="kh-panel" role="dialog" aria-label="Keyboard shortcuts"><h2>Keys</h2>' + now +
      '<div class="kh-cols">' + cols.join('') + '</div>' +
      '<p class="kh-foot">? or Esc closes this. Keys pause while you type in a box or edit text.</p></div>';
  }

  var wrap = null;
  function open() {
    if (!wrap) {
      var style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      wrap = document.createElement('div');
      wrap.className = 'kh-wrap';
      wrap.setAttribute('data-no-edit', '');
      wrap.addEventListener('click', close);
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = build();
    wrap.setAttribute('data-open', '');
  }
  function close() { if (wrap) wrap.removeAttribute('data-open'); }
  function isOpen() { return !!(wrap && wrap.hasAttribute('data-open')); }

  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === '?') { isOpen() ? close() : open(); }
    else if (e.key === 'Escape' && isOpen()) close();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  window.DeckKeyHelp = { open: open, close: close };
})();
