# html-deck-kit

**See it first:** [the example deck](https://lpcode808.github.io/html-deck-kit/example/)
(a finished deck made with this kit) · [every slide layout](https://lpcode808.github.io/html-deck-kit/patterns.html)
· [the effects menu](https://lpcode808.github.io/html-deck-kit/effects.html) (poke everything)

**Get it:** green **Code** button → **Download ZIP**, or **Use this template**
if you have a GitHub account. Or tell your agent: *"Copy
https://github.com/lpcode808/html-deck-kit into a new folder for my talk,
then read AGENTS.md and start the kickoff interview."*

A snapshot, shared as is. Copy it, change anything, make it yours.

---

A slide deck that's a web page: one file, `index.html`, that opens in any
browser and runs full screen. An AI agent builds it with you over a few
sessions. It interviews you, drafts slides, and you react. You bring the
content, colors and fonts; this kit brings a structure that has held up in
real conference rooms.

## Why bother, instead of Google Slides?

Google Slides is the right call for most decks, especially when several
people edit together. An HTML deck is worth it when you want:

- **An agent that edits the deck directly.** The deck is text, so an agent
  can read it, change twenty slides at once, and show you exactly what
  changed.
- **Slides that run things:** a live timer, a working demo, a quiz.
- **Plain files you own.** No account, works offline, prints to PDF.

The trade: one editor at a time, and a little setup.

## What you need

- A browser (Chrome, Edge, Safari or Firefox).
- An AI agent that can read and write files in a folder: Claude Code,
  Codex, Gemini CLI, Cursor, or similar. A chat window that can't touch
  files will struggle with this kit.
- Optional: Python 3, for **Save to file** and the checks. Where this kit
  says `python`, type `python3` on a Mac and `py` on Windows (install it
  from python.org or the Microsoft Store first).

## Start

1. **Copy this folder** and rename it for your talk (`my-talk-2027`).
2. **Open the folder in your agent** and say:

   > Read AGENTS.md and start the kickoff interview.

3. **Answer a few questions at a time.** Short answers are fine. "recs"
   accepts the agent's recommendations. "later" skips a question for now.
4. **Come back whenever you have time.** Each session the agent reads where
   things stand (`plan/log.md`) and suggests the next small step.

## Look at your deck

Double-click `index.html`. Press **→** to move through it. `patterns.html`
shows every slide layout the kit has, in your colors.

| Key | Does |
|---|---|
| → ← Space | Next, previous |
| G | See all slides; drag to reorder; right-click to skip one |
| F | Search for a slide |
| E | Fix words right on the slide (and write speaker notes) |
| S, P | When the agent has suggested changes: step through them, preview them accepted |
| H | Back to the start |
| L | Laser pointer |

## Make it move

Open `effects.html`. Every slide in it is a live effect: cards that walk
in, a list that waits for your clicker, a headline that types itself, a
countdown, cards that flip, confetti on a key. Under each one is the exact
sentence to paste to your agent. Pick one or two you love; a little goes a
long way.

## Fix words yourself while you rehearse

Press **E**, click any text, type. **Notes** opens the speaker notes for
that slide. **Presenter** opens a second window with your notes, a timer and
the next slide; put it on your laptop screen and the deck on the projector.

Your edits stay in that browser until you bring them home:

- **Copy changes**, then paste them to your agent. It applies them to the
  file. Works anywhere, even on an iPad.
- Or run the local server and click **Save to file**:

  ```
  python scripts/deck-edit.py
  ```

  then open `http://localhost:8769/`.

## Before the day

Ask your agent to run the "Before the day" checklist in `AGENTS.md`. It
includes `python scripts/check.py`, which catches leftover TODOs, missing
files, speaker notes out of step and colors too faint to read. Always print
to PDF (Ctrl+P → Save as PDF) as a backup.

## What's in the folder

| | |
|---|---|
| `index.html` | Your deck |
| `example/` | A finished example deck. Look, borrow, or delete it |
| `theme.css` | Your colors and fonts (top of the file) |
| `patterns.html` | Every slide layout, as a menu |
| `effects.html` | Every effect, live, with the sentence to give your agent |
| `plan/` | The agent's notes: the facts, your answers, the outline, a log |
| `assets/`, `fonts/` | Your images and font files |
| `engine/`, `scripts/` | The machinery. Leave these be |
| `AGENTS.md` | Instructions for your agent (worth a skim) |

## Putting it online (optional)

Any static host works: Cloudflare Pages, GitHub Pages, Netlify, or a shared
drive people can download from. Upload the whole folder. An unlisted link is
not a private one; anyone with the URL can open it. Every page carries a
"don't index this" tag for search engines (GitHub Pages ignores the
`_headers` file, but the tag inside each page still works). **Save to
file** only works on your own computer; online, edits stay in that browser
until you use **Copy changes**.
