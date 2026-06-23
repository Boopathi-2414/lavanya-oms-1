# Backup, Deployment & Future-Proofing Guide
## Lavanya OMS v4.0

---

## 1. Vercel Deployment

### Steps
1. Push this repo to GitHub.
2. Go to https://vercel.com → Import Project → select the repo.
3. Framework: **Vite** (auto-detected). Build command: `npm run build`. Output: `dist`.
4. Under **Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
5. Deploy. Every push to `main` redeploys automatically.

**Do NOT put secrets in `vercel.json` — only in the Vercel dashboard.**

---

## 2. PWA (Progressive Web App)

The app is already configured as a PWA via `vite-plugin-pwa`. After deploying:

- **Android**: Open in Chrome → browser menu → "Add to Home Screen".
- **iOS**: Open in Safari → Share → "Add to Home Screen".
- The app works offline using the cached service worker.
- On new deploys, the service worker auto-updates (`registerType: 'autoUpdate'`).

---

## 3. Supabase Schema Setup

Run `supabase_schema.sql` in your Supabase SQL Editor (one time):
- Creates tables: `oms_orders`, `oms_payments`, `oms_products`, `oms_trash`, `oms_fraud_list`, `customer_profiles`
- Enables Realtime for live cross-device sync
- Creates the `oms_courier_breakdown()` aggregate function

---

## 4. Data Migration

After Supabase is configured, go to the app Settings tab and click
**"Migrate Historical Data"**. This upserts all 739 embedded orders
(from `todaydata.json` + prior history) into Supabase using `ON CONFLICT`
so it is safe to run multiple times — existing records are never overwritten.

---

## 5. Automated Nightly Backups

### Option A: Supabase Built-in Backups (Recommended for Pro/Team plans)
- **Dashboard → Settings → Backups**: Enable point-in-time recovery.
- Supabase Pro includes daily automated database backups retained for 7 days.
- For free plans, use Option B below.

### Option B: GitHub Actions Nightly Export (Free)

Create `.github/workflows/backup.yml`:

```yaml
name: Nightly Supabase Backup
on:
  schedule:
    - cron: '0 1 * * *'   # 1:00 AM UTC daily (6:30 AM IST)
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Export Supabase data via REST
        env:
          SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: |
          DATE=$(date +%Y-%m-%d)
          mkdir -p backups
          for TABLE in oms_orders oms_payments oms_products oms_trash oms_fraud_list; do
            curl -s "$SUPABASE_URL/rest/v1/$TABLE?select=*" \
              -H "apikey: $SUPABASE_KEY" \
              -H "Authorization: Bearer $SUPABASE_KEY" \
              > "backups/${TABLE}_${DATE}.json"
          done

      - name: Commit backup files
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add backups/
          git diff --staged --quiet || git commit -m "Automated backup $(date +%Y-%m-%d)"
          git push
```

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **GitHub Secrets**
(repo Settings → Secrets → Actions).

**Note**: This backs up data from the `anon` role. For a full database dump,
use Supabase's pg_dump via the connection string (available on Pro plans).

---

## 6. Cross-Device Sync

All data syncs globally via Supabase in real time:
- Changes on mobile appear on desktop within seconds (Supabase Realtime).
- Offline edits are queued locally in `localStorage` and pushed on reconnect.
- The "Refresh Data" button on the Dashboard force-pulls the latest from Supabase.

