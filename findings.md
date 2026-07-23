# Findings & Change Log

Running log of changes, bug fixes, and architectural notes. Updated at the end of every session.

---

## 2026-07-23 (second bug hunt)

### Fix: Discount badge always hidden when typing per-product discount (updateProdDisc `dv` bug)

**Root cause:** The code audit (2026-06-24) renamed `dv`/`dt` to `disc.val`/`disc.type` in `renderSelectedProducts`, but the same pattern in `updateProdDisc` was only partially fixed. The last line still referenced the undefined `dv`:
```js
resEl.style.display = dv ? '' : 'none'; // dv is undefined → always false → badge always hidden
```

**Result:** After typing a discount amount into the per-product discount input, the discount result label (e.g. "-10%") was always hidden — even when a non-zero discount was active. The discount math itself was correct (the total updated properly), but there was no visual confirmation.

**Fix:** `dv` → `disc.val` in the display toggle line.

**File:** `index.html` — `updateProdDisc()` (~line 1283)

**Pattern:** Any place that toggles element visibility based on whether a discount is active must use `disc.val`, not bare `dv`.

---

### Fix: XSS in history list and loading spinner

**Three injection points fixed:**

**1 — `renderHistoryList` onclick attributes:** `loadHistoryEntry('${nr}')`, `duplicateHistoryEntry('${nr}')`, and `deleteFromHistory('${nr}')` all interpolated the raw tilbudsnr into onclick attribute strings. A tilbudsnr containing a single quote (e.g. `2026-001'`) would break out of the JS string context. Fixed with `JSON.stringify(nr)` which produces a properly quoted string: `loadHistoryEntry("2026-001")`.

**2 — `renderHistoryList` display text:** `${kunde}` and `${prosjekt}` were interpolated raw into `innerHTML`. Fixed with a new `esc(s)` HTML-escape helper applied to all three user-supplied values (`kunde`, `prosjekt`, `nr`).

**3 — `doGen` loading spinner:** `Lager tilbud for ${fd.kunde}…` in the spinner innerHTML. Customer name is user-typed, so a name like `<script>` would have rendered as HTML. Fixed with `esc(fd.kunde)`.

**Added helper:** `function esc(s)` — standard 4-char HTML entity escape (`&`, `<`, `>`, `"`). Placed alongside `fmtR`/`fmtDate`/`parseKr` at ~line 1373.

**Files:** `index.html` — `renderHistoryList()` (~line 731), `doGen()` (~line 1446), `esc()` helper (~line 1373)

**Pattern:** Any user-supplied string (form fields, localStorage data) interpolated into `innerHTML` must go through `esc()`. Strings used in onclick attributes must be made JS-safe via `JSON.stringify()`.

---

## 2026-07-23

### Fix: Discount system — three bugs causing global discounts to appear broken

**Root cause of reported "total discount broke the agent" bug:** Three separate issues caused the discount system to malfunction.

**Bug 1 — Per-product discount UI always empty (introduced by code audit):**
The code audit consolidated inline discount math to use `applyDisc()` and renamed `const dv`/`const dt` to `const disc = {val, type}`. But the template string in `renderSelectedProducts` still referenced `dv` and `dt`, which were now undefined. Result: the discount input was always blank, the type dropdown always defaulted to `%`, and the discount badge was always hidden — even for products that had a discount saved.

Fix: replaced `dv` → `disc.val` and `dt` → `disc.type` in the three template references (value attribute, option selected check, badge visibility).

**Bug 2 — Live sum ignored global discounts:**
`updateLiveSum` summed service lines + per-product discounted prices but never read or applied the three global discount inputs (`discSvc`, `discProd`, `discTotal`). The live sum shown while filling the form was always the pre-global-discount total — making it look like the global discounts had no effect (likely the main reason the team member thought global discounts "didn't work" and resorted to per-product discounts).

Fix: after computing `svcSum` and `prodSum`, `updateLiveSum` now reads all three global discount fields from the DOM and applies them (`svcAfter`, `prodAfter`, then total discount) before displaying.

**Bug 3 — PDF/preview used stale discount values from last generation:**
`syncEditableFields()` (called at the start of both `saveToStorage` and `doPDF`) synced form fields, ops toggles, and AI text back into `genData.fd`, but silently skipped the global discount inputs. If the user changed a global discount after clicking "Generer tilbud" without regenerating, `genData.fd.discSvc` etc. still held the values from the last generation. The PDF would show the old discount; the MVA-toggle re-render would also use stale values.

Fix 1: `syncEditableFields` now also syncs `discSvc`, `discProd`, `discTotal` into `genData.fd` as `{val, type}` objects.
Fix 2: `setMva` (MVA toggle) now calls `syncEditableFields()` before re-rendering the preview, ensuring the re-render always uses current form values.

**Files:** `index.html` — `renderSelectedProducts` (~line 1323), `updateLiveSum` (~line 875), `syncEditableFields` (~line 1561), `setMva` (~line 1735)

**Pattern to watch:** Any code path that reads `genData.fd.discSvc/discProd/discTotal` must ensure `syncEditableFields()` was called first, OR re-read directly from DOM. Never assume `genData.fd` has the current discount values without a prior sync.

---

## 2026-06-23

### Fix: Selected products grid stuck on 3 columns

**Problem:** The `.sel-grid` used a CSS custom property `--cols: 5` overridden by `@media (max-width: 900px) { --cols: 3 }`. Since `.main` has `max-width: 860px`, the media query fired at almost every viewport, making the selected products display in 3 wide columns.

**Fix:** Replaced with `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))` — same pattern as the WooCommerce search results grid (`.woo-grid` uses `minmax(120px, 1fr)`). At the 860px container this reliably gives 5 columns and degrades gracefully on smaller screens without needing explicit media queries.

**File:** `index.html` — `.sel-grid` CSS block (around line 150)

### Cleanup: Full code audit — dead code, duplicates, XSS, bugs (2026-06-24)

**Bug — `nyttTilbud()` did not reset tags:** `tags = []` + `renderTags()` never called on new quote. Brand tags from previous quote carried over. Fixed in `nyttTilbud()`.

**Dead CSS removed:** `.line-prod`, `.col-lbl`, `.prev-rule`, `.prev-ingress` — none of these classes were referenced anywhere in HTML or JS.

**Dead function removed:** Global `fmt(n)` (2-decimal kr formatter, line ~1369) was never called. Both call sites in `nyttTilbud` and the init IIFE used local shadow lambdas.

**Duplicate date formatter removed:** `nyttTilbud` and the init IIFE each declared an identical local date formatter lambda. Replaced both with a shared `fmtDate(d)` helper added alongside `fmtR`.

**Stale artifact removed:** `documentdocument` typo (~line 1348).

**Duplicate discount calculation consolidated:** The inline pattern `dv?(dt==='pct'?unit*(1-dv/100):Math.max(0,unit-dv)):unit` appeared in 5 places (`updateLiveSum`, `renderSelectedProducts`, `changeQty`, `updateProdDisc`, `renderPreview`, `doPDF`). All replaced with the existing `applyDisc(unit, {val, type})` helper. Discount label string likewise replaced with `discLabel(disc)` in `renderSelectedProducts` and `updateProdDisc`.

**XSS — `renderTags`:** `t.innerHTML = b + ...` where `b` is user-typed brand name. Replaced with `document.createTextNode(b)` + DOM-constructed button.

**Pattern to watch:** Any new place that computes a per-product discount must use `applyDisc(unit, {val, type})` — never inline.

---

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
