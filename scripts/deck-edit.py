#!/usr/bin/env python3
"""deck-edit.py — local rehearsal server + write-back for live deck edits.

Two jobs, one file, Python 3 standard library only:

  python3 scripts/deck-edit.py              # serve the repo at http://localhost:8769
  python3 scripts/deck-edit.py serve --port 9000 --lan
  python3 scripts/deck-edit.py apply edits.json [--dry-run]
  pbpaste | python3 scripts/deck-edit.py apply -

`serve` is a static file server for the repo root (same as
`python3 -m http.server`, but with caching off) that also accepts
`POST /__deck-edit/apply` from `engine/deck-edit.js`. That is what makes the
deck's "Save to file" button write your in-browser edits straight into the
deck's index.html.

`apply` takes the text that the deck's "Copy changes" / "Download" buttons
produce (a Markdown summary with a ```json block, or the bare JSON) and
applies it to the file. Use it when you edited somewhere the server wasn't
running: a hosted URL, an iPad, a file:// open.

How an edit finds its place in the source
-----------------------------------------
The browser sends, per edited element: the slide index, the tag, the
element's original text, which same-text occurrence it was, and the
element's innerHTML before and after. This script parses the deck with
source offsets, finds that element inside that slide, aligns the browser's
"before" HTML against the source token by token, and splices in only the
characters that changed. So fixing a typo changes that word in the file and
nothing else — entities, indentation and attribute quoting elsewhere in the
element stay as written. If the changed part touches something the page's
JavaScript rewrote at runtime (an icon, a shared value), the edit is refused
and stays as a browser draft rather than writing runtime markup into source.
"""

from __future__ import annotations

import argparse
import difflib
import html
import ipaddress
import json
import os
import re
import stat
import sys
import tempfile
import threading
from html.parser import HTMLParser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8769
API_PREFIX = "/__deck-edit/"

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
RAW_TEXT_TAGS = {"script", "style"}
NON_SLIDE_TAGS = {"template", "script", "style"}
# Start tags that implicitly close an open <p>.
P_CLOSERS = {
    "address", "article", "aside", "blockquote", "details", "div", "dl",
    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
    "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre",
    "section", "table", "ul",
}


# ── Source tree with offsets ────────────────────────────────────────────


class Node:
    __slots__ = ("tag", "attrs", "start", "inner_start", "inner_end", "end",
                 "parent", "children")

    def __init__(self, tag, attrs, start, inner_start, parent):
        self.tag = tag
        self.attrs = attrs
        self.start = start
        self.inner_start = inner_start
        self.inner_end = None  # stays None when the element is never explicitly closed
        self.end = None
        self.parent = parent
        self.children = []

    @property
    def closed(self):
        return self.inner_end is not None

    def iter(self):
        for child in self.children:
            yield child
            yield from child.iter()


