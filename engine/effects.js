/**
 * effects.js — slide effects you switch on with one attribute.
 *
 * Load once, after deck-stage.js:
 *   <script src="engine/effects.js" defer></script>
 * Then put data-fx="name" on an element (or on the <section> itself).
 * See every one running in effects.html.
 *
 *   On arrival (R replays):
 *     stagger     its children appear one after another
 *     typewriter  plain text types itself out
 *     scramble    plain text decodes from random letters
 *     count       a number counts up from 0 (keeps "$", "%", commas)
 *     pop         appears after a beat with a little bounce
 *                 (data-fx-delay="1200" sets the beat, in ms)
 *     mark        .mark highlights sweep in behind the words
 *     zoom        slow push-in on the image inside (wrap the <img>)
 *   On a key press:
 *     steps       its children appear one per → / Space / clicker press;
 *                 ← takes the last one back. When all are out, → moves on
 *   On a click:
 *     reveal      blurred until clicked
 *     flip        a card with .front and .back children turns over
 *   Live:
 *     timer       counts down data-seconds (default 300) while the slide shows
 *     clock       shows the viewer's current time
 *
 * Several names can share one attribute: data-fx="stagger pop".
 *
 * Rules it keeps so the deck stays readable:
 *  - Arriving on a slide BACKWARDS shows its finished state.
 *  - Reduced motion (an OS setting) shows finished states, no movement.
 *  - Print, grid view and edit mode (E) show finished states. Text effects
 *    put the original words back, so live edit sees the file's text.
 *  - On a touchscreen, steps show all at once (taps go to the deck).
 */
