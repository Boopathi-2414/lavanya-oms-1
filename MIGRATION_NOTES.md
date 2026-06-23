# v3.16.0 — Bounding-Box AWB Extraction + Historical Data Migration

## What changed

### 1. PDF Root Cause Fixed (Bounding-Box / Text-Joining)

The Flipkart/Shopsy/Ekart label prints its AWB barcode in a column
rotated 90°. pdfjs's `getTextContent()` gives each rotated glyph as a
separate item with its own (x, y) coordinate. Previous approaches that
worked line-by-line (y-bucket grouping, collation passes) could not
reliably reconstruct `AWB No.` as a contiguous keyword.

**v3.16 solution — bounding-box column clustering:**

1. All text items are collected with their raw `x0` (left edge) coordinate.
2. Items are bucketed into 8-px wide x-columns.
3. The column with the most single/two-character items (≥ 4 required) is
   identified as the rotated AWB spine.
4. Items in that column are sorted top→bottom and concatenated directly,
   producing e.g. `AWBNo.FMPP4083192124OrderedThrough`.
5. A single tight regex extracts everything between `AWBNo.` and the
   next known word boundary (`Ordered`, `Through`, `Not`, etc.).
6. The result is injected as a synthetic `AWB No. <value>` line at the
   very top of `pageText`, so all existing keyword-anchored extractors
   downstream pick it up without any changes.

**Validated:** all 14 sample labels in `fl.pdf` extracted correctly:
FMPP, FMPC, SF-prefix (`SF3206441579F`), numeric-only — 14/14 ✓

### 2. Shopsy = Flipkart (Unified Channel)

`channel === 'Shopsy'` is normalised to `'Flipkart'` in `parseByChannel`.
Auto-detect also recognises `\bshopsy\b`. Both follow the same Ekart
AWB extraction path.

### 3. Validation Log

- Parse Log now shows an **AWB column** — green value if captured,
  red `⚠ missing` otherwise.
- A `⚠ N AWB missing` badge appears in the summary bar.
- **⬇ failed_labels.json** download button appears when any pages
  failed or produced no AWB. Each entry includes `filename`, `page`,
  `orderId`, `awb`, `status`, `reason`, `timestamp`.

### 4. Historical Data Migration (233 orders + 443 trash records)

Source: `__lavanya_oms_v3_orders__orderId295.json`

**Two ways to migrate — choose one:**

**Option A — In-app button (recommended):**
1. Open the OMS, log in, configure Supabase in Settings.
2. Click **☁ Migrate Historical Data** in the sidebar footer.
3. The function upserts all records using `ON CONFLICT / ignoreDuplicates`,
   so it is completely safe to run multiple times.
4. After migration the app auto-refreshes from Supabase.

**Option B — SQL Editor:**
1. Open the Supabase dashboard → SQL Editor.
2. Open `migrate_historical_data.sql` from this project root and run it.
3. Uses `ON CONFLICT (id) DO NOTHING` — safe to run multiple times.

### 5. Data Integrity

No existing data is modified. The migration only **adds** records that
are not already present in Supabase. `supabaseData.js`, `db.js`, and
the Supabase schema are otherwise unchanged.
