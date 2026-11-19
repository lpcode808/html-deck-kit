/**
 * themes.js — try on a whole different look: colors, typefaces, shapes.
 *
 *   <script src="engine/themes.js" data-themes="editorial night" defer></script>
 *
 * Loads themes/<name>.css for each name and shows a small "Look" picker at
 * the top left. Each theme is scoped to <html data-theme="name">, so
 * switching is instant and nothing in index.html changes.
 *   T            next look (Shift+T: previous)
 *   ?theme=riso  open the deck in that look (any theme in themes/ works)
 * The choice is remembered in this browser for this page.
 *
 * To make a theme permanent in a deck, skip this script: link the theme's
 * CSS after theme.css and put data-theme="name" on <html>.
 */
(function () {
  'use strict';
  if (window.DeckThemes) return;

  var me = document.currentScript;
  var listed = ((me && me.getAttribute('data-themes')) || '').split(/\s+/).filter(Boolean);
  var baseName = (me && me.getAttribute('data-default-name')) || 'Original';
  var dir = new URL('../themes/', me ? me.src : location.href);
  var NAMES = { editorial: 'Editorial', night: 'Night Drive', brutal: 'Brutal', storybook: 'Storybook', terminal: 'Terminal', riso: 'Riso Zine' };
  var KEY = 'deck-theme:' + location.pathname;
  var root = document.documentElement;

  function title(n) { return NAMES[n] || n.charAt(0).toUpperCase() + n.slice(1); }
  function load(n) {
    if (document.querySelector('link[data-theme-css="' + n + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL(n + '.css', dir).href;
    l.setAttribute('data-theme-css', n);
    document.head.appendChild(l);
  }

  var asked = null;
  try { asked = new URLSearchParams(location.search).get('theme'); } catch (e) { /* old browser */ }
  if (asked && !/^[a-z0-9-]+$/.test(asked)) asked = null;
  if (asked && asked !== 'original' && listed.indexOf(asked) < 0) listed.push(asked);
  listed.forEach(load);

  var order = ['original'].concat(listed);
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  var start = asked || saved || 'original';
  if (order.indexOf(start) < 0) start = 'original';

  // Remember the deck's own colors and fonts before any theme applies, so
  // the "Original" button can preview them while another look is on.
  var baseVars = {};
  var cs = getComputedStyle(root);
  ['--paper', '--accent', '--ink', '--deep', '--font-display'].forEach(function (v) { baseVars[v] = cs.getPropertyValue(v).trim(); });

  var css = [
    '.th-pick { position: fixed; top: 12px; left: 14px; z-index: 2147483090; display: flex; align-items: center; gap: 6px; padding: 5px;',
    '  border-radius: 999px; background: rgba(16, 17, 22, .72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);',
    '  opacity: .62; transition: opacity .2s; font: 600 12px/1 system-ui, sans-serif; color: #f4f3ef; }',
    '.th-pick:hover, .th-pick:focus-within { opacity: 1; }',
    '.th-pick > span { padding: 0 6px 0 8px; letter-spacing: .12em; text-transform: uppercase; font-size: 10.5px; opacity: .8; }',
    '.th-pick button { display: flex; align-items: center; gap: 7px; padding: 5px 11px 5px 6px; border-radius: 999px; cursor: pointer;',
    '  border: 2px solid transparent; background: var(--paper); color: var(--ink); font: 600 14px/1.1 var(--font-display); white-space: nowrap; }',
    '.th-pick button[aria-pressed="true"] { border-color: #ffd166; box-shadow: 0 0 0 2px rgba(255, 209, 102, .35); }',
    '.th-pick i { width: 18px; height: 18px; border-radius: 50%; flex: 0 0 auto;',
    '  background: linear-gradient(135deg, var(--paper) 0 38%, var(--accent) 38% 66%, var(--deep, var(--ink)) 66%); box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }',
    'html.pk-open .th-pick { opacity: 0; pointer-events: none; }',
    '@media print { .th-pick { display: none !important; } }',
    '@media (max-width: 720px) { .th-pick > span { display: none; } .th-pick button { font-size: 12px; padding: 4px 9px 4px 5px; } }'
  ].join('\n');

  var pick = null;
  function apply(n) {
    if (n === 'original') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', n);
    try { if (n === 'original') localStorage.removeItem(KEY); else localStorage.setItem(KEY, n); } catch (e) { /* storage blocked */ }
    if (pick) Array.prototype.forEach.call(pick.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-look') === n));
    });
    current = n;
  }
  var current = 'original';
  apply(start);

  function build() {
    if (pick || order.length < 2) return;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    pick = document.createElement('div');
    pick.className = 'th-pick';
    pick.setAttribute('data-no-edit', '');
    pick.setAttribute('role', 'group');
    pick.setAttribute('aria-label', 'Look');
    pick.innerHTML = '<span>Look</span>' + order.map(function (n) {
      return '<button type="button" data-look="' + n + '"' + (n === 'original' ? '' : ' data-theme-preview="' + n + '"') +
        ' title="' + (n === 'original' ? baseName : title(n)) + ' (T switches)"><i></i>' + (n === 'original' ? baseName : title(n)) + '</button>';
    }).join('');
    var orig = pick.querySelector('[data-look="original"]');
    Object.keys(baseVars).forEach(function (v) { if (baseVars[v]) orig.style.setProperty(v, baseVars[v]); });
    if (!baseVars['--deep']) orig.style.setProperty('--deep', baseVars['--ink']);
    pick.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-look]');
      if (!b) return;
      apply(b.getAttribute('data-look'));
      b.blur();
    });
    document.body.appendChild(pick);
    apply(current);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (root.hasAttribute('data-deck-edit') || (e.key !== 't' && e.key !== 'T')) return;
    var i = order.indexOf(current);
    apply(order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  window.DeckThemes = { list: order.slice(), apply: apply, get current() { return current; } };
})();
