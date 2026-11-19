/**
 * magic-keys.js — Canva-style "magic shortcuts" for a <deck-stage> deck.
 *
 * Keys (no Cmd/Ctrl/Alt; ignored while typing in a field or holding a key):
 *   B or .   blur the slide (toggle). Many clickers' blank-screen button
 *            sends one of these, so that button blurs too.
 *   C        confetti
 *   D        drumroll
 *   M        mic drop
 *   O        bubbles
 *   Q        quiet (shh)
 *   U        curtain (toggle)
 *   1–9, 0   countdown timer of that many minutes (0 = 10). Takes these
 *            keys from deck-stage's jump-to-slide-N in decks that load this.
 *            The badge picks a corner clear of slide text; drag it to put
 *            it somewhere else (it stays there until X). A deck that loads
 *            this with data-timer="quiet" gets a small, dim, silent badge
 *            (a clock for the presenter, not the room).
 *   X        clear every effect, the timer and any sound
 *   ?        key list (? or Esc closes); it also lists deck-stage's own keys
 *
 * Sounds are synthesized with Web Audio, no audio files. Effects live in one
 * fixed layer over the deck; they never touch the slides, and print hides
 * them. Load it after deck-stage.js (or with defer).
 */
(() => {
  'use strict';
  if (window.__magicKeys) return;
  window.__magicKeys = true;
  const QUIET = !!document.currentScript && document.currentScript.dataset.timer === 'quiet';

  const C = { ink: '#17191e', cream: '#f6f5f1', blue: '#2b3a67', orange: '#e4572e', lime: '#ffd166', teal: '#4f8cff', pink: '#f64482', gold: '#f2b632' };
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  const css = `
  .mk-layer { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; overflow: hidden; font-family: system-ui, sans-serif; }
  deck-stage { transition: filter .45s ease; }
  html.mk-blur deck-stage { filter: blur(24px) saturate(.85); }
  html.mk-shake deck-stage { animation: mk-shake .5s cubic-bezier(.36,.07,.19,.97); }
  @keyframes mk-shake { 10%,90% { transform: translate(-2px,1px); } 20%,80% { transform: translate(5px,-2px); } 30%,50%,70% { transform: translate(-9px,4px); } 40%,60% { transform: translate(9px,-3px); } }
  .mk-emoji { position: absolute; line-height: 1; font-family: ${EMOJI}; will-change: transform, opacity; }
  .mk-flash { position: absolute; inset: 0; background: radial-gradient(circle at 50% 85%, rgba(246,245,241,.75), rgba(246,245,241,0) 60%); opacity: 0; }
  .mk-dim { position: absolute; inset: 0; background: rgba(23,25,30,.62); opacity: 0; }
  .mk-bubble { position: absolute; bottom: -14vmin; border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, rgba(255,255,255,.95) 0 5%, rgba(255,255,255,.18) 7% 46%, rgba(255,209,102,.16) 72%, rgba(79,140,255,.38) 100%);
    box-shadow: inset 0 0 1.4vmin rgba(255,255,255,.65), 0 0 .8vmin rgba(43,58,103,.18); }
  .mk-curtain { position: absolute; top: 0; bottom: 0; width: 51vw; transition: transform 1.3s cubic-bezier(.7,0,.3,1);
    background:
      linear-gradient(180deg, rgba(0,0,0,.38), rgba(0,0,0,0) 22%, rgba(0,0,0,0) 78%, rgba(0,0,0,.45)),
      repeating-linear-gradient(90deg, #5a0913 0, #8c1323 2.4vw, #b51f34 3.6vw, #8c1323 4.8vw, #5a0913 7.2vw); }
  .mk-curtain.l { left: 0; transform: translateX(-101%); box-shadow: 1.2vw 0 2.4vw rgba(0,0,0,.45); }
  .mk-curtain.r { right: 0; transform: translateX(101%); box-shadow: -1.2vw 0 2.4vw rgba(0,0,0,.45); }
  .mk-valance { position: absolute; left: 0; right: 0; top: 0; height: 12vh; transform: translateY(-110%); transition: transform .7s cubic-bezier(.7,0,.3,1);
    background: linear-gradient(180deg, #5a0913, #9b182a 70%, #6e0d19); border-bottom: .7vh solid ${C.gold}; box-shadow: 0 1vh 2.4vh rgba(0,0,0,.45); }
  .mk-layer.mk-curtained .mk-curtain { transform: none; }
  .mk-layer.mk-curtained .mk-valance { transform: none; transition-delay: .2s; }
  .mk-timer { position: absolute; display: flex; align-items: center; gap: 1.2vh; padding: .9vh 2vh .9vh 1.2vh; transition: opacity .2s;
    pointer-events: auto; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
    border-radius: 999px; background: ${C.blue}; color: ${C.cream}; border: .3vh solid rgba(246,245,241,.35); box-shadow: 0 .6vh 2.4vh rgba(23,25,30,.35);
    font: 600 4.6vh/1 ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; }
  .mk-t { min-width: 5ch; text-align: center; }
  .mk-timer.dragging { cursor: grabbing; transition: none; }
  .mk-pie { width: 3.8vh; height: 3.8vh; border-radius: 50%; background: conic-gradient(${C.lime} var(--p, 100%), rgba(246,245,241,.16) 0); }
  .mk-timer.low { color: #ffb48f; } .mk-timer.low .mk-pie { background: conic-gradient(${C.orange} var(--p), rgba(246,245,241,.16) 0); }
  .mk-timer.done { color: ${C.lime}; animation: mk-pulse .9s ease-in-out 4; }
  .mk-timer.quiet { gap: .7vh; padding: .5vh 1.2vh .5vh .7vh; opacity: .55; font-size: 2.8vh; border-width: .15vh; box-shadow: none; }
  .mk-timer.quiet .mk-pie { width: 2.2vh; height: 2.2vh; }
  .mk-timer.quiet.done { animation: none; }
  @keyframes mk-pulse { 50% { transform: scale(1.08); box-shadow: 0 0 0 1.4vh rgba(255,209,102,.35); } }
  .mk-help { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(23,25,30,.72); pointer-events: auto; }
  .mk-help .panel { width: min(92vw, 128vh); background: ${C.cream}; color: ${C.ink}; border-radius: 2.2vh; padding: 4.4vh 5.4vh 3.6vh; box-shadow: 0 2vh 6vh rgba(0,0,0,.4); }
  .mk-help h2 { margin: 0 0 3vh; font: 800 4.8vh/1 system-ui, sans-serif; letter-spacing: -.01em; color: ${C.blue}; }
  .mk-help .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6vh; }
  .mk-help h3 { margin: 0 0 1.6vh; font: 700 1.9vh/1 system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: ${C.teal}; }
  .mk-help .row { display: flex; align-items: center; gap: 1.6vh; padding: .75vh 0; font-size: 2.5vh; line-height: 1.2; }
  .mk-help .keys { flex: 0 0 15vh; display: flex; gap: .6vh; flex-wrap: wrap; }
  .mk-help kbd { min-width: 3.6vh; padding: .45vh .9vh; border-radius: .7vh; background: ${C.ink}; color: ${C.cream}; text-align: center; font: 600 2.1vh/1.15 ui-monospace, Consolas, monospace; }
  .mk-help .foot { margin: 2.8vh 0 0; font-size: 2vh; color: rgba(23,25,30,.6); }
  @media print { .mk-layer { display: none !important; } html.mk-blur deck-stage { filter: none; } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const layer = document.createElement('div');
  layer.className = 'mk-layer';
  layer.setAttribute('aria-hidden', 'true');
  const mount = () => document.body.appendChild(layer);
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  const el = (cls, html = '', tag = 'div') => { const n = document.createElement(tag); n.className = cls; if (html) n.innerHTML = html; layer.appendChild(n); return n; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; };
  const timers = new Set();
  const live = new Set(); // nodes added by one-shot effects, removed by X

  /* ---------------- sound (Web Audio, synthesized) ---------------- */
  let ac = null, out = null, bus = null, noiseBuf = null;
  function audio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ac) {
      ac = new AC();
      out = ac.createDynamicsCompressor();
      out.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!bus) { bus = ac.createGain(); bus.gain.value = 0.7; bus.connect(out); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const hush = () => { if (bus) { bus.disconnect(); bus = null; } };
  const env = (g, t, a, peak, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  function noise(t, dur, peak, filters, attack = 0.002) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    let node = src;
    const fs = filters.map(([type, freq, q]) => {
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.setValueAtTime(freq, t); if (q) f.Q.value = q;
      node.connect(f); node = f; return f;
    });
    const g = ac.createGain();
    env(g, t, attack, peak, dur);
    node.connect(g).connect(bus);
    src.start(t, Math.random()); src.stop(t + attack + dur + 0.05);
    return fs;
  }
  function tone(t, type, f0, f1, dur, peak, attack = 0.003) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
    const g = ac.createGain();
    env(g, t, attack, peak, dur);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }
  const S = {
    pop(t) {
      noise(t, 0.09, 1.6, [['bandpass', 1700, 0.7]]);
      tone(t, 'triangle', 950, 260, 0.07, 0.6);
      noise(t + 0.05, 0.6, 0.16, [['highpass', 6500]], 0.02);
    },
    roll(t0, len) {
      let t = t0, k = 0;
      while (t < t0 + len) {
        const p = (t - t0) / len, g = 0.06 + 0.42 * p * p;
        noise(t, 0.055, g * (k++ % 2 ? 0.8 : 1), [['highpass', 1100], ['bandpass', 3000, 0.6]]);
        tone(t, 'triangle', 200, 150, 0.045, g * 0.45);
        t += 0.056 - 0.018 * p;
      }
    },
    crash(t) {
      tone(t, 'sine', 150, 45, 0.4, 0.95);
      noise(t, 0.14, 0.55, [['bandpass', 2000, 0.8]]);
      noise(t, 2.1, 0.42, [['highpass', 4800]], 0.004);
    },
    thud(t, big = 1) {
      tone(t, 'sine', 115, 36, 0.65 * big, 1.0 * big);
      noise(t, 0.28 * big, 0.55 * big, [['lowpass', 520]]);
      noise(t + 0.02, 1.3 * big, 0.12 * big, [['lowpass', 260]], 0.03);
    },
    bloop(t) { tone(t, 'sine', rand(260, 420), rand(850, 1300), 0.09, 0.28, 0.006); },
    shh(t) { noise(t, 1.5, 0.5, [['highpass', 2300], ['bandpass', 4300, 0.7]], 0.2); },
    whoosh(t, up) {
      const [bp] = noise(t, 1.25, 0.75, [['bandpass', up ? 350 : 1800, 0.9]], 0.35);
      bp.frequency.exponentialRampToValueAtTime(up ? 1800 : 350, t + 1.4);
    },
    blip(t) { tone(t, 'sine', 1320, 1320, 0.09, 0.12); },
    chime(t) {
      [880, 1108.73, 1318.51, 1760].forEach((f, i) => {
        tone(t + i * 0.16, 'sine', f, f, 1.3, 0.22, 0.004);
        tone(t + i * 0.16, 'sine', f * 2.76, f * 2.76, 0.5, 0.04, 0.004);
      });
    },
  };
  const play = (fn, ...args) => { if (audio()) fn(ac.currentTime + 0.01, ...args); };

  /* ---------------- effects ---------------- */
  const fx = {};

  fx.blur = () => document.documentElement.classList.toggle('mk-blur');

  fx.confetti = () => {
    play(S.pop); later(() => play(S.pop), 90);
    const cv = el('mk-confetti', '', 'canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    live.add(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight, u = H / 900;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const cols = [C.pink, C.lime, C.teal, C.orange, C.blue, C.gold, C.cream];
    const ps = [];
    // Two cannons, bottom corners, aimed up and in.
    [[0, 1], [W, -1]].forEach(([x0, side]) => {
      for (let i = 0; i < 110; i++) {
        const a = (-90 + rand(14, 46)) * Math.PI / 180, v = rand(17, 33) * u;
        ps.push({ x: x0, y: H + 10, vx: side * Math.cos(a) * v, vy: Math.sin(a) * v, w: rand(7, 15) * u, h: rand(4, 8) * u,
          r: rand(0, 6.28), vr: rand(-0.25, 0.25), f: rand(0, 6.28), vf: rand(0.08, 0.2), c: cols[(Math.random() * cols.length) | 0] });
      }
    });
    const t0 = performance.now();
    let last = t0;
    const step = (now) => {
      if (!cv.isConnected) return;
      const k = Math.max(0, Math.min(3, (now - last) / 16.67)); // same speed at 60 or 120 Hz
      last = now;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      ps.forEach((p) => {
        const drag = Math.pow(0.985, k);
        p.vx *= drag; p.vy = p.vy * drag + 0.32 * u * k;
        p.x += (p.vx + Math.sin(p.f) * 0.6 * u) * k; p.y += p.vy * k; p.r += p.vr * k; p.f += p.vf * k;
        if (p.y < H + 30) alive++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.f));
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (alive && now - t0 < 7000) requestAnimationFrame(step); else { cv.remove(); live.delete(cv); }
    };
    requestAnimationFrame(step);
  };

  fx.drumroll = () => {
    const LEN = 2.4;
    if (audio()) { const t = ac.currentTime + 0.02; S.roll(t, LEN); S.crash(t + LEN + 0.04); }
    const drum = el('mk-emoji', '🥁');
    live.add(drum);
    drum.style.cssText = 'left:50%;bottom:5vh;font-size:17vh;';
    drum.animate([{ transform: 'translate(-50%, 40vh)' }, { transform: 'translate(-50%, 0)' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
    const shake = drum.animate([{ rotate: '-4deg' }, { rotate: '4deg' }], { duration: 70, iterations: Infinity, direction: 'alternate', delay: 380 });
    later(() => {
      shake.cancel();
      const flash = el('mk-flash'); live.add(flash);
      flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' }).finished.then(() => { flash.remove(); live.delete(flash); }, () => {});
      drum.animate([
        { transform: 'translate(-50%, 0) scale(1)', easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: 'translate(-50%, -4vh) scale(1.35)', offset: 0.18 },
        { transform: 'translate(-50%, 0) scale(1)', offset: 0.45 },
        { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, 0) scale(1)', opacity: 0 },
      ], { duration: 1700, fill: 'forwards' }).finished.then(() => { drum.remove(); live.delete(drum); }, () => {});
    }, (LEN + 0.06) * 1000);
  };

  fx.micdrop = () => {
    const mic = el('mk-emoji', '🎤');
    live.add(mic);
    mic.style.cssText = 'left:50%;top:0;font-size:19vh;';
    const FALL = 720;
    // Keyframe easing runs from that keyframe to the next: fall, bounce up, tip over.
    mic.animate([
      { transform: 'translate(-50%, -24vh) rotate(-12deg)', easing: 'cubic-bezier(.55,0,1,.45)' },
      { transform: 'translate(-50%, 68vh) rotate(14deg)', offset: FALL / 2600, easing: 'cubic-bezier(.2,.8,.4,1)' },
      { transform: 'translate(-50%, 61vh) rotate(48deg)', offset: (FALL + 160) / 2600, easing: 'cubic-bezier(.55,0,1,.45)' },
      { transform: 'translate(-50%, 70vh) rotate(88deg)', offset: (FALL + 330) / 2600 },
      { transform: 'translate(-50%, 70vh) rotate(88deg)', opacity: 1, offset: 0.85 },
      { transform: 'translate(-50%, 70vh) rotate(88deg)', opacity: 0 },
    ], { duration: 2600, fill: 'forwards' }).finished.then(() => { mic.remove(); live.delete(mic); }, () => {});
    if (audio()) { const t = ac.currentTime + FALL / 1000; S.thud(t, 1); S.thud(t + 0.33, 0.45); }
    later(() => {
      const h = document.documentElement;
      h.classList.remove('mk-shake'); void h.offsetWidth; h.classList.add('mk-shake');
      later(() => h.classList.remove('mk-shake'), 520);
    }, FALL);
  };

  fx.bubbles = () => {
    for (let i = 0; i < 34; i++) {
      const b = el('mk-bubble'); live.add(b);
      const s = rand(3, 11), dur = rand(3600, 6400), delay = rand(0, 1800);
      b.style.cssText = `left:${rand(2, 96)}vw;width:${s}vmin;height:${s}vmin;`;
      b.animate([
        { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
        { transform: `translate(${rand(-2, 2)}vw, -18vh) scale(1)`, opacity: 0.95, offset: 0.12 },
        { transform: `translate(${rand(-4, 4)}vw, -60vh) scale(1)`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(${rand(-5, 5)}vw, -125vh) scale(1.05)`, opacity: 0.85 },
      ], { duration: dur, delay, easing: 'cubic-bezier(.35,.1,.6,1)', fill: 'both' }).finished.then(() => { b.remove(); live.delete(b); }, () => {});
    }
    if (audio()) { const t = ac.currentTime; for (let k = 0; k < 9; k++) S.bloop(t + 0.05 + rand(0, 2.2)); }
  };

  fx.quiet = () => {
    play(S.shh);
    const dim = el('mk-dim'), face = el('mk-emoji', '🤫');
    live.add(dim); live.add(face);
    face.style.cssText = 'left:50%;top:50%;font-size:34vh;';
    const HOLD = 3600, opts = { duration: HOLD, fill: 'forwards' };
    dim.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }], opts);
    face.animate([
      { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0, easing: 'cubic-bezier(.34,1.56,.64,1)' },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.12 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.82 },
      { transform: 'translate(-50%, -50%) scale(.9)', opacity: 0 },
    ], opts).finished.then(() => { dim.remove(); face.remove(); live.delete(dim); live.delete(face); }, () => {});
  };

  let curtainBuilt = false;
  const curtainOpen = () => {
    if (!layer.classList.contains('mk-curtained')) return false;
    layer.classList.remove('mk-curtained'); return true;
  };
  fx.curtain = () => {
    if (!curtainBuilt) { el('mk-curtain l'); el('mk-curtain r'); el('mk-valance'); void layer.offsetWidth; curtainBuilt = true; }
    const closing = !layer.classList.contains('mk-curtained');
    layer.classList.toggle('mk-curtained', closing);
    play(S.whoosh, closing);
  };

  /* Timer: N minutes; a new number restarts it. It sits in whichever
     screen corner has the least slide text under it (none, on most
     slides), checked again on every slide change, so it doesn't cover
     a line. Dragging it pins it where it's dropped (as a fraction of the
     screen, so a resize keeps it in place) for this and later timers,
     until X. */
  let timer = null, pin = null;
  const SKIP = '.slide-num, .slide-num-badge, .slide-meta, .brand-mark';
  const textBoxes = () => {
    const s = document.querySelector('deck-stage > [data-deck-active]');
    const out = [];
    if (s) {
      const bm = s.querySelector(':scope > img.brand-mark');
      if (bm && bm.offsetParent !== null) out.push(bm.getBoundingClientRect());
    }
    if (s) s.querySelectorAll('*').forEach((n) => {
      if (n.closest(SKIP)) return;
      const media = /^(img|svg|video|canvas|iframe)$/i.test(n.tagName);
      if (!media && !Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())) return;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = n.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) out.push(r);
    });
    return out;
  };
  const CORNERS = ['tr', 'br', 'bl', 'tl', 'tc', 'bc'];
  const clampTo = (node, X, Y) => {
    const w = node.offsetWidth, h = node.offsetHeight;
    Object.assign(node.style, { bottom: '', right: '', transform: '', opacity: '',
      left: Math.max(0, Math.min(innerWidth - w, X)) + 'px', top: Math.max(0, Math.min(innerHeight - h, Y)) + 'px' });
  };
  const place = () => {
    if (!timer) return;
    if (pin) { clampTo(timer.node, pin[0] * innerWidth, pin[1] * innerHeight); timer.at = 'pin'; return; }
    const node = timer.node, w = node.offsetWidth, h = node.offsetHeight, m = Math.round(innerHeight * 0.024);
    const x = { l: m, r: innerWidth - m - w, c: (innerWidth - w) / 2 }, y = { t: m, b: innerHeight - m - h };
    const boxes = textBoxes();
    const cover = (k) => {
      const X = x[k[1]], Y = y[k[0]];
      return boxes.reduce((a, r) => a + Math.max(0, Math.min(X + w, r.right) - Math.max(X, r.left)) * Math.max(0, Math.min(Y + h, r.bottom) - Math.max(Y, r.top)), 0);
    };
    let best = CORNERS[0], least = Infinity;
    for (const k of CORNERS) { const c = cover(k); if (c < least) { least = c; best = k; } if (!c) break; }
    timer.cover = least;
    if (best === timer.at) return;
    const go = () => {
      Object.assign(node.style, { top: '', bottom: '', left: '', right: '', transform: '' });
      node.style[best[0] === 't' ? 'top' : 'bottom'] = m + 'px';
      if (best[1] === 'c') { node.style.left = '50%'; node.style.transform = 'translateX(-50%)'; }
      else node.style[best[1] === 'l' ? 'left' : 'right'] = m + 'px';
      node.style.opacity = '';
    };
    if (timer.at) { node.style.opacity = '0'; later(go, 200); } else go();
    timer.at = best;
  };
  document.addEventListener('slidechange', () => place());
  window.addEventListener('resize', () => place());
  const stopTimer = () => { if (!timer) return; clearInterval(timer.id); timer.node.remove(); timer = null; };
  const draggable = (node) => {
    let grab = null;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = node.getBoundingClientRect();
      grab = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
      node.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    node.addEventListener('pointermove', (e) => {
      if (!grab) return;
      if (!grab.moved && Math.hypot(e.clientX - grab.x0, e.clientY - grab.y0) < 4) return;
      grab.moved = true;
      node.classList.add('dragging');
      clampTo(node, e.clientX - grab.dx, e.clientY - grab.dy);
    });
    const drop = () => {
      if (!grab) return;
      if (grab.moved) {
        const r = node.getBoundingClientRect();
        pin = [r.left / innerWidth, r.top / innerHeight];
        if (timer) timer.at = 'pin';
      }
      grab = null;
      node.classList.remove('dragging');
    };
    node.addEventListener('pointerup', drop);
    node.addEventListener('pointercancel', drop);
    // A click on the badge shouldn't reach anything underneath.
    node.addEventListener('click', (e) => e.stopPropagation());
  };
  fx.timer = (min) => {
    stopTimer();
    const node = el(QUIET ? 'mk-timer quiet' : 'mk-timer', '<span class="mk-pie"></span><span class="mk-t"></span>');
    const total = min * 60000, end = performance.now() + total;
    const t = node.querySelector('.mk-t'), pie = node.querySelector('.mk-pie');
    const paint = () => {
      const left = Math.max(0, end - performance.now()), s = Math.ceil(left / 1000);
      t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      pie.style.setProperty('--p', `${(left / total) * 100}%`);
      node.classList.toggle('low', left > 0 && left <= 10000);
      if (left === 0) {
        clearInterval(timer.id); node.classList.remove('low'); node.classList.add('done');
        if (!QUIET) { t.textContent = 'Time!'; play(S.chime); }
      }
    };
    timer = { node, id: setInterval(paint, 200), at: null };
    draggable(node);
    paint();
    place();
    if (!QUIET) play(S.blip);
  };

  fx.clear = () => {
    document.documentElement.classList.remove('mk-blur', 'mk-shake');
    curtainOpen();
    stopTimer();
    pin = null;
    help(false);
    timers.forEach(clearTimeout); timers.clear();
    live.forEach((n) => { n.getAnimations && n.getAnimations().forEach((a) => a.cancel()); n.remove(); });
    live.clear();
    if (typeof window.__magicKeysOnClear === 'function') window.__magicKeysOnClear();
    hush();
  };

  /* Key list (Shift + /). Lists deck-stage's own keys too. */
  let helpEl = null;
  const ROWS = [
    ['Move around', [
      [['→', 'Space'], 'Next (clicker too)'],
      [['←'], 'Back'],
      [['H', 'Home'], 'First slide'],
      [['G'], 'Grid of all slides'],
      [['R'], 'Replay this slide’s animation'],
      [['L'], 'Laser pointer'],
      [['E'], 'Edit text + notes (rehearsal)'],
      [['F', '/'], 'Search slides'],
    ]],
    ['Magic', [
      [['B', '.'], 'Blur (again to clear)'],
      [['C'], 'Confetti'],
      [['D'], 'Drumroll'],
      [['M'], 'Mic drop'],
      [['O'], 'Bubbles'],
      [['Q'], 'Quiet'],
      [['U'], 'Curtain (again to open)'],
      [['1–9', '0'], 'Timer, in minutes (0 = 10); drag to move'],
      [['X'], 'Clear all effects'],
    ]],
  ];
  function help(show = !helpEl) {
    if (!show) { if (helpEl) { helpEl.remove(); helpEl = null; } return; }
    if (helpEl) return;
    helpEl = el('mk-help', `<div class="panel"><h2>Keyboard</h2><div class="cols">${ROWS.map(([h, rows]) =>
      `<div><h3>${h}</h3>${rows.map(([keys, label]) => `<div class="row"><span class="keys">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span><span>${label}</span></div>`).join('')}</div>`
    ).join('')}</div><p class="foot">Effects sit on top of the slide and never change it. <kbd>?</kbd> or <kbd>Esc</kbd> closes this.</p></div>`);
    helpEl.addEventListener('click', () => help(false));
  }

  const KEYS = { b: fx.blur, '.': fx.blur, c: fx.confetti, d: fx.drumroll, m: fx.micdrop, o: fx.bubbles, q: fx.quiet, u: fx.curtain, x: fx.clear, '?': () => help() };

  // Capture phase on window, so digits never reach deck-stage's
  // jump-to-slide handler.
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    let run = null;
    if (e.key === 'Escape' && helpEl) run = () => help(false);
    else if (/^[0-9]$/.test(e.key)) run = () => fx.timer(e.key === '0' ? 10 : Number(e.key));
    else run = KEYS[e.key.length === 1 ? e.key.toLowerCase() : ''] || null;
    if (!run) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) run();
  }, true);

  window.__magicKeysRegister = (opts) => {
    if (opts.fx) Object.assign(fx, opts.fx);
    if (opts.keys) Object.assign(KEYS, opts.keys);
    if (opts.helpRows) ROWS[1][1].push(...opts.helpRows);
  };
  window.__magicKeysKit = { el, live, later, audio, env, getBus: () => bus };
})();
