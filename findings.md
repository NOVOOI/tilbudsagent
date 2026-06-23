# Findings & Change Log

Running log of changes, bug fixes, and architectural notes. Updated at the end of every session.

---

## 2026-06-23

### Fix: Selected products grid stuck on 3 columns

**Problem:** The `.sel-grid` used a CSS custom property `--cols: 5` overridden by `@media (max-width: 900px) { --cols: 3 }`. Since `.main` has `max-width: 860px`, the media query fired at almost every viewport, making the selected products display in 3 wide columns.

**Fix:** Replaced with `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))` — same pattern as the WooCommerce search results grid (`.woo-grid` uses `minmax(120px, 1fr)`). At the 860px container this reliably gives 5 columns and degrades gracefully on smaller screens without needing explicit media queries.

**File:** `index.html` — `.sel-grid` CSS block (around line 150)

---

## Architecture notes (as of 2026-06-23)

- Single `index.html`, no build step. All logic is vanilla JS inline.
- `localStorage` keys: form autosave + per-quote history array.
- WooCommerce credentials (store URL, consumer key/secret) and Claude API key are entered in the UI and never sent anywhere except the respective APIs.
- `contenteditable` spans in the preview let users edit AI output before PDF export.
- jsPDF loaded from CDN — if CDN is unavailable, PDF export breaks silently.
- The `.main` container is capped at `max-width: 860px`. Any responsive breakpoints for elements inside it should be set well below 860px, not at 900px+.