(function () {
  'use strict';
  if (window.DeckFx) return;

  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  // The Presenter window's slide previews load the deck with ?_snthumb=: show finished slides there.
  var THUMB = /[?&]_snthumb=/.test(location.search);
  var A = 'html.fx-ready deck-stage > section[data-deck-active]';

  var css = [
    /* hidden-until-shown states, only on the slide on screen */
    A + ' [data-fx~="stagger"] > :not(.fx-in),',
    A + '[data-fx~="stagger"] > :not(.fx-in):not(.slide-num-badge),',
    A + ' [data-fx~="steps"] > :not(.fx-in),',
    A + '[data-fx~="steps"] > :not(.fx-in):not(.slide-num-badge) { opacity: 0; transform: translateY(26px); }',
    '[data-fx~="stagger"] > *, [data-fx~="steps"] > * { transition: opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1); }',

    A + ' [data-fx~="pop"]:not(.fx-in), ' + A + '[data-fx~="pop"]:not(.fx-in) { opacity: 0; transform: scale(.6); }',
    '[data-fx~="pop"].fx-in { animation: fx-pop .55s cubic-bezier(.3,1.6,.5,1) both; }',
    '@keyframes fx-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }',

    'html.fx-ready [data-fx~="mark"] .mark, html.fx-ready .mark[data-fx~="mark"] {',
    '  background: linear-gradient(var(--highlight, #ffe27a), var(--highlight, #ffe27a)) no-repeat 0 0 / 100% 100%; }',
    A + ' [data-fx~="mark"] .mark:not(.fx-in), ' + A + ' .mark[data-fx~="mark"]:not(.fx-in), ' + A + '[data-fx~="mark"] .mark:not(.fx-in) { background-size: 0% 100%; }',
    '.mark.fx-in { transition: background-size .9s cubic-bezier(.6,.1,.2,1); }',

    '[data-fx~="zoom"] { overflow: hidden; border-radius: 14px; }',
    '[data-fx~="zoom"] img { display: block; width: 100%; height: 100%; object-fit: cover; transform-origin: 60% 40%; }',
    '[data-fx~="zoom"].fx-in img { animation: fx-zoom 18s ease-out forwards; }',
    '@keyframes fx-zoom { from { transform: scale(1); } to { transform: scale(1.18); } }',

    'html.fx-ready [data-fx~="reveal"] { cursor: pointer; transition: filter .45s ease; }',
    'html.fx-ready [data-fx~="reveal"]:not(.fx-open) { filter: blur(16px); user-select: none; }',

    '[data-fx~="flip"] { display: grid !important; cursor: pointer; transform-style: preserve-3d; transition: transform .7s cubic-bezier(.3,.7,.3,1); }',
    '[data-fx~="flip"] > .front, [data-fx~="flip"] > .back { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; display: flex; flex-direction: column; gap: 14px; }',
    '[data-fx~="flip"] > .back { transform: rotateY(180deg); }',
    '[data-fx~="flip"].fx-open { transform: rotateY(180deg); }',

    '.fx-typed::after { content: ""; display: inline-block; width: .08em; height: .9em; margin-left: .04em; vertical-align: -.08em; background: currentColor; animation: fx-caret .8s steps(1) infinite; }',
    '.fx-ghost { visibility: hidden; }',
    '@keyframes fx-caret { 50% { opacity: 0; } }',
    '[data-fx~="count"], [data-fx~="timer"], [data-fx~="clock"] { font-variant-numeric: tabular-nums; }',

    /* the no-transition switch used while resetting a slide */
    '.fx-reset, .fx-reset * { transition: none !important; animation: none !important; }',

    /* finished states: edit mode, print, reduced motion */
    'html[data-deck-edit] [data-fx] > *, html[data-deck-edit] [data-fx] { opacity: 1 !important; transform: none !important; filter: none !important; animation: none !important; }',
    'html[data-deck-edit] .mark { background-size: 100% 100% !important; }',
    '@media print {',
    '  [data-fx] > *, [data-fx] { opacity: 1 !important; transform: none !important; filter: none !important; animation: none !important; }',
    '  .mark { background-size: 100% 100% !important; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  [data-fx~="flip"] { transition: none; }',
    '  [data-fx~="reveal"] { transition: none; }',
    '}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---- bookkeeping: everything an effect starts gets stopped on leave ----
  var stops = [];
  function later(fn, ms) { var t = setTimeout(fn, ms); stops.push(function () { clearTimeout(t); }); }
  function every(fn, ms) { var t = setInterval(fn, ms); stops.push(function () { clearInterval(t); }); }
  function stopAll() { while (stops.length) stops.pop()(); }

  function has(el, name) { return (' ' + (el.getAttribute('data-fx') || '') + ' ').indexOf(' ' + name + ' ') > -1; }
  function within(slide, name) {
    var list = Array.prototype.slice.call(slide.querySelectorAll('[data-fx~="' + name + '"]'));
    if (has(slide, name)) list.unshift(slide);
    return list;
  }
  function kids(el) {
    return Array.prototype.filter.call(el.children, function (c) { return !c.classList.contains('slide-num-badge'); });
  }
  function editing() { return document.documentElement.hasAttribute('data-deck-edit'); }

  // Text effects swap the words while they run and always put them back.
  var restorers = [];
  function plainText(el) { return el.children.length === 0 ? el.textContent : null; }
  function borrowText(el) {
    if (el.__fxOrig === undefined) el.__fxOrig = el.textContent;
    restorers.push(function () { el.textContent = el.__fxOrig; });
    return el.__fxOrig;
  }
  function restoreText() { while (restorers.length) restorers.pop()(); }

  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  // ---- the effects ----
  function show(el) { el.classList.add('fx-in'); }

  var FX = {
    stagger: function (el, finished) {
      kids(el).forEach(function (c, i) { finished ? show(c) : later(function () { show(c); }, 250 + i * 180); });
    },
    steps: function (el, finished) {
      if (finished || COARSE) kids(el).forEach(show);
    },
    pop: function (el, finished) {
      if (finished) return show(el);
      later(function () { show(el); }, Number(el.getAttribute('data-fx-delay')) || 700);
    },
    mark: function (el, finished) {
      var marks = el.classList.contains('mark') ? [el] : Array.prototype.slice.call(el.querySelectorAll('.mark'));
      marks.forEach(function (m, i) { finished ? show(m) : later(function () { show(m); }, 450 + i * 450); });
    },
    zoom: function (el) { show(el); },
    reveal: function (el, finished) { el.classList.toggle('fx-open', !!finished); },
    flip: function (el) { el.classList.remove('fx-open'); },
    typewriter: function (el, finished) {
      var text = plainText(el);
      if (finished || text === null) return;
      text = borrowText(el);
      var i = 0;
      var tick = function () {
        el.innerHTML = '<span class="fx-typed">' + esc(text.slice(0, i)) + '</span><span class="fx-ghost">' + esc(text.slice(i)) + '</span>';
        if (i >= text.length) { later(function () { el.textContent = text; }, 1200); return true; }
        i += 1;
      };
      tick();
      var speed = Math.max(18, Math.min(70, 2200 / text.length));
      var t = setInterval(function () { if (tick()) clearInterval(t); }, speed);
      stops.push(function () { clearInterval(t); });
    },
    scramble: function (el, finished) {
      var text = plainText(el);
      if (finished || text === null) return;
      text = borrowText(el);
      var pool = text.replace(/\s/g, '') || 'abc';
      var frame = 0, total = 28;
      var t = setInterval(function () {
        frame += 1;
        var settled = Math.floor(text.length * frame / total);
        var out = '';
        for (var k = 0; k < text.length; k++) {
          var ch = text[k];
          out += (k < settled || /\s/.test(ch)) ? ch : pool[Math.floor(Math.random() * pool.length)];
        }
        el.textContent = out;
        if (frame >= total) { clearInterval(t); el.textContent = text; }
      }, 45);
      stops.push(function () { clearInterval(t); });
    },
    count: function (el, finished) {
      var text = plainText(el);
      if (finished || text === null) return;
      text = borrowText(el);
      var m = text.match(/-?[\d,]*\.?\d+/);
      if (!m) return;
      var raw = m[0], target = parseFloat(raw.replace(/,/g, ''));
      var decimals = (raw.split('.')[1] || '').length, commas = raw.indexOf(',') > -1;
      var before = text.slice(0, m.index), after = text.slice(m.index + raw.length);
      var fmt = function (v) {
        var s = v.toFixed(decimals);
        if (commas) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return before + s + after;
      };
      var start = performance.now(), dur = 1600;
      var t = setInterval(function () {
        var p = Math.min(1, (performance.now() - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(target * eased);
        if (p >= 1) { clearInterval(t); el.textContent = text; }
      }, 30);
      el.textContent = fmt(0);
      stops.push(function () { clearInterval(t); });
    },
    timer: function (el) {
      if (el.__fxOrig === undefined) el.__fxOrig = el.textContent;
      restorers.push(function () { el.textContent = el.__fxOrig; });
      var left = Number(el.getAttribute('data-seconds')) || 300;
      var fmt = function (s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
      el.textContent = fmt(left);
      every(function () { left = Math.max(0, left - 1); el.textContent = fmt(left); }, 1000);
    },
    clock: function (el) {
      if (el.__fxOrig === undefined) el.__fxOrig = el.textContent;
      restorers.push(function () { el.textContent = el.__fxOrig; });
      var put = function () { el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
      put();
      every(put, 10000);
    }
  };
  var ORDER = Object.keys(FX);

  // ---- running a slide ----
  function reset(slide) {
    slide.classList.add('fx-reset');
    Array.prototype.forEach.call(slide.querySelectorAll('.fx-in'), function (n) { n.classList.remove('fx-in'); });
    if (slide.classList.contains('fx-in')) slide.classList.remove('fx-in');
    void slide.offsetWidth;            // apply the hidden states with no transition
    slide.classList.remove('fx-reset');
  }

  function run(slide, finished) {
    stopAll();
    restoreText();
    if (!slide || editing()) return;
    reset(slide);
    var done = finished || REDUCED || THUMB;
    ORDER.forEach(function (name) {
      within(slide, name).forEach(function (el) { FX[name](el, done); });
    });
  }

  function current() {
    var deck = document.querySelector('deck-stage');
    return deck && deck.querySelector(':scope > section[data-deck-active]');
  }

  document.addEventListener('slidechange', function (e) {
    var d = e.detail || {};
    var backwards = d.reason !== 'replay' && d.previousIndex > d.index;
    run(d.slide, backwards);
  });

  // ---- steps: → reveals the next item before the deck moves on ----
  var NEXT = { ArrowRight: 1, PageDown: 1, ' ': 1, Spacebar: 1, j: 1, J: 1 };
  var PREV = { ArrowLeft: 1, PageUp: 1, k: 1, K: 1 };
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || editing()) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!NEXT[e.key] && !PREV[e.key]) return;
    var slide = current();
    if (!slide) return;
    var items = [];
    within(slide, 'steps').forEach(function (el) { items = items.concat(kids(el)); });
    if (!items.length || COARSE || THUMB) return;
    var shown = items.filter(function (i) { return i.classList.contains('fx-in'); });
    if (NEXT[e.key] && shown.length < items.length) {
      items[shown.length].classList.add('fx-in');
    } else if (PREV[e.key] && shown.length > 0) {
      shown[shown.length - 1].classList.remove('fx-in');
    } else {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // ---- clicks: reveal and flip ----
  document.addEventListener('click', function (e) {
    if (editing()) return;
    var el = e.target.closest && e.target.closest('[data-fx~="reveal"], [data-fx~="flip"]');
    if (!el) return;
    el.classList.toggle('fx-open');
    e.stopPropagation();
  });

  // ---- edit mode: stop everything and put the file's words back ----
  new MutationObserver(function () {
    if (editing()) { stopAll(); restoreText(); }
    else run(current(), true);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-deck-edit'] });

  // Clickable effects count as buttons, so a tap on a touchscreen reaches
  // them instead of turning the slide.
  Array.prototype.forEach.call(document.querySelectorAll('[data-fx~="reveal"], [data-fx~="flip"]'), function (el) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  });

  document.documentElement.classList.add('fx-ready');
  // The deck may have announced its first slide before this file loaded.
  if (current()) run(current(), false);

  window.DeckFx = { names: ORDER.slice(), run: run };
})();