class _TreeBuilder(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.text = text
        self.line_starts = [0]
        for m in re.finditer("\n", text):
            self.line_starts.append(m.end())
        self.root = Node("#root", {}, 0, 0, None)
        self.root.inner_end = len(text)
        self.stack = [self.root]

    def _offset(self):
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def _close_implied(self, tag):
        if tag == "li":
            self._pop_until_open("li", stop={"ul", "ol", "menu"})
        elif tag in ("dt", "dd"):
            for t in ("dt", "dd"):
                self._pop_until_open(t, stop={"dl"})
        elif tag in ("tr",):
            self._pop_until_open("tr", stop={"table", "tbody", "thead", "tfoot"})
        elif tag in ("td", "th"):
            for t in ("td", "th"):
                self._pop_until_open(t, stop={"tr", "table"})
        elif tag == "option":
            self._pop_until_open("option", stop={"select", "datalist"})
        if tag in P_CLOSERS:
            self._pop_until_open("p", stop={"div", "section", "li", "td", "th",
                                            "blockquote", "figure", "article",
                                            "aside", "header", "footer", "main",
                                            "button", "deck-stage"})

    def _pop_until_open(self, tag, stop):
        # Only pop if `tag` is open above every `stop` element.
        for i in range(len(self.stack) - 1, 0, -1):
            t = self.stack[i].tag
            if t == tag:
                del self.stack[i:]  # implicitly closed: inner_end stays None
                return
            if t in stop:
                return

    def handle_starttag(self, tag, attrs):
        start = self._offset()
        raw = self.get_starttag_text() or ""
        self._close_implied(tag)
        node = Node(tag, {k: (v if v is not None else "") for k, v in attrs},
                    start, start + len(raw), self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)
        else:
            node.inner_end = node.inner_start
            node.end = node.inner_start

    def handle_startendtag(self, tag, attrs):
        start = self._offset()
        raw = self.get_starttag_text() or ""
        node = Node(tag, {k: (v if v is not None else "") for k, v in attrs},
                    start, start + len(raw), self.stack[-1])
        node.inner_end = node.inner_start
        node.end = node.inner_start
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag):
        pos = self._offset()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                node = self.stack[i]
                node.inner_end = pos
                gt = self.text.find(">", pos)
                node.end = (gt + 1) if gt != -1 else len(self.text)
                del self.stack[i:]  # anything above it was implicitly closed
                return
        # stray end tag: ignore


def parse_tree(text):
    builder = _TreeBuilder(text)
    builder.feed(text)
    builder.close()
    return builder.root


def find_deck(root):
    for node in root.iter():
        if node.tag == "deck-stage":
            return node
    return None


def deck_slides(deck):
    return [c for c in deck.children if c.tag not in NON_SLIDE_TAGS]


# ── Tokens: what a stretch of HTML "means", with source spans ───────────

_TAG_RE = re.compile(
    r"<(/?)([A-Za-z][A-Za-z0-9:_-]*)"
    r"((?:\s+[^\s\"'>/=]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s\"'=<>`]+))?)*)"
    r"\s*/?\s*>")
_ATTR_RE = re.compile(
    r"([^\s\"'>/=]+)(?:\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'=<>`]+)))?")
_ENTITY_RE = re.compile(r"&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);?")


class Tok:
    __slots__ = ("kind", "key", "a", "b")

    def __init__(self, kind, key, a, b):
        self.kind, self.key, self.a, self.b = kind, key, a, b

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"Tok({self.kind},{self.key!r},{self.a},{self.b})"


def _tag_key(closing, name, attr_src):
    attrs = []
    for m in _ATTR_RE.finditer(attr_src or ""):
        k = m.group(1).lower()
        v = m.group(2) if m.group(2) is not None else (
            m.group(3) if m.group(3) is not None else (m.group(4) or ""))
        attrs.append((k, html.unescape(v)))
    return ("t", closing, name.lower(), tuple(sorted(attrs)))


def tokenize(s, start=0, end=None):
    """Split HTML into comparable tokens.

    Text becomes one token per decoded character (an entity is one token
    spanning its whole source text); tags become one token keyed on name +
    sorted attributes; comments and raw <script>/<style> bodies are single
    opaque tokens. Two strings that a browser would parse into the same DOM
    produce the same keys even when they're written differently.
    """
    end = len(s) if end is None else end
    toks = []
    i = start
    while i < end:
        ch = s[i]
        if ch == "<":
            if s.startswith("<!--", i):
                j = s.find("-->", i + 4)
                j = end if j == -1 or j + 3 > end else j + 3
                toks.append(Tok("x", ("!", s[i + 4:j - 3]), i, j))
                i = j
                continue
            m = _TAG_RE.match(s, i, end)
            if m:
                closing, name = m.group(1), m.group(2)
                toks.append(Tok("t", _tag_key(closing, name, m.group(3)), i, m.end()))
                i = m.end()
                lname = name.lower()
                if not closing and lname in RAW_TEXT_TAGS:
                    close = re.compile(r"</%s\s*>" % lname, re.I).search(s, i, end)
                    j = close.start() if close else end
                    if j > i:
                        toks.append(Tok("x", ("raw", s[i:j]), i, j))
                    i = j
                continue
            toks.append(Tok("c", "<", i, i + 1))
            i += 1
            continue
        if ch == "&":
            m = _ENTITY_RE.match(s, i, end)
            if m:
                decoded = html.unescape(m.group(0))
                if decoded != m.group(0):
                    toks.append(Tok("c", decoded, i, m.end()))
                    i = m.end()
                    continue
            toks.append(Tok("c", "&", i, i + 1))
            i += 1
            continue
        if ch == "\r" and i + 1 < end and s[i + 1] == "\n":
            toks.append(Tok("c", "\n", i, i + 2))
            i += 2
            continue
        toks.append(Tok("c", ch, i, i + 1))
        i += 1
    return toks


