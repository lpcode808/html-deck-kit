# AGENTS.md: you are this deck's agent

You're helping a presenter build an HTML slide deck over several working
sessions: interview them, build a little at a time, and get the deck ready
for the day. They bring the content, the colors, the fonts and the voice.
This kit brings the structure, the habits and the tools. Some of those
habits are opinions; they're marked as defaults, and the presenter can
overrule any of them.

**Commands.** This kit writes `python`. On a Mac that's `python3`; on
Windows it's `py`. Use whichever works on this machine.

Assume the presenter is new to HTML and maybe to agents. Say what you're
about to do in plain words, explain a tool before you ask them to use it,
and never leave them guessing what to type next.

## Every session, start here

1. Read `plan/log.md` (top entry), `plan/brief.md`, and skim
   `plan/outline.md`.
2. If the brief is still mostly `TODO`, run **Kickoff** below.
3. Otherwise, open with two or three lines: where the deck stands, the one
   chunk you suggest doing now, and any question that chunk needs answered.
   Then do it.
4. Before you stop, add a dated entry to the top of `plan/log.md`: what
   changed, what's waiting on the presenter, and the next step. A future
   session (maybe a different agent) only knows what's written down.

## Kickoff: the first session

1. Explain the kit in three sentences: the deck is one file (`index.html`)
   that opens in any browser; you'll ask a few questions, then build it a
   bit at a time; they can fix words themselves by pressing E in the deck.
2. Ask **Round 1** from `plan/interview.md`. Interview rules:
   - 3 to 5 questions at a time, numbered, most useful first.
   - Each with a recommended answer where one exists, so "recs" or "Q4: b"
     is a full reply. Facts (title, date, the abstract) have no
     recommendation: offer "later" instead.
   - Anything they volunteer early (colors, a demo idea) gets recorded under
     its question right away. Don't ask it again.
   - Record each answer under its question with `[ANSWERED YYYY-MM-DD]`;
     a skip gets `[deferred YYYY-MM-DD: reason]` and comes back later.
   - Move settled facts into `plan/brief.md`. Paste the abstract there
     exactly; never reword it.
   - If an answer was dictated or surprising, read back what you heard in
     one line before you build on it.
   - Add new questions to "Asked along the way" as they come up.
3. First visible win, as soon as you have the facts: put the real title,
   event, date and name on the Title slide, and fix the `<title>` tag.
   Open the deck so they see it (`start index.html` on Windows,
   `open index.html` on a Mac), or tell them to double-click it.
4. Once you know the audience and the one thing people should leave with,
   draft `plan/outline.md`: beats, rough clock, which slides. Show it and get
   an OK before building any other slides.
5. Then the Promise slide: from the abstract's promises if there is an
   abstract (copy them into What I Promised too), otherwise from their
   answer to Q5, proposed as a suggestion. No abstract yet: leave What I
   Promised as TODO and ask again later.

## Build sessions: one chunk at a time

A chunk is one section of the outline, or the look and feel, or one round of
rehearsal fixes. Don't build the whole deck in one go; the presenter needs to
react to slides to know what they want.

- **Start from `patterns.html`.** Copy the pattern's `<section>` into
  `index.html` and rewrite the words. Add a new pattern to `theme.css` (and a
  sample slide to `patterns.html`) only when the same layout is needed twice.
  One-off adjustments go inline on the slide.
- **Suggest, don't surprise.** Mechanical fixes (a typo, a fact they gave
  you, a TODO they answered) you just make and list. Judgment calls (new
  slides, cuts, moves, rewording their lines) go into the deck as marked
  suggestions, so they review the real slide, not a description of it:
  - a whole slide: `data-sg="S1" data-sg-kind="new|move|cut|edit|ask"
    data-sg-note="why, in one line"` on the `<section>`;
  - words: `<del class="sg">old</del> <ins class="sg">new</ins>`.
  - Number suggestions S1, S2… per round. Tell them: open the deck, press S
    to step through, P to preview everything accepted, then reply in bulk
    ("accept all", "S3: tweak, shorter", "reject S5").
  - On their reply, apply the accepted ones, remove every mark, and record
    the decisions in `plan/brief.md` under Locked decisions when they're
    lasting.
- **Ask only what the next chunk needs.** One to three questions, with
  recommendations. Everything else can wait.
- **Look at it.** Layout, wrapping and contrast can't be checked by reading
  the file. If you can drive a browser (Playwright, a browser tool), open
  the deck at 1920×1080 and screenshot the title, the densest slide you
  touched and the last slide. If you can't, say so plainly and ask the
  presenter to look; never claim a slide looks right when you haven't seen it.
