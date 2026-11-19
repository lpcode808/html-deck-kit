/**
 * slide-numbers.js — stamps a small running number on each slide.
 *
 * data-slide-num on a <section> overrides it:
 *   "hidden" (or "")  counts the slide but shows nothing (use on the title)
 *   "A1", "A2", …     shows that label and does not use up a main number
 *                     (use for appendix and backup slides)
 * A slide that already holds a .slide-num element gets the number written
 * into it instead of a badge.
 */
(function () {
  function numberSlides() {
    var deck = document.querySelector('deck-stage');
    if (!deck) return;
    var n = 0;
    Array.prototype.forEach.call(deck.children, function (sec) {
      if (sec.tagName !== 'SECTION') return;
      var ov = sec.dataset.slideNum;
      var label;
      if (ov === undefined) { n += 1; label = String(n); }
      else if (ov === 'hidden' || ov === '') { n += 1; label = null; }
      else { label = ov; }

      var stale = sec.querySelector(':scope > .slide-num-badge');
      if (stale) stale.remove();
      var targets = sec.querySelectorAll('.slide-num');
      if (targets.length) {
        targets.forEach(function (t) { t.textContent = label == null ? '' : label; });
      } else if (label != null) {
        var b = document.createElement('span');
        b.className = 'slide-num-badge';
        b.setAttribute('data-no-edit', '');
        b.textContent = label;
        sec.appendChild(b);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', numberSlides);
  else numberSlides();
  // Re-number after a reorder or skip in grid view.
  document.addEventListener('deckchange', numberSlides);
})();