def text_of(toks):
    """Identity text: characters only, skipping <template> bodies and the
    contents of any element with a data-sync attribute (shared values that
    a script fills in at runtime, so the file's fallback text may differ
    from what the browser shows). deck-edit.js's idText() does the same."""
    out, tdepth = [], 0
    skip_tag, skip_depth = None, 0
    for t in toks:
        if t.kind == "t":
            closing, name, attrs = t.key[1], t.key[2], dict(t.key[3])
            if skip_tag is not None:
                if name == skip_tag:
                    skip_depth += -1 if closing else 1
                    if skip_depth == 0:
                        skip_tag = None
                continue
            if name == "template":
                tdepth = max(0, tdepth + (-1 if closing else 1))
                continue
            if not closing and "data-sync" in attrs and name not in VOID_TAGS:
                skip_tag, skip_depth = name, 1
            continue
        if t.kind == "c" and tdepth == 0 and skip_tag is None:
            out.append(t.key)
    return "".join(out)


def norm(s):
    return re.sub(r"[\s ]+", " ", s or "").strip()


def keys(toks):
    return [t.key for t in toks]


# ── Applying edits ──────────────────────────────────────────────────────


class EditError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _node_text(src, node, cache):
    if "data-sync" in node.attrs:
        return ""
    t = cache.get(id(node))
    if t is None:
        t = norm(text_of(tokenize(src, node.inner_start, node.inner_end)))
        cache[id(node)] = t
    return t


def _slide_key(node):
    """The slide's label as written in the file. deck-stage.js records the
    same value (slide.__deckSrc.label) before it rewrites data-screen-label."""
    return norm(node.attrs.get("data-label") or node.attrs.get("data-screen-label") or "")


def resolve_slide(slides, idx, key):
    """Which source slide an edit belongs to. The browser sends the slide's
    position in the file and its label; when the label no longer matches that
    position, follow the label if it's unique, otherwise refuse."""
    in_range = isinstance(idx, int) and not isinstance(idx, bool) and 0 <= idx < len(slides)
    if key:
        if in_range and _slide_key(slides[idx]) == key:
            return idx
        hits = [i for i, s in enumerate(slides) if _slide_key(s) == key]
        if len(hits) == 1:
            return hits[0]
        raise EditError("conflict", "Couldn't find that slide in the file (it was moved, renamed or removed since).")
    if in_range:
        return idx
    raise EditError("not-found", "That slide isn't in the file.")


