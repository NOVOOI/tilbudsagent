# NOVOOI Tilbudsagent

AI-powered quote generator for NOVOOI interior design projects. Single-file HTML app — no build step, no dependencies except jsPDF (loaded from CDN).

## What it does

Fills in a structured form, hits the Claude API to generate polished Norwegian offer text, and renders a live editable preview that can be exported as a PDF.

## Sections

| Section | Purpose |
|---|---|
| Tilbudsdetaljer | Quote number, date, validity, client, project info |
| Prosjektbeskrivelse | Brief fed to AI, scope, size, timeline, loan period |
| Prislinjer | Service line items with qty, unit price, total |
| Opsjoner og betingelser | Toggleable conditions (delivery, insurance, payment terms, etc.) |
| Merkevarer og produktkategorier | Brand tags and category pills passed to AI as context |
| Produkter | WooCommerce product search + manual add; selected products shown in grid |
| Merknader | Free-text bullet notes appended to PDF |
| PDF — skjul seksjoner | Checkboxes to hide sections from the PDF export |

## Product grid

- **Search results** — `woo-grid`: `auto-fill, minmax(120px, 1fr)`, max-height 300px with scroll
- **Selected products** — `sel-grid`: `auto-fill, minmax(150px, 1fr)`, no height cap

## Key functions

| Function | What it does |
|---|---|
| `doGen()` | Calls Claude API, renders preview |
| `doPDF()` | Renders PDF via jsPDF |
| `wooSearch()` | Fetches products from WooCommerce REST API |
| `addWooProduct(idx)` | Fetches full product/variants, pushes to selected list |
| `renderSelectedProducts()` | Rebuilds the selected products grid |
| `saveToStorage()` / `loadFromStorage()` | Auto-saves form state to localStorage |
| `saveToHistory()` / `loadHistoryEntry()` | Per-quote history stored in localStorage |
| `renderPreview()` | Builds the editable HTML preview from AI response + form data |

## Architecture

- Pure client-side, single `index.html`
- State lives in JS variables (`selectedProducts`, `tags`, etc.) and is synced to `localStorage` on every change
- Preview fields are `contenteditable` so the user can tweak AI output before exporting
- PDF is generated from the rendered preview DOM via jsPDF + html2canvas approach

## Stack

- Vanilla JS / HTML / CSS
- [jsPDF 2.5.1](https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js)
- Claude API (called directly from the browser — API key stored in the form)
- WooCommerce REST API (store URL + consumer key/secret stored in the form)
