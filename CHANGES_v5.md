# Lavanya OMS v5 — Change Log

## Summary of All Changes

---

### 1. Smart Daily Reconciliation Dashboard (`src/components/PickupDashboard.jsx`)

**Complete rewrite** of the old courier-table dashboard:

- **Platform → Courier Partner tracking** (exact mapping):
  | Platform | Courier Partner |
  |----------|----------------|
  | Flipkart | E-Kart Logistics |
  | Amazon   | Amazon |
  | Meesho   | Delhivery / Shadowfax |
  | Shopsy   | E-Kart Logistics |

- **Removed** the old generic "courier" column table.

- **New KPI cards** at the top:
  - 📤 Uploaded (imported on selected date)
  - ✅ Dispatched (scanned & shipped)
  - ⏳ Pending (Ready to Ship)
  - 🚚 In Transit (active, all time)
  - ↩️ Return Received (all time)

- **Daily Logic**: Date picker resets to today; each date shows its own upload/dispatch/pending counts independently.

- **Per-platform breakdown table** with columns:
  Uploaded | Dispatched | Pending | Scanned | Manual | COD | Prepaid | In Transit | Returned | Discrepancy

- **Extended status tracking**: Pending vs Dispatched vs In-Transit vs Return Received are all visible and filterable.

- **Date-based filtering**: Filter detail table by Platform, Status, Payment, Company.

- **💾 Save Snapshot button**: Manually saves today's reconciliation state to `oms_reconciliation_history` in Supabase so data is not lost when the dashboard resets.

---

### 2. AWB Extraction Fix (`src/db.js` — `extractSpineAwb()`)

**v5 Enhanced Bounding-Box Spine Extractor**:

- **Multi-column scan**: Now tries up to **3 candidate spine columns** (not just the single best column), so labels with multiple left-side text columns don't miss the AWB column.

- **SF-prefix AWB handling**: Explicitly distinguishes:
  - `SF<digits>FPL` → Shadowfax-dispatched (Meesho)
  - `SF<digits>` (no FPL) → Shadowfax-routed Flipkart (Ekart routing)
  Both are now correctly extracted without confusion.

- **Wider bin width (10px vs 8px)**: More robust clustering of characters that pdfjs places 1–2px apart.

- **Keyword boundary patterns expanded**: Added `SUR`, `RSH`, `FpbS`, `FYNW`, `FZY`, `FK`, `Frx` as known trailing keywords for the AWB anchor pattern — these appear on real Flipkart/Amazon label spines.

- **Fallback pass**: If no spine column is found, falls back to scanning ALL page items sorted by x then y — catches edge cases.

---

### 3. Supabase: Reconciliation History Table (`supabase_schema.sql`)

New table added: **`oms_reconciliation_history`**

```sql
create table oms_reconciliation_history (
  id            bigint generated always as identity primary key,
  snapshot_date date        not null unique,
  summary_data  jsonb       not null,
  saved_at      timestamptz not null default now()
);
```

- **One row per calendar day** (UNIQUE on `snapshot_date`).
- Stores full JSON breakdown: totals by platform, status counts, dispatched/pending/in-transit/returned.
- RLS enabled with anon access (same as all other OMS tables).
- Added to `supabase_realtime` publication.

---

### 4. Nightly Backup Function (`supabase_schema.sql`)

New Postgres function: **`oms_save_nightly_recon_snapshot()`**

- Called by `pg_cron` at **18:20 UTC (11:50 PM IST)** nightly.
- Auto-builds the day's reconciliation summary from `oms_orders` and upserts it into `oms_reconciliation_history`.
- If a manual snapshot was already saved that day, it is updated (upsert logic).
- **Schedule setup** (run once after enabling pg_cron extension):
  ```sql
  select cron.schedule(
    'nightly-recon-snapshot',
    '20 18 * * *',
    $$ select oms_save_nightly_recon_snapshot(); $$
  );
  ```

---

### 5. RLS Configuration Notes (`supabase_schema.sql`)

All tables use **`for all using (true) with check (true)`** — globally accessible across all devices using the same Supabase anon key, with no per-user restrictions.

**Security posture** (unchanged from v4, but now documented clearly):
- Appropriate for a small internal business tool where the anon key stays on your own devices.
- To tighten: enable Supabase Auth, change policies to `using (auth.uid() is not null)`, update `LoginPage.jsx` to call `supabase.auth.signInWithPassword()`.

---

### 6. Vercel Deployment

No changes needed to `vercel.json` — it already rewrites all routes to `index.html` and the Vite build handles everything.

**Environment variables** (set in Vercel Dashboard → Project → Settings → Environment Variables):
```
VITE_SUPABASE_URL      = https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY = eyJ...
```

Both are `VITE_` prefixed so Vite injects them into the client bundle at build time. Never put these in `vercel.json` — always in the Environment Variables UI.

---

## Data Integrity

- ✅ All existing historical data in Supabase **untouched** — no table drops, no data migrations.
- ✅ All localStorage-cached data remains usable as offline fallback.
- ✅ New `oms_reconciliation_history` table is additive — no breaking changes.