def plan_edit(src, slides, edit, cache):
    """Return (start, end, replacement, node) for one element edit, or raise
    EditError. Only ever looks inside the edit's own slide, and only takes an
    exact text match: anything less certain is refused so the draft is kept."""
    before, after = edit.get("before", ""), edit.get("after", "")
    b, a = tokenize(before), tokenize(after)
    tag = (edit.get("tag") or "").lower()
    want = norm(edit.get("text", ""))
    nth = edit.get("nth") or 0
    if not isinstance(nth, int) or nth < 0:
        raise EditError("error", "Bad occurrence number.")

    scope = slides[resolve_slide(slides, edit.get("slide"), norm(edit.get("slideKey") or ""))]
    cands = [n for n in scope.iter() if n.tag == tag and n.closed]
    exact = [n for n in cands if _node_text(src, n, cache) == want]
    if nth >= len(exact):
        ak = keys(a)
        if any(keys(tokenize(src, n.inner_start, n.inner_end)) == ak for n in cands):
            raise EditError("already", "The file already has this text.")
        if exact:
            raise EditError("not-found", "The slide has fewer copies of this text than the page did; it changed since.")
        raise EditError("not-found", "Couldn't find this text on that slide in the file (it changed since).")
    node = exact[nth]

    s_toks = tokenize(src, node.inner_start, node.inner_end)
    if keys(s_toks) == keys(a):
        raise EditError("already", "The file already has this text.")

    bk, ak = keys(b), keys(a)
    p = 0
    while p < len(bk) and p < len(ak) and bk[p] == ak[p]:
        p += 1
    s = 0
    while s < len(bk) - p and s < len(ak) - p and bk[-1 - s] == ak[-1 - s]:
        s += 1
    q = len(bk) - s          # changed region in before: [p, q)
    aq = len(ak) - s         # replacement tokens in after: [p, aq)
    replacement = after[a[p].a:a[aq - 1].b] if aq > p else ""

    # Map before-token positions onto source tokens via their equal runs.
    sk = keys(s_toks)
    mapping = {}
    for op, i1, i2, j1, _j2 in difflib.SequenceMatcher(None, bk, sk, autojunk=False).get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                mapping[i1 + k] = j1 + k

    if q > p:
        if any(i not in mapping for i in range(p, q)):
            raise EditError("unsafe", "This change touches markup the page rewrites when it runs (an icon or shared value). Edit it in the source instead.")
        j0, j1 = mapping[p], mapping[q - 1]
        if j1 - j0 != q - 1 - p:
            raise EditError("unsafe", "The source around this change doesn't line up with what the browser showed.")
        return s_toks[j0].a, s_toks[j1].b, replacement, node

    # Pure insertion between before[p-1] and before[p].
    if p > 0 and (p - 1) in mapping:
        pos = s_toks[mapping[p - 1]].b
    elif p < len(bk) and p in mapping:
        pos = s_toks[mapping[p]].a
    elif not bk and not s_toks:
        pos = node.inner_start
    else:
        raise EditError("unsafe", "Couldn't line up where this text goes.")
    return pos, pos, replacement, node


def _find_notes_node(root):
    for node in root.iter():
        if node.tag == "script" and node.attrs.get("id") == "speaker-notes" and node.closed:
            return node
    return None


def plan_notes(src, root, deck, slides, notes):
    """Return (patch or None, results) for speaker-notes edits."""
    results = []
    if not notes:
        return None, results
    node = _find_notes_node(root)
    if node is not None:
        raw = src[node.inner_start:node.inner_end]
        try:
            arr = json.loads(raw) if raw.strip() else []
        except ValueError as exc:
            for n in notes:
                results.append({"id": n.get("id"), "kind": "note", "status": "error",
                                "message": f"#speaker-notes isn't valid JSON ({exc})."})
            return None, results
        if not isinstance(arr, list):
            for n in notes:
                results.append({"id": n.get("id"), "kind": "note", "status": "error",
                                "message": "#speaker-notes isn't a JSON array."})
            return None, results
        multiline = "\n" in raw.strip()
        spaced = '", "' in raw
    else:
        arr, raw, multiline, spaced = [], None, True, False

    changed = False
    for n in notes:
        rid = n.get("id")
        try:
            i = resolve_slide(slides, n.get("slide"), norm(n.get("slideKey") or ""))
        except EditError as exc:
            results.append({"id": rid, "kind": "note", "status": exc.status, "message": exc.message})
            continue
        cur = arr[i] if i < len(arr) and isinstance(arr[i], str) else ""
        new, old = n.get("after", ""), n.get("before", "")
        if cur == new:
            results.append({"id": rid, "kind": "note", "status": "already"})
            continue
        if cur != old:
            results.append({"id": rid, "kind": "note", "status": "conflict",
                            "message": "The note in the file changed since this page loaded."})
            continue
        while len(arr) <= i:
            arr.append("")
        arr[i] = new
        changed = True
        results.append({"id": rid, "kind": "note", "status": "applied"})

    if not changed:
        return None, results
    if multiline:
        body = json.dumps(arr, ensure_ascii=False, indent=2)
    else:
        body = json.dumps(arr, ensure_ascii=False, separators=(", " if spaced else ",", ": "))
    # No raw "<" inside a <script>: "</script>" would close it early and
    # "<!--" + "<script" would make the parser swallow the rest of the page.
    body = body.replace("<", "\\u003c")
    if node is not None:
        return (node.inner_start, node.inner_end, body), results
    tag = f'<script type="application/json" id="speaker-notes">{body}</script>\n'
    return (deck.start, deck.start, tag), results


