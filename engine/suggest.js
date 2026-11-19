/**
 * suggest.js — Google-Docs-style suggestions, right on the slides.
 *
 * The agent proposes changes in the deck itself instead of describing them
 * in chat. You look at the real slides, then answer in bulk
 * ("accept all", "S2: tweak, shorter", "reject S4").
 *
 * Markup the agent writes (AGENTS.md → "Suggest, don't surprise"):
 *   <section data-sg="S1" data-sg-kind="new|move|cut|edit|ask"
 *            data-sg-note="One line on why">…</section>
 *   <ins class="sg">new words</ins> <del class="sg">old words</del>
 *   (inline marks may also carry data-sg="S1" to tie them to a slide)
 *
 * Keys:  S  next slide with a suggestion   (Shift+S: previous)
 *        M  marks on/off: off shows the slide as it would read if you
 *           accepted everything (deleted words gone, new words plain)
 * The little pill at top right counts what's open. Nothing here changes
 * the file; accepting means telling the agent, and it cleans up the marks.
 * scripts/check.py fails while any suggestion is still in the deck.
 */
(function () {
  'use strict';
  var css = [
    'ins.sg { text-decoration: none; background: rgba(46,160,67,.22); box-shadow: inset 0 -.12em 0 rgba(46,160,67,.9); border-radius: 4px; }',
    'del.sg { text-decoration: line-through 4px rgba(207,34,46,.85); opacity: .55; }',
    'section[data-sg] { outline: 8px dashed rgba(255,170,0,.95); outline-offset: -8px; }',
    'section[data-sg]::before { content: attr(data-sg) " · " attr(data-sg-kind) " · " attr(data-sg-note);',
    '  position: absolute; left: 0; right: 0; top: 0; z-index: 50; padding: 10px 24px;',
    '  background: repeating-linear-gradient(135deg, #ffb000 0 18px, #ffc94d 18px 36px); color: #111; border-bottom: 3px solid #111; font: 600 24px/1.3 system-ui, sans-serif;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    'section[data-sg-kind="cut"] > *:not(.slide-num-badge) { opacity: .35; }',
    'html[data-sg-off] del.sg { display: none; }',
    'html[data-sg-off] ins.sg { background: none; box-shadow: none; }',
    'html[data-sg-off] section[data-sg] { outline: none; }',
    'html[data-sg-off] section[data-sg]::before { display: none; }',
    'html[data-sg-off] section[data-sg-kind="cut"] > * { opacity: 1; }',
    '.sg-pill { position: fixed; top: 60px; right: 16px; z-index: 2147483000; padding: 8px 14px; border-radius: 999px;',
    '  background: rgba(255,170,0,.95); color: #1a1a1a; font: 600 14px/1 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }',
    'html[data-sg-off] .sg-pill { background: rgba(60,60,60,.9); color: #fff; }',
    '@media print { .sg-pill { display: none !important; } }'
  ].join('\n');

  function slides(deck) {
    return Array.prototype.filter.call(deck.children, function (el) { return el.tagName === 'SECTION'; });
  }
  function hasSuggestion(sec) {
    return sec.hasAttribute('data-sg') || !!sec.querySelector('ins.sg, del.sg');
  }

  function init() {
    var deck = document.querySelector('deck-stage');
    if (!deck) return;
    var marked = slides(deck).filter(hasSuggestion);
    if (!marked.length) return;

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var pill = document.createElement('div');
    pill.className = 'sg-pill';
    pill.setAttribute('data-no-edit', '');
    function label() {
      var off = document.documentElement.hasAttribute('data-sg-off');
      pill.textContent = marked.length + ' slide' + (marked.length === 1 ? '' : 's') +
        ' with suggestions · S next · M ' + (off ? 'marks on' : 'preview accepted');
    }
    label();
    pill.addEventListener('click', function () { step(1); });
    document.body.appendChild(pill);

    function step(dir) {
      var all = slides(deck);
      var cur = typeof deck.index === 'number' ? deck.index : 0;
      var idx = marked.map(function (s) { return all.indexOf(s); }).sort(function (a, b) { return a - b; });
      var target = dir > 0
        ? idx.find(function (i) { return i > cur; })
        : idx.slice().reverse().find(function (i) { return i < cur; });
      if (target === undefined) target = dir > 0 ? idx[0] : idx[idx.length - 1];
      if (deck.goTo) deck.goTo(target);
    }

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.documentElement.hasAttribute('data-deck-edit')) return;
      if (e.key === 's' || e.key === 'S') { step(e.shiftKey ? -1 : 1); e.preventDefault(); }
      else if (e.key === 'm' || e.key === 'M') {
        document.documentElement.toggleAttribute('data-sg-off');
        label();
        e.preventDefault();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
