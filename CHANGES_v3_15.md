# v3.15.0 — AWB Extraction Fix + Validation Log

## Root Cause (PDF Layout)
Flipkart/Ekart labels print the AWB barcode in a **rotated 90° column** on
the left spine of the label. pdfjs reconstructs each rotated character as a
separate text item at its own y-coordinate. With the previous `LINE_TOL = 2`
bucket, this means "A", "W", "B", "N", "o", ".", "F", "M", "P", "P", "4"…
each land on their own line. The keyword regex `\bAWB\b` never matched because
the three letters were never on the same reconstructed line. This is why:
- FMPP/FMPC AWBs *sometimes* worked (Tier-2 shape signature in `extractAwbStrict`)
- SF-prefix AWBs failed (no matching shape signature in that Tier-2 path)
- Numeric-only AWBs always failed (nothing to match them without the keyword)

## Fixes Applied

### 1. Rotated-Character Collation Pass (`src/db.js` — `extractPdfText`)
A post-processing step after the y-bucket grouping now detects runs of
**3+ consecutive single-character lines** (the rotated barcode column signature)
and re-joins them into a single line. Result: `"AWB No. FMPP4083192124"` is
reconstructed correctly regardless of prefix, enabling all existing keyword-
anchored AWB extractors to work without further changes.

### 2. Universal Look-Around AWB Extractor (`src/db.js` — `extractFlipkartAwb`)
Replaced the previous same-line/next-line dual regex with a 4-pass look-around
approach that handles:
- (a) `AWB No. FMPP4083192124` — normal spaced form
- (b) `AWBNo.FMPP4083192124`  — collated no-space form (after collation pass)
- (c) `SF3206441579F ... AWB` — value appearing BEFORE the keyword
- (d) Numeric-only AWBs like `1234567890123` within ±120 chars of an AWB keyword

No hardcoded prefix restrictions — any courier AWB format is accepted.

### 3. Shopsy = Flipkart (`src/db.js` — `parseByChannel`)
`channel === 'Shopsy'` is now normalized to `'Flipkart'` before routing. Both
platforms share the same OD-format order ID, Ekart logistics block, and AWB-No.
column — no separate parsing path needed. Auto-detect also recognizes `\bshopsy\b`.

### 4. Validation Log — `failed_labels.json` (`src/components/Sales.jsx`)
After every import batch:
- Parse Log now shows an **AWB column** — green value if extracted, red "⚠ missing" if not
- A badge counts "X AWB missing" separately from "X skipped/duplicate"
- A **⬇ failed_labels.json** button appears whenever any pages failed or had missing AWBs
- The downloaded file lists `{ filename, page, status, reason, orderId, awb, timestamp }`
  for every failed/skipped/AWB-missing entry — ready for manual review

### 5. Data Integrity
Database logic (`supabaseData.js`), Supabase schema, and all existing order/
payment/product structures are **unchanged**. The provided JSON
(`__lavanya_oms_v3_orders__orderId295.json`) is a localStorage export — import
it via the existing Supabase sync or paste it into localStorage as before.