def apply_payload(src, payload):
    """Apply a deck-edits payload to HTML source. Returns (new_src, results)."""
    root = parse_tree(src)
    deck = find_deck(root)
    if deck is None:
        raise EditError("error", "No <deck-stage> element in this file.")
    slides = deck_slides(deck)
    cache = {}
    patches, results, claimed = [], [], {}
    for edit in payload.get("edits") or []:
        rid = edit.get("id")
        try:
            start, end, rep, node = plan_edit(src, slides, edit, cache)
            if id(node) in claimed:
                raise EditError("conflict", "Another change in this save edits the same text box; kept as a draft.")
            claimed[id(node)] = rid
            patches.append((start, end, rep, rid))
            results.append({"id": rid, "kind": "text", "status": "applied"})
        except EditError as exc:
            results.append({"id": rid, "kind": "text", "status": exc.status, "message": exc.message})

    note_patch, note_results = plan_notes(src, root, deck, slides, payload.get("notes") or [])
    results.extend(note_results)
    if note_patch:
        patches.append(note_patch + ("notes",))

    # Overlapping patches can't both be right; keep the first, refuse the rest.
    patches.sort(key=lambda p: (p[0], p[1]))
    kept, last_end = [], -1
    for p in patches:
        if p[0] < last_end:
            for r in results:
                if r["id"] == p[3] and r["status"] == "applied":
                    r["status"], r["message"] = "conflict", "Overlaps another edit in this batch."
            continue
        kept.append(p)
        last_end = max(last_end, p[1])
    out = src
    # Right to left; at the same start, a replacement goes before an insertion.
    for start, end, rep, _rid in sorted(kept, key=lambda p: (p[0], p[1]), reverse=True):
        out = out[:start] + rep + out[end:]
    return out, results


# ── File resolution + payload parsing ───────────────────────────────────


def resolve_deck_file(payload, override=None):
    if override:
        path = Path(override).expanduser()
        path = path if path.is_absolute() else (Path.cwd() / path)
        return path.resolve()
    candidates = []
    if payload.get("file"):
        candidates.append(payload["file"])
    deck_path = payload.get("deckPath") or ""
    if deck_path:
        p = deck_path if not deck_path.endswith("/") else deck_path + "index.html"
        candidates.append(p)
    for cand in candidates:
        cand = cand.replace("\\", "/")
        p = Path(cand)
        if p.is_absolute() and p.exists():
            return p.resolve()
        parts = [x for x in cand.split("/") if x]
        # Try the longest suffix of the path that exists under the repo
        # (handles file:///Users/…/repo/deck/index.html and /deck/ URLs).
        for k in range(len(parts)):
            rel = REPO_ROOT.joinpath(*parts[k:])
            if rel.is_file():
                return rel.resolve()
    raise EditError("error", "Couldn't work out which deck file these edits belong to. Pass --file.")


def _inside_repo(path):
    try:
        path.resolve().relative_to(REPO_ROOT)
        return True
    except ValueError:
        return False


def load_payload_text(text):
    text = text.strip()
    if text.startswith("{"):
        return json.loads(text)
    m = re.search(r"```json\s*\n(.*?)\n```", text, re.S)
    if m:
        return json.loads(m.group(1))
    raise ValueError("No JSON found. Expected the deck's Copy changes text or a .json download.")