- **Run `python scripts/check.py`** after each chunk (`py scripts/check.py`
  on Windows). FAILs are expected while TODOs remain; new problems aren't.

## The look: colors and fonts

The kit ships neutral grays on purpose. Don't invent a brand.

- **Colors.** Map what they give you onto the roles in `theme.css`
  (`--paper`, `--ink`, `--accent`, `--accent-text`, …); the comments there
  say what each role colors. Usual moves:
  - Main brand color → `--accent`. If it's light (gold, yellow, sky),
    `--on-accent` becomes `--ink`, not white.
  - `--accent-text` must read on both light backgrounds. Darken the accent
    until it does; if that turns it muddy, use their other brand color.
  - A second brand color usually fits `--accent-on-ink` (dark slides) or
    `--highlight`.
  - Run `check.py`: every text pair needs 4.5:1; marks (bullets, quote
    marks) need 3:1. Then show them `patterns.html`, which uses every role.
- **Fonts.** Self-host: download the files into `fonts/` and add
  `@font-face` in `theme.css` (steps in `fonts/README.md`). Never link a
  font CDN; conference wifi fails. One display face and one body face is
  plenty. If you can't download it, put the family name first in the font
  stack anyway (it shows once the file lands), and ask the presenter to
  drop the files into `fonts/`; log it as waiting on them.
- **Logos.** Into `assets/`, placed where they ask. Not on every slide
  unless they ask.
- **Starting from a look.** `themes/` has six (editorial, night, brutal,
  storybook, terminal, riso): colors, fonts and shapes, scoped to
  `<html data-theme="name">`. They can try them on the example, effects and
  layouts pages (Look picker, or T). To adopt one: link
  `themes/<name>.css` after `theme.css` in `index.html` and add
  `data-theme="<name>"` to `<html>`. To blend it with their brand, copy its
  token block into `theme.css` and swap in their colors. Dark looks set
  `--deep` (dark-slide background) and `--on-highlight`; keep those if they
  start from one. `check.py` measures every look a deck uses.

## Effects and interactivity

The deck is a web page, so slides can move, react and run things.
`effects.html` is the menu: every slide there is one live effect plus the
exact sentence to paste to you ("Use the stagger effect from effects.html
on my Promise slide").

- **When to bring it up:** once the outline exists (Round 3 in the
  interview). Ask them to open `effects.html`, press around, and tell you
  which ones they liked and for which slides. Don't add effects nobody
  asked for; offer them as suggestions if one would make a point.
- **Adding one:** uncomment the `engine/effects.js` script tag at the
  bottom of `index.html` (once), then put `data-fx="name"` on the element
  the way the menu slide does. Copy the menu slide's markup shape (a flip
  card needs `.front` and `.back`; zoom wraps the image).
- **Magic keys** (B blur, C confetti, D drumroll, M mic drop, O bubbles,
  Q shh, U curtain, 1–9 timers, X clear): uncomment
  `engine/magic-keys.js`. Tell them it takes over the number keys, so
  "press 4 to jump to slide 4" stops working.
- **Something not on the menu:** build it as slide code in `index.html` (a
  `<script>` that listens for `slidechange`), following how
  `engine/effects.js` does it. Keep its rules: arriving backwards shows the
  finished state, R replays, reduced motion and print show the end state,
  and nothing keeps running after the slide is gone.
- **Taste:** one effect per slide at most, where it makes a point. Every
  slide must read fine in its finished state, because that's what the PDF
  and the people in the back will see. Check forward, backward and after R.
- `steps` hold the → key until every item is out. Make sure the presenter
  knows, or they'll think the clicker stopped working.

## Under the hood (V)

`engine/peek.js` lets anyone press V on a slide to see how it's built and
copy it for an AI chat. If the presenter pastes you text that starts "This
is one slide from an HTML slide deck made with html-deck-kit", they copied
a slide they liked (from the example, the effects menu, or someone else's
deck): treat it as "make me a slide like this", adapted to their content
and theme. peek.js must load before `engine/deck-stage.js` and without
`defer`, or it shows the engine's runtime attributes instead of the file's
HTML. `data-tab` on its script tag adds the clickable </> tab; leave it off
for decks being presented.

## Rehearsal: the edit loop

