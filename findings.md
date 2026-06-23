# Findings & Change Log

Running log of changes, bug fixes, and architectural notes. Updated at the end of every session.

---

## 2026-06-23

### Fix: Selected products grid stuck on 3 columns

**Problem:** The `.sel-grid` used a CSS custom property `--cols: 5` overridden by `@media (max-width: 900px) { --cols: 3 }`. Since `.main` has `max-width: 860px`, the media query fired at almost every viewport, making the selected products display in 3 wide columns.

**Fix:** Replaced with `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))` — same pattern as the WooCommerce search results grid (`.woo-grid` uses `minmax(120px, 1fr)`). At the 860px container this reliably gives 5 columns and degrades gracefully on smaller screens without needing explicit media queries.

**File:** `index.html` — `.sel-grid` CSS block (around line 150)

### Feature: Search/filter in "Mine tilbud"

**What:** A search input at the top of the history modal filters entries in real-time by kunde, prosjekt, or tilbudsnr. Shows "Ingen treff for «...»" when nothing matches. Filter is preserved when deleting or importing entries (renderHistoryList reads the value from the DOM when called without arguments).

**File:** `index.html` — `renderHistoryList()` query param + filter logic (~line 715), search input added in `openHistoryModal()` (~line 697)

---

### Feature: Confirmation before loading from history

**What:** `loadHistoryEntry()` calls `formHasContent()` before applying a history entry. If the current form has a kunde, brief, products, or a generated preview, a confirm dialog appears naming the entry being loaded and reassuring the user their current work is already saved in history.

**File:** `index.html` — `formHasContent()` + `loadHistoryEntry()` (~line 651)

---

### Feature: Export / import backup of all quotes

**What:** "Last ned backup" downloads the full history as a dated JSON file (`novooi-tilbud-backup-YYYY-MM-DD.json`). "Importer" reads a JSON backup file and merges it into existing history (imported entries overwrite on matching `fnr`). Both buttons live in the "Mine tilbud" modal header.

**Why:** All quote history is stored in `localStorage`, which browsers can clear. Without a backup mechanism, data loss is permanent.

**File:** `index.html` — `exportBackup()`, `importBackup()` (~line 615), modal header in `openHistoryModal()` (~line 679)

---

### Feature: Duplicate quote from history

**What:** Each row in "Mine tilbud" has a "Dupliser" button. Clicking it loads the quote into the form with a fresh auto-incremented tilbudsnr, clears the generated preview, and auto-saves — creating a new independent entry ready to edit.

**File:** `index.html` — `duplicateHistoryEntry()` (~line 597), `renderHistoryList()` (~line 724)

---

### Fix: Merkevare-tags not saved to or restored from history

**Problem:** The `tags` array (merkevarer) was never included in the `saveToStorage()` data object. Loading any quote from history always resulted in empty brand tags, regardless of what was originally entered.

**Fix:** Added `tags: tags` to the saved data object in `saveToStorage()`. In `applyStoredData()`, restored tags from `data.tags` with a fallback to `data.genData?.fd?.brands` for older saves that didn't have the field. Calls `renderTags()` after restoring.

**Files:** `index.html` — `saveToStorage()` (~line 534), `applyStoredData()` (~line 692)

---

### Fix: Preview edits lost on reload unless PDF was exported

**Problem:** `syncEditableFields()` — which writes `contenteditable` preview changes back into `genData` — was only called from `doPDF()`. If a user edited the preview text but didn't export a PDF, those edits were lost on any page reload or when switching between quotes.

**Fix:** Added `syncEditableFields()` as the first line of `saveToStorage()`, so preview edits are always flushed into `genData` before the save snapshot is taken. Since `saveToStorage` is called on every debounced input event and explicitly after generation, this covers all save paths.

**Files:** `index.html` — `saveToStorage()` (~line 501)

---

### Fix: Generated quote does not replace old entry in history

**Problem:** `doGen()` generated AI text and rendered the preview, but never called `saveToStorage()`. The only saves triggered were from DOM `input`/`change` events on form fields. If the user clicked "Generer tilbud" without touching another field afterwards, the new version was never written to history — so the old entry with the same `fnr` remained unchanged.

**Fix:** Added `saveToStorage()` immediately after successful generation in `doGen()` (right after `renderPreview` and showing the PDF button).

**File:** `index.html` — `doGen()` success block (~line 1372)

**Note:** `saveToHistory` is keyed by `fnr`. Calling `saveToStorage()` after generation guarantees the new version (including AI content) overwrites any existing entry with the same quote number.

---

### Fix: Selected products not saved to history

**Problem:** Adding/removing products and changing quantities mutate `selectedProducts` in memory but never triggered a save. The global `scheduleSave` listener only fires on DOM `input`/`change` events — clicking the add, remove, and qty buttons doesn't fire either. So history entries were saved without the selected products.

**Fix:** Added `scheduleSave()` calls at the end of `pushProduct`, `removeProduct`, and `changeQty`.

**File:** `index.html` — `pushProduct`, `removeProduct`, `changeQty` functions (~line 1131)

**Pattern to watch:** Any function that mutates `selectedProducts` directly (not via an input event) must call `scheduleSave()` explicitly.

---

## Architecture notes (as of 2026-06-23)

- Single `index.html`, no build step. All logic is vanilla JS inline.
- `localStorage` keys: form autosave + per-quote history array.
- WooCommerce credentials (store URL, consumer key/secret) and Claude API key are entered in the UI and never sent anywhere except the respective APIs.
- `contenteditable` spans in the preview let users edit AI output before PDF export.
- jsPDF loaded from CDN — if CDN is unavailable, PDF export breaks silently.
- The `.main` container is capped at `max-width: 860px`. Any responsive breakpoints for elements inside it should be set well below 860px, not at 900px+.