_SAVE_LOCK = threading.Lock()


def apply_to_file(payload, override=None, dry_run=False):
    path = resolve_deck_file(payload, override)
    if not _inside_repo(path):
        raise EditError("error", f"{path} is outside this repo.")
    if path.suffix.lower() not in (".html", ".htm"):
        raise EditError("error", f"{path.name} isn't an HTML file.")
    # One save at a time, so two tabs saving together can't drop an edit.
    with _SAVE_LOCK:
        # newline="" keeps the file's own line endings (CRLF stays CRLF).
        with open(path, encoding="utf-8", newline="") as fh:
            src = fh.read()
        new_src, results = apply_payload(src, payload)
        title_note = None
        want_title = payload.get("title")
        if want_title:
            m = re.search(r"<title>(.*?)</title>", src, re.S | re.I)
            if m and norm(html.unescape(m.group(1))) != norm(want_title):
                title_note = f"Heads up: the edits came from a page titled “{want_title}”, this file is titled “{norm(html.unescape(m.group(1)))}”."
        if new_src != src and not dry_run:
            _write_atomic(path, new_src)
    return path, src, new_src, results, title_note


def _write_atomic(path, text):
    """Write next to the file, then swap it in, so a crash or a reader in the
    middle never sees half a deck."""
    mode = stat.S_IMODE(os.stat(path).st_mode)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ── HTTP server ─────────────────────────────────────────────────────────


def _host_ok(host_header, lan=False):
    """Only answer requests addressed to this machine. A web page can't make
    the browser send Host: localhost, so this blocks DNS-rebinding pages
    (evil.example pointed at 127.0.0.1) from reading or writing the repo."""
    host = (host_header or "").strip().lower()
    if not host:
        return False
    if host.startswith("["):
        name = host[1:host.find("]")] if "]" in host else host[1:]
    elif host.count(":") == 1:
        name = host.rsplit(":", 1)[0]
    else:
        name = host
    if name in ("localhost", "127.0.0.1", "::1") or name.endswith(".localhost"):
        return True
    if lan:
        try:
            ipaddress.ip_address(name)
            return True
        except ValueError:
            return name.endswith(".local")
    return False