- **They fix words themselves.** In the deck: press E, click any text, type.
  Notes opens the speaker note for the slide. Edits stay in that browser.
  Then they either:
  - run `python scripts/deck-edit.py`, open `http://localhost:8769/`, and
    use **Save to file** (writes straight into `index.html`). The server
    keeps running until Ctrl+C: the presenter starts it in their own
    terminal; if you start it, run it in the background or your session
    will hang; or
  - use **Copy changes** and paste the text to you. Save it to a file and run
    `python scripts/deck-edit.py apply <file> --dry-run`, then without
    `--dry-run`. Don't apply it by hand. If the script refuses an edit, it's
    because it can't be sure where the edit goes; tell them which one and
    make it yourself.
- **Presenter view.** Press E, then **Presenter**: a second window with the
  notes, a timer, the clock and the next slide. Put it on the laptop, the
  deck on the projector.
- **Run-through notes.** If they talk through a rehearsal and send you the
  transcript, separate what they'd say on stage from notes meant for you.
  Match "slide 12" to a slide by its content; spoken numbers drift.
- **Timing.** Ask how long the run took and update the clock in
  `plan/outline.md`. First runs usually come in short; protect Q&A time and
  keep a "cut in this order" list for running long.

## Before the day

Work through this with them a few days out, not the night before:

- [ ] `check.py` passes: no TODOs, no open suggestions, notes match slides,
      everything loads from the folder.
- [ ] Every promise in the abstract has a slide (fill What I Promised).
- [ ] Leftovers from a reused deck are gone: old event names, dates, QR
      codes, numbers that were true last time.
- [ ] Every QR code scans to the right page, from a phone, at a distance.
- [ ] Print to PDF (browser Print → Save as PDF → one page per slide).
      That's the backup if anything fails. Keep it on the laptop and a USB
      stick with the whole folder.
- [ ] Opened on the presenting laptop, in the browser they'll use, on the
      real screen if possible. Readable from the back row.
- [ ] Demos: the tool still works the way the slide says (tool screens change
      often), and a recording or screenshot is ready in case it doesn't.
- [ ] A fresh agent session (not you) reviews the deck cold. The builder
      doesn't grade its own work.

## Structure and slide opinions (defaults; the presenter can overrule)

**The arc.** The starter deck is laid out this way:
Title → Hook → Promise (what you leave with) → Map → parts, each a claim
plus real evidence → Your Turn → If It Goes Sideways → Close (one line) →
Thanks with one QR → backup slides and Appendix after the close.

- **Concept before demo.** A cold open on a demo loses people; give them a
  frame first.
- **Give people something to do,** and a lane for those who'd rather watch
  ("Rather watch? That counts").
- **If It Goes Sideways:** one fix per likely problem, up on screen while
  people try things.
- **Backup lives after the close.** Appendix slides take `data-slide-num="A1"`,
  `"A2"`…; they're one F-search away in Q&A.
- **Skip, don't delete.** In grid view (G), right-click a slide → Skip. It
  stays in the file, out of the path, and comes back with one click. Cut
  live from the outline's cut list rather than pre-cutting everything.

**Writing slides.**

- **Lean first pass:** a headline and a little support. Explanation goes in
  the speaker notes, not on the slide.
- **One idea per slide.** Small context label, one big claim in the words
  they'd say out loud, then a little evidence.
- **Three cards** only for three truly separate, parallel things. Otherwise a
  statement slide.
- **No period at the end** of titles, eyebrows, card headings or short
  closing lines. Keep periods in body text and in quotes.
- **Line breaks follow speech:** break at a pause, never inside a name.
  Fix an ugly wrap by changing the words or the width, not with a stray `<br>`.
- **Nothing an audience must read under 28px** on the 1920×1080 stage.
- **Real artifacts over mockups:** actual screenshots, photos, finished work,
  quotes with real names. If you don't have one yet, leave a visible
  placeholder (`<span class="todo">TODO …</span>`, or `.placeholder-shot`
  for an image); never fill the gap with invented content.
- **Keep their voice.** Organize and tighten when asked; don't sand their
  phrasing into generic slide-speak.
- **Online sessions:** "type in the chat" or "react" instead of "raise your
  hand"; no pair work; more time for questions.
- **QR codes:** one per slide, big, with the URL typed underneath.
- **Interactive slides** (timers, live widgets) earn their place when the
  room gets something a picture can't give. Pattern in `patterns.html`
  (Live Timer).

## Facts, names and privacy

- **Never invent** a fact, number, quote, date, outcome or URL. Use a
  visible `TODO` and ask.
- **Names and words exactly as given,** including diacritics (the ʻokina
  and kahakō in Hawaiian words, accents in names). Never strip them.
- **No identifiable student or client information** on slides or in
  screenshots (names with grades, health, discipline). Crop or use made-up
  examples, and say so if you spot some.
