/**
 * peek.js — "under the hood" for any slide. Press V (or click </> top right).
 *
 * The slide slides aside and gets an X-ray: every block outlined and
 * labeled with its tag and class. A panel opens beside it with:
 *   Map     the slide's structure as a tree (a diagram you can copy)
 *   HTML    the slide's code, exactly as written in the file
 *   CSS     the rules from theme.css (and the page) that style it
 *   Effect  the engine code behind any data-fx effect on the slide
 * "Copy for an AI" puts all of it on the clipboard with a short prompt, ready
 * to paste into any chat: "explain this, then help me make one like it".
 *
 * Load it BEFORE deck-stage.js, without defer, so it can save each slide's
 * HTML before the engine starts adding its own attributes:
 *   <script src="engine/peek.js" data-tab></script>
 *   <script src="engine/deck-stage.js"></script>
 * data-tab shows the clickable </> tab; without it, only the V key opens it.
 * V or Esc closes. ← → keep changing slides while it's open.
 */
(function () {
  'use strict';
  if (window.DeckPeek) return;

  var me = document.currentScript;
  var SHOW_TAB = !!(me && me.hasAttribute('data-tab'));
  var KIT_URL = 'https://github.com/lpcode808/html-deck-kit';

  // ---- 1. Save each slide's HTML now, before deck-stage.js touches it ----
  function pristine() {
    var deck = document.querySelector('deck-stage');
    if (!deck) return;
    Array.prototype.forEach.call(deck.children, function (s) {
      if (s.tagName === 'SECTION' && s.__peekSrc === undefined) s.__peekSrc = s.outerHTML;
    });
  }
  pristine();
  // Stylesheets that belong to the page (not ones scripts inject later).
  var pageSheets = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"], style'));

  // ---- 2. Look ----
  var css = [
    'html.pk-open deck-stage { transform-origin: 0 50%; transform: translateX(2vw) scale(.54); transition: transform .45s cubic-bezier(.2,.8,.2,1); }',
    'deck-stage { transition: transform .45s cubic-bezier(.2,.8,.2,1); }',
    '@media (max-aspect-ratio: 1/1) { html.pk-open deck-stage { transform-origin: 50% 50%; transform: translateY(-27vh); } }',
    '.pk-tab { position: fixed; top: 14px; right: 16px; z-index: 2147483100; display: flex; align-items: center; gap: 8px;',
    '  padding: 8px 14px; border: 0; border-radius: 999px; cursor: pointer; opacity: .55; transition: opacity .2s, transform .2s;',
    '  font: 600 14px/1 ui-monospace, Consolas, monospace; background: #14161b; color: #f6f5f1; box-shadow: 0 6px 18px rgba(0,0,0,.25); }',
    '.pk-tab:hover, .pk-tab:focus-visible { opacity: 1; transform: translateY(1px); }',
    'html.pk-open .pk-tab { opacity: 0; pointer-events: none; }',
    '.pk-xray { position: fixed; inset: 0; z-index: 2147483050; pointer-events: none; }',
    '.pk-box { position: absolute; border: 1.5px dashed var(--pk-c); border-radius: 4px; background: color-mix(in srgb, var(--pk-c) 7%, transparent);',
    '  animation: pk-in .35s ease both; }',
    '.pk-box b { position: absolute; right: -1px; top: -1px; padding: 2px 6px; border-radius: 0 4px 0 6px; opacity: .92;',
    '  font: 600 10.5px/1.3 ui-monospace, Consolas, monospace; white-space: nowrap; background: var(--pk-c); color: #111; }',
    '@keyframes pk-in { from { opacity: 0; transform: scale(.97); } }',
    '.pk-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 42vw; z-index: 2147483150; display: flex; flex-direction: column;',
    '  background: #14161b; color: #e9e8e3; box-shadow: -20px 0 60px rgba(0,0,0,.45); transform: translateX(102%);',
    '  transition: transform .45s cubic-bezier(.2,.8,.2,1); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }',
    'html.pk-open .pk-panel { transform: none; }',
    '@media (max-aspect-ratio: 1/1) { .pk-panel { top: auto; left: 0; width: auto; height: 58vh; transform: translateY(102%); } }',
    '.pk-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 10px; }',
    '.pk-head h2 { margin: 0; flex: 1; font: 700 18px/1.25 system-ui, sans-serif; }',
    '.pk-head h2 small { display: block; margin-top: 4px; font: 400 13px/1.4 system-ui, sans-serif; opacity: .7; }',
    '.pk-x { border: 0; background: transparent; color: inherit; font-size: 22px; line-height: 1; cursor: pointer; opacity: .7; }',
    '.pk-tabs { display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid rgba(255,255,255,.12); }',
    '.pk-tabs button { border: 0; background: transparent; color: inherit; opacity: .6; cursor: pointer; padding: 10px 12px;',
    '  font: 600 13px/1 ui-monospace, Consolas, monospace; border-bottom: 2px solid transparent; }',
    '.pk-tabs button[aria-selected="true"] { opacity: 1; border-bottom-color: #ffd166; }',
    '.pk-body { flex: 1; overflow: auto; padding: 14px 20px; }',
    '.pk-body pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 12.5px/1.55 ui-monospace, Consolas, Menlo, monospace; }',
    '.pk-note { margin: 0 0 12px; font-size: 13px; opacity: .75; }',
    '.pk-foot { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 12px 20px 16px; border-top: 1px solid rgba(255,255,255,.12); }',
    '.pk-foot button { border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; font: 600 14px/1 system-ui, sans-serif; }',
    '.pk-ai { background: #ffd166; color: #111; }',
    '.pk-copy { background: rgba(255,255,255,.1); color: inherit; }',
    '.pk-foot span { font-size: 12px; opacity: .6; }',
    '.t-tag { color: #7cc4ff; } .t-attr { color: #ffd166; } .t-str { color: #a8e6a1; } .t-com { color: #8a8f99; font-style: italic; }',
    '.t-sel { color: #7cc4ff; } .t-prop { color: #ffd166; } .t-kw { color: #ff9fb2; } .t-dim { color: #8a8f99; }',
    '@media print { .pk-tab, .pk-xray, .pk-panel { display: none !important; } html.pk-open deck-stage { transform: none !important; } }',
    '@media (prefers-reduced-motion: reduce) { deck-stage, .pk-panel { transition: none !important; } .pk-box { animation: none; } }'
  ].join('\n');

  // ---- 3. Small helpers ----
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function deck() { return document.querySelector('deck-stage'); }
  function current() { var d = deck(); return d && d.querySelector(':scope > section[data-deck-active]'); }
  function label(slide) {
    var l = (slide.__deckSrc && slide.__deckSrc.label) || slide.getAttribute('data-screen-label') || '';
    return l.replace(/^\d+\s+/, '');
  }
  function slideNo(slide) {
    var d = deck();
    return Array.prototype.filter.call(d.children, function (s) { return s.tagName === 'SECTION'; }).indexOf(slide) + 1;
  }
  function dedent(src) {
    var lines = src.replace(/\t/g, '  ').split('\n');
    var min = Infinity;
    lines.slice(1).forEach(function (l) { if (l.trim()) min = Math.min(min, l.match(/^ */)[0].length); });
    if (!isFinite(min)) min = 0;
    return lines.map(function (l, i) { return i === 0 ? l : l.slice(Math.min(min, l.match(/^ */)[0].length)); }).join('\n');
  }

  // Syntax colors, kept simple on purpose.
  function hlHTML(src) {
    return esc(src).replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([a-zA-Z][\w-]*)|(\s)([\w:-]+)(=)("[^"]*")/g,
      function (m, com, open, tag, sp, attr, eq, val) {
        if (com) return '<span class="t-com">' + com + '</span>';
        if (tag) return '<span class="t-dim">' + open + '</span><span class="t-tag">' + tag + '</span>';
        return sp + '<span class="t-attr">' + attr + '</span>' + eq + '<span class="t-str">' + val + '</span>';
      });
  }
  function hlCSS(src) {
    return esc(src).split('\n').map(function (line) {
      if (/^\s*\/\*/.test(line)) return '<span class="t-com">' + line + '</span>';
      var m = line.match(/^(\s+)([\w-]+)(:)(.*)$/);
      if (m) return m[1] + '<span class="t-prop">' + m[2] + '</span>' + m[3] + m[4];
      if (/\{\s*$/.test(line)) return '<span class="t-sel">' + line.replace(/\s*\{\s*$/, '') + '</span> {';
      return line;
    }).join('\n');
  }
  function hlJS(src) {
    return esc(src).replace(/(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*')|\b(function|var|return|if|else|for|new|true|false|null)\b/g,
      function (m, com, str, kw) {
        if (com) return '<span class="t-com">' + com + '</span>';
        if (str) return '<span class="t-str">' + str + '</span>';
        return '<span class="t-kw">' + kw + '</span>';
      });
  }

  // ---- 4. What the panel shows ----
  function tagName(el) {
    var name = el.tagName.toLowerCase();
    var cls = Array.prototype.filter.call(el.classList, function (c) { return !/^(fx-|pk-)/.test(c); }).slice(0, 2);
    if (cls.length) name += '.' + cls.join('.');
    if (el.getAttribute('data-fx')) name += ' [fx: ' + el.getAttribute('data-fx') + ']';
    return name;
  }
  function textOf(el) {
    var t = el.__fxOrig;
    if (t === undefined) {
      // Join text from separate elements with a space ("MYTH" + "Animation…").
      var parts = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) parts.push(w.currentNode.nodeValue);
      t = parts.join(' ');
    }
    t = t.replace(/\s+/g, ' ').trim();
    return t.length > 46 ? t.slice(0, 44) + '…' : t;
  }
  function kids(el) {
    return Array.prototype.filter.call(el.children, function (c) {
      return !c.classList.contains('slide-num-badge') && !/^(SCRIPT|STYLE|BR)$/.test(c.tagName);
    });
  }
  function mapOf(slide) {
    var out = [tagName(slide) + '   "' + label(slide) + '"'];
    (function walk(el, prefix, depth) {
      var list = kids(el);
      list.forEach(function (c, i) {
        var last = i === list.length - 1;
        var line = prefix + (last ? '└─ ' : '├─ ') + tagName(c);
        var leafish = !kids(c).length || depth >= 3;
        if (leafish) { var t = textOf(c); if (t) line += '   "' + t + '"'; }
        if (c.tagName === 'IMG') line += '   (' + (c.getAttribute('src') || '') + ')';
        out.push(line);
        if (!leafish) walk(c, prefix + (last ? '   ' : '│  '), depth + 1);
      });
    })(slide, '', 1);
    return out.join('\n');
  }

  function htmlOf(slide) { return dedent(slide.__peekSrc || slide.outerHTML); }

  function cssOf(slide) {
    var blocks = [], blocked = false, rootDone = false;
    var els = [slide].concat(Array.prototype.slice.call(slide.querySelectorAll('*')));
    function hits(selectorText) {
      return selectorText.split(',').some(function (part) {
        var s = part.replace(/::?(before|after|marker|placeholder|selection)\b/g, '')
          .replace(/:(hover|focus|focus-visible|active|visited)\b/g, '').trim();
        if (!s) return false;
        try { return els.some(function (e) { return e.matches(s); }); } catch (err) { return false; }
      });
    }
    function format(rule) {
      var decls = rule.style.cssText.split(/;\s*(?=[\w-]+\s*:)/).map(function (d) { return d.replace(/;\s*$/, '').trim(); }).filter(Boolean);
      return rule.selectorText + ' {\n' + decls.map(function (d) { return '  ' + d + ';'; }).join('\n') + '\n}';
    }
    pageSheets.forEach(function (node) {
      var sheet = node.sheet, rules;
      if (!sheet) return;
      try { rules = sheet.cssRules; } catch (err) { blocked = true; return; }
      var from = node.tagName === 'LINK' ? (node.getAttribute('href') || 'stylesheet') : 'this page';
      var mine = [];
      Array.prototype.forEach.call(rules, function (r) {
        if (!r.selectorText) return;
        if (r.selectorText === ':root') { if (!rootDone) { rootDone = true; mine.unshift('/* the color and font tokens everything uses */\n' + format(r)); } return; }
        if (/^(\*|html, body|html|body|deck-stage:not\(:defined\))$/.test(r.selectorText)) return;
        if (hits(r.selectorText)) mine.push(format(r));
      });
      if (mine.length) blocks.push('/* from ' + from + ' */\n' + mine.join('\n\n'));
    });
    if (!blocks.length && blocked) return null;
    return blocks.join('\n\n');
  }

  function fxNames(slide) {
    var seen = {}, names = [];
    [slide].concat(Array.prototype.slice.call(slide.querySelectorAll('[data-fx]'))).forEach(function (el) {
      (el.getAttribute('data-fx') || '').split(/\s+/).forEach(function (n) { if (n && !seen[n]) { seen[n] = 1; names.push(n); } });
    });
    return names;
  }
  function fxOf(slide) {
    var names = fxNames(slide);
    if (!names.length || !window.DeckFx || !window.DeckFx.source) return '';
    return names.map(function (n) {
      var doc = (window.DeckFx.docs && window.DeckFx.docs[n]) || '';
      return '// data-fx="' + n + '"' + (doc ? ': ' + doc : '') + '\n// from engine/effects.js\n' + window.DeckFx.source(n);
    }).join('\n\n');
  }

  // ---- 5. X-ray boxes over the slide ----
  var COLORS = ['#ffd166', '#7cc4ff', '#ff9fb2', '#a8e6a1'];
  var xray = null;
  function drawXray() {
    if (!xray) return;
    xray.innerHTML = '';
    var slide = current();
    if (!slide) return;
    var count = 0;
    (function walk(el, depth) {
      kids(el).forEach(function (c) {
        if (count > 44) return;
        var r = c.getBoundingClientRect();
        if (r.width * r.height < 900) return;
        var box = document.createElement('div');
        box.className = 'pk-box';
        box.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;--pk-c:' +
          COLORS[(depth - 1) % COLORS.length] + ';animation-delay:' + (count * 25) + 'ms';
        // Third-level boxes get an outline but no label, so labels don't bury the words.
        if (depth < 3) box.innerHTML = '<b>' + esc(tagName(c)) + '</b>';
        xray.appendChild(box);
        count += 1;
        if (depth < 3) walk(c, depth + 1);
      });
    })(slide, 1);
  }

  // ---- 6. The panel ----
  var panel = null, tab = 'map', style = null, tabBtn = null;
  function ensure() {
    if (panel) return;
    style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    xray = document.createElement('div');
    xray.className = 'pk-xray';
    xray.setAttribute('data-no-edit', '');
    panel = document.createElement('aside');
    panel.className = 'pk-panel';
    panel.setAttribute('data-no-edit', '');
    panel.setAttribute('aria-label', 'Under the hood');
    document.body.appendChild(xray);
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; render(); }
      else if (b.classList.contains('pk-x')) close();
      else if (b.classList.contains('pk-ai')) copy(promptFor(current()), b, 'Copied. Paste it into any AI chat');
      else if (b.classList.contains('pk-copy')) copy(tabText(current()), b, 'Copied');
      b.blur();
    });
  }

  function tabText(slide) {
    if (tab === 'map') return mapOf(slide);
    if (tab === 'html') return htmlOf(slide);
    if (tab === 'css') return cssOf(slide) || '';
    return fxOf(slide);
  }

  function promptFor(slide) {
    var parts = [
      'This is one slide from an HTML slide deck made with html-deck-kit (' + KIT_URL + ').',
      'Each slide is a <section> inside <deck-stage>; theme.css holds the colors and layouts.',
      'Please explain in plain language how this slide is built, then help me make one like it for my own deck.',
      '',
      'Slide: "' + label(slide) + '"',
      '',
      '## Structure',
      '```',
      mapOf(slide),
      '```',
      '',
      '## HTML',
      '```html',
      htmlOf(slide),
      '```'
    ];
    var c = cssOf(slide);
    if (c) parts.push('', '## CSS it uses', '```css', c, '```');
    var f = fxOf(slide);
    if (f) parts.push('', '## Effect code', '```js', f, '```');
    return parts.join('\n');
  }

  function render() {
    var slide = current();
    if (!slide || !panel) return;
    var fx = fxOf(slide);
    if (tab === 'fx' && !fx) tab = 'map';
    var tabs = [['map', 'Map'], ['html', 'HTML'], ['css', 'CSS']];
    if (fx) tabs.push(['fx', 'Effect']);
    var body;
    if (tab === 'map') {
      body = '<p class="pk-note">The slide as a tree: each line is a box on the left, labeled the same way.</p><pre>' + esc(mapOf(slide)) + '</pre>';
    } else if (tab === 'html') {
      body = '<p class="pk-note">Exactly what\'s in the file. Change it there (or press E to edit the words) and the slide changes.</p><pre>' + hlHTML(htmlOf(slide)) + '</pre>';
    } else if (tab === 'css') {
      var c = cssOf(slide);
      body = c === null
        ? '<p class="pk-note">Your browser hides CSS from pages opened as a file. Open the deck from the web, or run <code>python scripts/deck-edit.py</code> and open http://localhost:8769/, to see it here.</p>'
        : '<p class="pk-note">Only the rules that touch this slide. Colors come from the tokens at the top.</p><pre>' + hlCSS(c) + '</pre>';
    } else {
      body = '<p class="pk-note">The engine code behind this slide\'s effect. You add an effect with one attribute; this is what runs.</p><pre>' + hlJS(fx) + '</pre>';
    }
    panel.innerHTML =
      '<div class="pk-head"><h2>Under the hood · slide ' + slideNo(slide) + ', ' + esc(label(slide)) +
      '<small>Every slide is a few lines of HTML. Peek, copy, ask an AI to make you one.</small></h2>' +
      '<button class="pk-x" type="button" aria-label="Close">×</button></div>' +
      '<div class="pk-tabs" role="tablist">' + tabs.map(function (t) {
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="pk-body">' + body + '</div>' +
      '<div class="pk-foot"><button type="button" class="pk-ai">Copy for an AI</button>' +
      '<button type="button" class="pk-copy">Copy this tab</button><span>V or Esc closes · ← → still change slides</span></div>';
  }

  function copy(text, btn, msg) {
    var old = btn.textContent;
    var done = function () { btn.textContent = msg; setTimeout(function () { btn.textContent = old; }, 1800); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Copy failed: select the text instead'; }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  var redrawT = null;
  function redraw(delay) {
    clearTimeout(redrawT);
    redrawT = setTimeout(function () { render(); drawXray(); }, delay == null ? 470 : delay);
  }
  function isOpen() { return document.documentElement.classList.contains('pk-open'); }
  function open() {
    if (document.documentElement.hasAttribute('data-deck-edit')) return;
    pristine();
    ensure();
    document.documentElement.classList.add('pk-open');
    render();
    if (xray) xray.innerHTML = '';
    redraw();
  }
  function close() {
    document.documentElement.classList.remove('pk-open');
    clearTimeout(redrawT);
    if (xray) xray.innerHTML = '';
  }

  document.addEventListener('slidechange', function () {
    if (!isOpen()) return;
    render();
    if (xray) xray.innerHTML = '';
    redraw(350);   // after the slide's own arrival effects settle a bit
  });
  window.addEventListener('resize', function () { if (isOpen()) redraw(150); });

  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'v' || e.key === 'V') { isOpen() ? close() : open(); }
    else if (e.key === 'Escape' && isOpen()) close();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  function addTab() {
    if (!SHOW_TAB || tabBtn) return;
    ensure();
    tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'pk-tab';
    tabBtn.setAttribute('data-no-edit', '');
    tabBtn.title = 'See how this slide is built (V)';
    tabBtn.innerHTML = '&lt;/&gt; <span>under the hood</span>';
    tabBtn.addEventListener('click', function () { tabBtn.blur(); open(); });
    document.body.appendChild(tabBtn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addTab);
  else addTab();

  window.DeckPeek = { open: open, close: close, promptFor: promptFor };
})();
