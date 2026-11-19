#!/usr/bin/env python3
"""check.py: the pre-delivery checks for this deck, in one run.

    python scripts/check.py            (Windows: py scripts/check.py)
    python scripts/check.py other.html

Python 3 standard library only. Reports, never edits. Exit code 1 if
anything FAILs, so an agent can't miss it.

Checks:
  notes      one speaker note per slide (they're matched by position)
  todo       TODO / TK / [placeholder] text still in the deck
  suggest    suggestion marks (data-sg, ins.sg, del.sg) not yet resolved
  periods    headings, eyebrows and card titles ending in a period
  offline    scripts, styles, fonts or images loaded from the internet
  files      local files the deck points at that don't exist
  alt        images without alt text
  effects    data-fx names that don't exist, or effects.js not loaded
  contrast   text color pairs from theme.css under 4.5:1, and the same
             for every look in themes/ the deck offers
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAILS = 0


def report(level, check, msg):
    global FAILS
    if level == "FAIL":
        FAILS += 1
    print(f"{level:4}  {check:8}  {msg}")


class Deck(HTMLParser):
    """Collects slides, their labels, text and a few element facts."""

    HEADING_CLASSES = {"eyebrow", "title", "hero"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.deck_depth = None
        self.slides = []          # dicts: label, text, headings, sg
        self.cur = None
        self.capture = []         # stack of (tag, depth, buffer) for heading text
        self.notes_raw = None
        self._in_notes = False
        self.refs = []            # (attr, value, label)
        self.fx = []              # (names, label)
        self.scripts = []
        self.imgs_no_alt = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in self.VOID:
            self.depth += 1
        if tag == "script" and a.get("id") == "speaker-notes":
            self._in_notes = True
            self.notes_raw = ""
        if tag == "deck-stage":
            self.deck_depth = self.depth
        elif tag == "section" and self.deck_depth is not None and self.depth == self.deck_depth + 1:
            label = a.get("data-screen-label") or f"slide {len(self.slides) + 1}"
            self.cur = {"label": label, "text": [], "headings": [], "sg": "data-sg" in a, "depth": self.depth}
            self.slides.append(self.cur)
        label = self.cur["label"] if self.cur else "(outside slides)"
        cls = set((a.get("class") or "").split())
        if self.cur is not None:
            if tag in {"ins", "del"} and "sg" in cls:
                self.cur["sg"] = True
            if tag in {"h1", "h2", "h3"} or cls & self.HEADING_CLASSES:
                self.capture.append([tag, self.depth, []])
        if a.get("data-fx"):
            self.fx.append((a["data-fx"], label))
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        if tag == "img" and not a.get("alt"):
            self.imgs_no_alt.append((a.get("src") or "?", label))
        for attr in ("src", "href", "poster"):
            if a.get(attr) and not (tag == "a" and attr == "href"):
                self.refs.append((attr, a[attr], label))

    VOID = {"img", "br", "meta", "link", "source", "input", "hr", "wbr", "col", "area", "track", "embed"}

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if tag == "script" and self._in_notes:
            self._in_notes = False
        if self.capture and self.capture[-1][0] == tag and self.capture[-1][1] == self.depth:
            _, _, buf = self.capture.pop()
            text = " ".join("".join(buf).split())
            if self.cur is not None and text:
                self.cur["headings"].append(text)
        if self.cur is not None and tag == "section" and self.depth == self.cur["depth"]:
            self.cur = None
        if tag == "deck-stage":
            self.deck_depth = None
        self.depth -= 1

    def handle_data(self, data):
        if self._in_notes:
            self.notes_raw += data
            return
        if self.cur is not None:
            self.cur["text"].append(data)
            for c in self.capture:
                c[2].append(data)


# ---------- contrast ----------

def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def luminance(rgb):
    def ch(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = luminance(hex_to_rgb(a)), luminance(hex_to_rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# The names engine/effects.js knows (see effects.html).
FX_NAMES = {"stagger", "steps", "typewriter", "scramble", "count", "pop", "mark",
            "zoom", "reveal", "flip", "timer", "clock", "until", "today"}

# (text token, background token, what it's used for)
# 4.5:1 is the floor for text (WCAG AA). 3:1 is the floor for non-text marks
# like bullet dots and quote marks; those only WARN. Big titles could get by
# on 3:1 too, but every role below also colors small text somewhere, so the
# kit holds 4.5:1. Text drawn with opacity (.small, .sub at .8 to .85) reads
# lower than these numbers: leave headroom.
PAIRS = [
    ("ink", "paper", "body text on light slides", 4.5),
    ("ink", "paper-alt", "body text on the alternate light slides", 4.5),
    ("ink-soft", "paper", "captions and small text", 4.5),
    ("ink-soft", "paper-alt", "captions on the alternate light slides", 4.5),
    ("accent-text", "paper", "eyebrows and numbers on light slides", 4.5),
    ("accent-text", "paper-alt", "eyebrows on the alternate light slides", 4.5),
    ("on-ink", "deep", "text on dark slides", 4.5),
    ("accent-on-ink", "deep", "eyebrows, numbers, quote marks on dark slides", 4.5),
    ("on-accent", "accent", "text on accent slides", 4.5),
    ("on-highlight", "highlight", "highlighted words", 4.5),
    ("accent", "paper", "bullet dots and quote marks on light slides", 3),
    ("accent", "paper-alt", "bullet dots on the alternate light slides", 3),
]


# Optional roles fall back to these when a theme leaves them unset.
FALLBACK = {"deep": "ink", "on-highlight": "ink"}
TOKEN_RE = r"--([\w-]+)\s*:\s*(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))(?![0-9a-fA-F])"


def tokens_of(css):
    return dict(re.findall(TOKEN_RE, re.sub(r"/\*.*?\*/", "", css, flags=re.S)))


def check_contrast(tokens, label="contrast", summary=False):
    rows = []
    for fg, bg, use, need in PAIRS:
        f = tokens.get(fg) or tokens.get(FALLBACK.get(fg, ""))
        b = tokens.get(bg) or tokens.get(FALLBACK.get(bg, ""))
        if not f or not b:
            report("WARN", label, f"--{fg} on --{bg}: not a plain #hex, measure it by hand")
            continue
        r = ratio(f, b)
        level = "ok" if r >= need else ("WARN" if need < 4.5 else "FAIL")
        rows.append((level, r, f"{r:4.1f}:1  --{fg} on --{bg} ({use}; needs {need}:1)"))
    if summary:
        bad = [row for row in rows if row[0] != "ok"]
        for level, _, msg in bad:
            report(level, label, msg)
        if not bad and rows:
            low = min(rows, key=lambda row: row[1])
            report("ok", label, f"all {len(rows)} color pairs pass (lowest {low[1]:.1f}:1)")
        return
    for level, _, msg in rows:
        report(level, label, msg)


def themes_used(src):
    names = []
    for m in re.finditer(r'data-themes="([^"]*)"', src):
        names += m.group(1).split()
    m = re.search(r'<html[^>]*\sdata-theme="([^"]+)"', src)
    if m:
        names.append(m.group(1))
    return list(dict.fromkeys(names))


def main():
    # Windows consoles default to a code page that can't print ʻokina or kahakō.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    deck_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "index.html"
    if not deck_path.is_absolute():
        deck_path = (Path.cwd() / deck_path).resolve()
    src = deck_path.read_text(encoding="utf-8")
    p = Deck()
    p.feed(src)
    print(f"Checking {deck_path.name}: {len(p.slides)} slides\n")

    # notes
    try:
        notes = json.loads(p.notes_raw) if p.notes_raw is not None else None
    except json.JSONDecodeError as exc:
        notes = None
        report("FAIL", "notes", f"speaker notes aren't valid JSON ({exc})")
    if isinstance(notes, list):
        if len(notes) == len(p.slides):
            report("ok", "notes", f"{len(notes)} notes for {len(p.slides)} slides")
        elif not notes:
            report("WARN", "notes", "no speaker notes yet")
        else:
            report("FAIL", "notes", f"{len(notes)} notes for {len(p.slides)} slides; notes after the first added or removed slide are on the wrong slide")

    # todo
    todo_re = re.compile(r"\bTODO\b|\bTK\b|\[placeholder\]", re.I)
    todo = [s["label"] for s in p.slides if todo_re.search("".join(s["text"]))]
    m = re.search(r"<title>(.*?)</title>", src, re.S)
    if m and todo_re.search(m.group(1)):
        todo.insert(0, "<title> (the browser tab)")
    if todo:
        report("FAIL", "todo", f"{len(todo)} places still have TODO text: " + ", ".join(todo))
    else:
        report("ok", "todo", "no TODO text on slides or in the page title")
    if isinstance(notes, list):
        nt = [p.slides[i]["label"] for i, n in enumerate(notes[:len(p.slides)]) if isinstance(n, str) and todo_re.search(n)]
        if nt:
            report("WARN", "todo", "speaker notes still marked TODO: " + ", ".join(nt))

    # suggestions
    sg = [s["label"] for s in p.slides if s["sg"]]
    if sg:
        report("FAIL", "suggest", "unresolved suggestions on: " + ", ".join(sg))
    else:
        report("ok", "suggest", "no open suggestions")

    # periods
    dotted = []
    for s in p.slides:
        for h in s["headings"]:
            if h.endswith(".") and not h.endswith("..."):
                dotted.append(f'{s["label"]}: "{h[-40:]}"')
    if dotted:
        report("WARN", "periods", "headings ending in a period (drop it unless it's a quote): " + "; ".join(dotted))
    else:
        report("ok", "periods", "no periods at the end of headings")

    # offline + files
    css_path = deck_path.parent / "theme.css"
    if not css_path.exists():
        css_path = ROOT / "theme.css"
    css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""
    refs = list(p.refs)
    for u in re.findall(r"url\(\s*['\"]?([^'\")]+)", re.sub(r"/\*.*?\*/", "", css, flags=re.S)):
        refs.append(("url()", u, "theme.css"))
    for u in re.findall(r"@import\s+(?:url\()?['\"]?([^'\");]+)", css):
        refs.append(("@import", u, "theme.css"))
    online, missing = [], []
    for attr, val, where in refs:
        if val.startswith(("data:", "#", "mailto:", "javascript:")):
            continue
        if re.match(r"^(https?:)?//", val):
            online.append(f"{where}: {val}")
            continue
        local = (deck_path.parent / val.split("?")[0].split("#")[0])
        if not local.exists():
            missing.append(f"{where}: {val}")
    if online:
        report("WARN", "offline", "loaded from the internet, so it breaks without wifi: " + "; ".join(online))
    else:
        report("ok", "offline", "everything loads from this folder")
    if missing:
        report("FAIL", "files", "missing files: " + "; ".join(missing))
    else:
        report("ok", "files", "every local file the deck uses exists")

    # alt
    if p.imgs_no_alt:
        report("WARN", "alt", "images without alt text: " + "; ".join(f"{w}: {s}" for s, w in p.imgs_no_alt))
    else:
        report("ok", "alt", "every image has alt text")

    # effects
    if p.fx:
        unknown = [f"{w}: {n}" for names, w in p.fx for n in names.split() if n not in FX_NAMES]
        loaded = any(s.split("?")[0].endswith("effects.js") for s in p.scripts)
        if not loaded:
            report("FAIL", "effects", "slides use data-fx but engine/effects.js isn't loaded (uncomment its script tag)")
        elif unknown:
            report("WARN", "effects", "unknown effect names: " + "; ".join(unknown))
        else:
            report("ok", "effects", f"{len(p.fx)} effects, all known")

    # contrast
    base = tokens_of(css)
    check_contrast(base)
    for name in themes_used(src):
        tp = ROOT / "themes" / f"{name}.css"
        if not tp.exists():
            report("FAIL", "themes", f"themes/{name}.css doesn't exist")
            continue
        check_contrast({**base, **tokens_of(tp.read_text(encoding="utf-8"))}, name, summary=True)

    print()
    if FAILS:
        print(f"{FAILS} check(s) failed. Fine while building; fix before you present.")
        return 1
    print("All checks pass. Still open the deck and look: this script can't see layout.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
