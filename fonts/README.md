# fonts/

Fonts live here so the deck looks right with no internet. Conference wifi
fails; a deck that pulls fonts from the web falls back to the default face
at exactly the wrong moment.

To add a font:

1. Download it. For Google Fonts: open fonts.google.com, pick the family,
   choose "Get font", then "Download all". Unzip, and copy the `.woff2` or
   `.ttf` files you need (a variable font is one file for every weight) into
   this folder.
2. In `theme.css`, add an `@font-face` block at the top (there's an example
   there) and put the family name into `--font-display` or `--font-body`.
3. Check the license allows embedding. Google Fonts all do.

Agents with web access can do steps 1 and 2 for you. Never link a font CDN
from the deck.