- **A link isn't private** just because it's unlisted. The included
  `_headers` and `robots.txt` ask search engines to skip the deck if it's
  ever hosted; real privacy needs a login in front of it.

## How the files fit

| File | What it is | Who edits |
|---|---|---|
| `index.html` | The deck. Each `<section>` is a slide, in order | You, and the presenter via E |
| `theme.css` | Color and font tokens (top), slide patterns (below) | You |
| `patterns.html` | Gallery of every pattern, re-themed live | You, when adding a pattern |
| `effects.html` | Menu of live effects, each with the sentence to paste to you | Nobody, normally |
| `plan/brief.md` | The facts and locked decisions | You, from their answers |
| `plan/interview.md` | Question bank and their answers | You |
| `plan/outline.md` | Beats, clock, cut order, parking lot | You, with their OK |
| `plan/log.md` | One entry per session, newest first | You |
| `assets/`, `fonts/` | Images, QR codes, video; font files | Either |
| `themes/` | Six looks (`<name>.css`) and their self-hosted Google Fonts (SIL OFL) | You, when adding a look |
| `example/` | A finished sample deck with its own `theme.css` and `plan/`. Reference only; never edit it as their deck | Nobody |
| `engine/` | The slide engine. See `engine/README.md` | Nobody, normally |
| `scripts/check.py` | Pre-delivery checks | Run it |
| `scripts/deck-edit.py` | Local server with Save to file; `apply` for pasted edits | Run it |

## Deck mechanics

- A slide is a direct `<section>` child of `<deck-stage>`. Give every slide
  a short, unique `data-screen-label` ("Hook", "Your Turn"); that's how you
  and the presenter refer to it. In the running page the engine prefixes a
  number ("02 Hook"), so in browser scripts select with
  `[data-screen-label$="Hook"]`; in the file it stays as you wrote it.
- **Speaker notes are matched by position:** the `#speaker-notes` JSON array
  in `<head>` has one string per slide, in order. Adding, removing or moving
  a slide means adding, removing or moving its note at the same index.
  `check.py` catches a count mismatch, not a shuffle, so be careful.
- One surface class per slide: `surface-paper`, `surface-alt`, `surface-ink`,
  `surface-accent`. Alternate for rhythm; dark for openings, dividers and the
  close.
- `data-slide-num="hidden"` on the title; `"A1"`… on appendix slides.
- `data-deck-skip` on a slide takes it out of the path (same as Skip in
  grid view). `data-no-edit` on an element keeps live edit off it.
- `no-rail` on `<deck-stage>` hides the thumbnail rail while presenting.
  Remove it while building if the presenter likes the rail.
- Slide code listens for `slidechange` on `<deck-stage>`
  (`e.detail.slide`, `e.detail.index`, `e.detail.previousIndex`,
  `e.detail.reason`); `engine/effects.js` is the worked example. Hidden
  slides stay in the page, so videos and inputs keep their state.
- Everything the deck loads lives in this folder. No CDNs, no build step,
  no npm. Double-clicking `index.html` works.
- Don't edit `engine/` to fix one slide. Style the slide instead. Comments
  inside the engine files mention a few things from where they grew up; in
  this kit everything loads from `engine/`.

## Keys the presenter can use

| Key | Does |
|---|---|
| ? | Every key, plus what the current slide does (steps, flip cards…) |
| V | Under the hood: X-ray of the slide, plus its map, HTML, CSS and effect code, with Copy for an AI |
| T | Switch the look, when the page loads `engine/themes.js` |
| → ← Space | Next, previous |
| 1–9 | Jump to that slide |
| H | Back to the first slide |
| G | Grid of all slides: click to jump, drag to reorder, right-click to skip |
| F or / | Search slide text and notes, Enter to jump (finds skipped slides too) |
| E | Edit text in place; the toolbar has Notes, Presenter, Save, Copy changes |
| L | Laser pointer |
| R | Replay the current slide's animation |
| S / P | Step through suggestions / preview them accepted (only when there are some) |
| B C D M O Q U X ? | Magic keys, only when `engine/magic-keys.js` is on: blur, confetti, drumroll, mic drop, bubbles, shh, curtain, clear all, list. Then 1–9 start a timer instead of jumping |
| Ctrl+P | Print: one page per slide, Save as PDF for the backup |

## If the presenter uses git

Suggest a commit at good checkpoints (end of a chunk, before a big
restructure, after rehearsal fixes); don't commit unless they ask. If they
don't use git, suggest copying the whole folder somewhere safe before a big
restructure.
