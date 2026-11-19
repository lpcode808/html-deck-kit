# engine/

The slide machinery. You shouldn't need to edit anything here; style
slides in `theme.css` and `index.html` instead.

| File | Does |
|---|---|
| `deck-stage.js` | The `<deck-stage>` element: scaling to any screen, keyboard and tap navigation, grid view (G), skip, laser (L), print to PDF, and loading the editor |
| `deck-edit.js` | Live edit (E): edit text and notes in place, Presenter window, Save to file / Copy changes. Loaded only when needed |
| `slide-search.js` | Search slides and notes (F or /) |
| `slide-numbers.js` | The small slide number in the corner; `data-slide-num` overrides |
| `suggest.js` | Shows the agent's suggestion marks; S steps through them, M previews them accepted |

`deck-stage.js`, `deck-edit.js` and `slide-search.js` come from an engine
used for a season of real conference talks in 2026 and were copied here as a
snapshot. Comments inside them mention a few things from where they grew up
(iPads, hosted URLs, an export tool); everything here loads from `engine/`.
