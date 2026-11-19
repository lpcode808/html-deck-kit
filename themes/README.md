# themes/

Six looks. Each `<name>.css` sets the color and font tokens from
`theme.css` and restyles a few patterns, all scoped to
`<html data-theme="name">`, so a look never leaks when it's off.

| Look | Feel | Typefaces |
|---|---|---|
| `editorial` | Newsprint cream, serif headlines, hairline rules, one red | Fraunces + Source Serif 4 |
| `night` | Synthwave: deep indigo, neon pink and cyan, horizon grid | Unbounded + Outfit |
| `brutal` | Black, white, highlighter yellow; thick borders, hard shadows | Archivo Black + Space Grotesk + Space Mono |
| `storybook` | Warm cream, rounded everything, sticker cards | Fredoka + Nunito |
| `terminal` | Green phosphor on black, scanlines, blinking cursor | VT323 + IBM Plex Mono |
| `riso` | Risograph print: paper grain, fluorescent pink and blue | Bricolage Grotesque + Work Sans |

**Try one:** the Look picker (or T) on `example/`, `effects.html` and
`patterns.html`, or add `?theme=<name>` to any of their addresses.

**Use one in a deck:** after the `theme.css` link in `index.html`, add
`<link rel="stylesheet" href="themes/<name>.css">`, and put
`data-theme="<name>"` on the `<html>` tag. `python scripts/check.py`
measures its contrast.

**Make one:** copy the closest file, rename it, change the tokens, run
`check.py`. Keep text pairs at 4.5:1 or better.

**Fonts** are Google Fonts, downloaded and trimmed to Latin plus the
ʻokina and kahakō, in `fonts/<family>/` with that family's `OFL.txt`
(SIL Open Font License). Self-hosted on purpose: a deck should never need
wifi to look right.