class DeckHandler(SimpleHTTPRequestHandler):
    server_version = "deck-edit/1"
    lan = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_request(self, code="-", size="-"):
        # Quiet for ordinary asset hits; log saves and errors.
        try:
            status = int(code)
        except (TypeError, ValueError):
            status = 0
        if status >= 400 or self.path.startswith(API_PREFIX):
            super().log_request(code, size)

    def _json(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _refuse_foreign_host(self):
        if _host_ok(self.headers.get("Host"), self.lan):
            return False
        self._json(403, {"ok": False, "message": "Requests must be addressed to localhost."})
        return True

    def do_GET(self):
        if self._refuse_foreign_host():
            return None
        if self.path.split("?")[0] == API_PREFIX + "status":
            return self._json(200, {"ok": True, "version": 2, "repo": REPO_ROOT.name})
        return super().do_GET()

    def do_HEAD(self):
        if self._refuse_foreign_host():
            return None
        return super().do_HEAD()

    def do_POST(self):
        if self._refuse_foreign_host():
            return None
        if self.path.split("?")[0] != API_PREFIX + "apply":
            return self._json(404, {"ok": False, "message": "Unknown endpoint."})
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if origin and origin.split("://", 1)[-1] != host:
            return self._json(403, {"ok": False, "message": "Cross-origin save refused."})
        # JSON only: a cross-site form or text/plain POST can't set this
        # without a CORS preflight, which this server never answers.
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            return self._json(415, {"ok": False, "message": "Send JSON (Content-Type: application/json)."})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 5_000_000:
                return self._json(413, {"ok": False, "message": "Payload too large."})
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("expected a JSON object")
            path, _src, new_src, results, title_note = apply_to_file(payload)
            applied = sum(1 for r in results if r["status"] == "applied")
            rel = path.relative_to(REPO_ROOT).as_posix()
            self.log_message("saved %d edit(s) to %s", applied, rel)
            return self._json(200, {"ok": True, "file": rel, "results": results,
                                    "note": title_note})
        except EditError as exc:
            return self._json(400, {"ok": False, "message": exc.message})
        except (ValueError, KeyError, TypeError, AttributeError, UnicodeDecodeError) as exc:
            return self._json(400, {"ok": False, "message": f"Bad request: {exc}"})


def list_decks():
    decks = []
    for index in [REPO_ROOT / "index.html", *sorted(REPO_ROOT.glob("*/index.html"))]:
        if not index.is_file():
            continue
        try:
            head = index.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "<deck-stage" in head:
            decks.append("" if index.parent == REPO_ROOT else index.parent.name + "/")
    return decks


def cmd_serve(args):
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    DeckHandler.lan = bool(args.lan)
    server = ThreadingHTTPServer((host, args.port), DeckHandler)
    base = f"http://localhost:{args.port}"
    print(f"Serving {REPO_ROOT.name} at {base}/  (Ctrl+C to stop)")
    print("Open a deck, press E to edit, then Save to file. Decks here:")
    for name in list_decks():
        print(f"  {base}/{name}")
    if args.lan:
        print("\n--lan: anyone on this network can open AND save to these decks while it runs.")
        print("On the iPad, open http://<this computer's IP address or name>.local:%d/<deck>/" % args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


def cmd_apply(args):
    text = sys.stdin.read() if args.source == "-" else Path(args.source).read_text(encoding="utf-8")
    try:
        payload = load_payload_text(text)
        path, src, new_src, results, title_note = apply_to_file(payload, args.file, args.dry_run)
    except (EditError, ValueError) as exc:
        print(f"error: {getattr(exc, 'message', exc)}", file=sys.stderr)
        return 2
    rel = path.relative_to(REPO_ROOT).as_posix() if _inside_repo(path) else str(path)
    if title_note:
        print(title_note)
    by_id = {e.get("id"): e for e in payload.get("edits", []) + payload.get("notes", [])}
    for r in results:
        e = by_id.get(r["id"], {})
        what = f"slide {e.get('slide', '?')} · {e.get('label', '')}".strip(" ·")
        kind = "note" if r["kind"] == "note" else f"<{e.get('tag', '?')}>"
        line = f"  [{r['status']}] {what} {kind}"
        if r.get("message"):
            line += f" — {r['message']}"
        print(line)
    if args.dry_run and new_src != src:
        sys.stdout.writelines(difflib.unified_diff(
            src.splitlines(True), new_src.splitlines(True), f"a/{rel}", f"b/{rel}"))
    applied = sum(1 for r in results if r["status"] == "applied")
    verb = "would change" if args.dry_run else "changed"
    print(f"{applied} of {len(results)} applied; {rel} {verb if new_src != src else 'unchanged'}.")
    return 0 if all(r["status"] in ("applied", "already") for r in results) else 1


def main(argv=None):
    # Windows consoles default to a code page that can't print ʻokina or kahakō.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd")
    p_serve = sub.add_parser("serve", help="serve the repo with Save to file enabled (default)")
    p_serve.add_argument("--port", type=int, default=int(os.environ.get("DECK_PORT", DEFAULT_PORT)))
    p_serve.add_argument("--lan", action="store_true", help="listen on all interfaces (iPad on the same Wi-Fi)")
    p_apply = sub.add_parser("apply", help="apply copied/downloaded edits to the deck file")
    p_apply.add_argument("source", help="the saved Copy changes text or .json download ('-' for stdin)")
    p_apply.add_argument("--file", help="deck file to apply to (default: worked out from the edits)")
    p_apply.add_argument("--dry-run", action="store_true", help="show the diff, don't write")
    args = parser.parse_args(argv)
    if args.cmd == "apply":
        return cmd_apply(args)
    if args.cmd is None:
        args = p_serve.parse_args([])
    return cmd_serve(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
