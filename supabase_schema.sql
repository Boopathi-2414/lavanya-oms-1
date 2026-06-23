-- ============================================================
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
-- ============================================================
-- This table stores customer name/address/phone in the BACKGROUND only.
-- The Sales dashboard table never reads or displays the address column —
-- it is used solely by getCustomerProfile()/upsertCustomerProfile() in
-- src/supabase.js to flag repeat-return buyers via a hidden lookup.

create table if not exists customer_profiles (
  id              bigint generated always as identity primary key,
  lookup_key      text unique not null,   -- normalized "name|phone"
  customer_name   text,
  phone           text,
  address         text,
  company_id      text,
  channel         text,
  last_order_id   text,
  order_count     integer not null default 0,
  return_count    integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_customer_profiles_lookup_key on customer_profiles (lookup_key);

-- Row Level Security — enabled by default on new Supabase projects.
-- The policy below allows the app's anon key to read/write this table.
-- Tighten this (e.g. restrict to an authenticated role) before using
-- this in production with real customer PII.
alter table customer_profiles enable row level security;

create policy "Allow anon read" on customer_profiles
  for select using (true);

create policy "Allow anon insert" on customer_profiles
  for insert with check (true);

create policy "Allow anon update" on customer_profiles
  for update using (true);

-- ============================================================
-- v3.7 — CORE DATA SYNC (orders / payments / products / trash / fraud list)
-- ============================================================
-- Until now only `customer_profiles` (above) was synced to Supabase — it's
-- a background table used solely for fraud detection. The Dashboard, Sales,
-- Dispatch, Returns, Payments, Products, Trash and Fraud Analysis screens
-- all ran on `localStorage` only, which is why data didn't match between
-- your laptop and your phone: each device had its own separate copy and
-- nothing was actually being shared.
--
-- These five tables are the real fix: every order/payment/product/trash/
-- fraud-blocklist record gets pushed here, and the app now reads from these
-- tables (via "Refresh Data" and on every page load) instead of only
-- trusting whatever's cached locally.
--
-- Each row stores the full record as JSON in `data`, keyed by the same
-- `id` the app already generates client-side (see genId() in db.js). This
-- keeps the schema in sync automatically as fields get added to orders in
-- the future, without needing another SQL migration each time.

create table if not exists oms_orders (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists oms_payments (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists oms_products (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists oms_trash (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists oms_fraud_list (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_oms_orders_updated_at      on oms_orders (updated_at);
create index if not exists idx_oms_payments_updated_at    on oms_payments (updated_at);
create index if not exists idx_oms_products_updated_at    on oms_products (updated_at);
create index if not exists idx_oms_trash_updated_at       on oms_trash (updated_at);
create index if not exists idx_oms_fraud_list_updated_at  on oms_fraud_list (updated_at);

alter table oms_orders      enable row level security;
alter table oms_payments    enable row level security;
alter table oms_products    enable row level security;
alter table oms_trash       enable row level security;
alter table oms_fraud_list  enable row level security;

-- ⚠️ SECURITY NOTE: the app currently signs users in with a hard-coded
-- local check (see LoginPage.jsx), not real Supabase Auth — so, exactly
-- like the `customer_profiles` policy above, these policies allow anyone
-- holding your public "anon" key (which ships inside the app bundle) to
-- read and write every order, including customer name/phone/address.
-- That's an acceptable tradeoff for a small internal tool with a key
-- that never leaves your own devices, but it's worth knowing — if you
-- ever distribute this app more widely, add real Supabase Auth and
-- tighten these to `using (auth.uid() = ...)` checks instead of `true`.
create policy "Allow anon all - oms_orders" on oms_orders
  for all using (true) with check (true);
create policy "Allow anon all - oms_payments" on oms_payments
  for all using (true) with check (true);
create policy "Allow anon all - oms_products" on oms_products
  for all using (true) with check (true);
create policy "Allow anon all - oms_trash" on oms_trash
  for all using (true) with check (true);
create policy "Allow anon all - oms_fraud_list" on oms_fraud_list
  for all using (true) with check (true);

-- ============================================================
-- v3.9 — ENABLE REALTIME (cross-device live updates)
-- ============================================================
-- RLS policies above control who can read/write rows. Realtime is a
-- SEPARATE switch: Postgres only broadcasts change events for tables
-- that have been added to the `supabase_realtime` publication. Without
-- this, the app's new realtime listener (src/supabaseData.js,
-- subscribeToChanges) will connect successfully but never receive any
-- insert/update/delete events, and the UI will silently fall back to
-- only updating on manual "Refresh Data" clicks or page load.
--
-- Run this once. It's safe to re-run — `add table` is skipped instead
-- of erroring if a table is already in the publication.
-- (Equivalent UI path: Supabase Dashboard → Database → Replication →
-- toggle each table on under the "supabase_realtime" publication.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'oms_orders'
  ) then
    alter publication supabase_realtime add table oms_orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'oms_payments'
  ) then
    alter publication supabase_realtime add table oms_payments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'oms_products'
  ) then
    alter publication supabase_realtime add table oms_products;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'oms_trash'
  ) then
    alter publication supabase_realtime add table oms_trash;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'oms_fraud_list'
  ) then
    alter publication supabase_realtime add table oms_fraud_list;
  end if;
end $$;

-- ============================================================
-- COURIER-WISE ANALYTICS — Platform → Courier → Status aggregate
-- ============================================================
-- Optional, additive: the Dashboard already builds this same breakdown
-- in JS from data already in memory (see flattenCourierBreakdown() in
-- src/db.js) — that path needs nothing from this file and works whether
-- or not you ever run this. This function exists for the cases the JS
-- path doesn't cover: an external reporting tool, a scheduled export, or
-- a dataset large enough that pulling every order to the client just to
-- count it stops being the right call.
--
-- Run this once in the SQL Editor, the same way as the tables above.
-- It is intentionally generic — it groups by whatever `channel`/
-- `courier`/`status` values are actually sitting in each order's `data`
-- JSON, the same fields the parser writes (see db.js). It does NOT list
-- any platform or courier name anywhere in this function: a brand-new
-- courier appears in its results automatically the next time an order
-- carrying that value is synced, with zero changes to this function.
create or replace function oms_courier_breakdown()
returns table (
  channel text,
  courier text,
  status  text,
  order_count bigint
)
language sql
stable
as $$
  select
    coalesce(data->>'channel', 'Unknown') as channel,
    coalesce(data->>'courier', 'Unknown') as courier,
    coalesce(data->>'status',  'Ready to Ship') as status,
    count(*) as order_count
  from oms_orders
  where coalesce((data->>'deleted')::boolean, false) = false
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

-- Lets the app's anon key call the function above (RLS on the
-- underlying table still applies — see the "Allow anon all - oms_orders"
-- policy above).
grant execute on function oms_courier_breakdown() to anon, authenticated;

-- ============================================================
-- v3.10 — QUANTITY FIELD
-- ============================================================
-- The app now extracts the ordered quantity off Amazon/Flipkart/Meesho
-- shipping labels (see extractQty() in src/db.js) and stores it on every
-- order/trash record as `quantity` (a plain number, defaulting to 1 when
-- a label doesn't have a recognizable "QTY" marker). Because oms_orders
-- already stores the whole order as one `data jsonb` blob (see the v3.7
-- section above), no column needed to be added for the app itself to
-- read or write this field — it's already there as data->>'quantity'
-- for every order synced after this update.
--
-- This block additionally exposes that value as a REAL, top-level
-- `quantity` column on oms_orders, generated automatically from the
-- jsonb data and kept in sync with it. This is what makes it possible to
-- filter/sort/sum by quantity directly in SQL (e.g. an external report,
-- or "total units dispatched today") without unpacking the jsonb data
-- every time. It is safe to re-run.
alter table oms_orders
  add column if not exists quantity integer
  generated always as ( coalesce((data->>'quantity')::integer, 1) ) stored;

create index if not exists idx_oms_orders_quantity on oms_orders (quantity);

-- Historical orders synced to this table before this update simply don't
-- have a "quantity" key in their `data` yet — the generated column above
-- already handles that case by defaulting to 1 (same default the app's
-- own parser uses), so nothing needs to be backfilled here.

-- ============================================================
-- v5 — DAILY RECONCILIATION HISTORY TABLE
-- ============================================================
-- Stores nightly snapshots of the Daily Pickup Dashboard state so
-- data is never lost after the dashboard resets for the next day.
-- Triggered from the "Save Snapshot" button in PickupDashboard.jsx
-- or via the Postgres cron function below (pg_cron extension).
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run (once only).

create table if not exists oms_reconciliation_history (
  id            bigint generated always as identity primary key,
  snapshot_date date        not null unique,   -- one row per calendar day
  summary_data  jsonb       not null,          -- full breakdown: platforms, counts, etc.
  saved_at      timestamptz not null default now()
);

create index if not exists idx_recon_history_date on oms_reconciliation_history (snapshot_date desc);

alter table oms_reconciliation_history enable row level security;

create policy "Allow anon all - oms_recon_history" on oms_reconciliation_history
  for all using (true) with check (true);

-- ============================================================
-- v5 — NIGHTLY BACKUP FUNCTION (pg_cron)
-- ============================================================
-- This function is called nightly (e.g. 11:50 PM IST = 18:20 UTC)
-- to auto-snapshot the day's reconciliation data from oms_orders.
-- Requires the pg_cron extension — enable it in:
--   Supabase Dashboard → Database → Extensions → pg_cron → Enable
--
-- Once enabled, schedule the job with:
--   select cron.schedule(
--     'nightly-recon-snapshot',
--     '20 18 * * *',              -- 18:20 UTC = 11:50 PM IST
--     $$ select oms_save_nightly_recon_snapshot(); $$
--   );

create or replace function oms_save_nightly_recon_snapshot()
returns void
language plpgsql
as $$
declare
  v_today date := current_date;
  v_summary jsonb;
begin
  -- Build JSON summary from current oms_orders
  select jsonb_build_object(
    'date',              v_today::text,
    'auto_generated',    true,
    'generated_at',      now()::text,
    'totalOrders',       count(*),
    'dispatched',        count(*) filter (where data->>'status' = 'Dispatched'),
    'pending',           count(*) filter (where data->>'status' in ('Ready to Ship','Pending')),
    'inTransit',         count(*) filter (where data->>'status' = 'In Transit'),
    'returnReceived',    count(*) filter (where data->>'status' in ('Return Received','RTO Received')),
    'byPlatform', (
      select jsonb_object_agg(
        coalesce(data->>'channel', 'Unknown'),
        jsonb_build_object(
          'total',      platform_count,
          'dispatched', platform_dispatched,
          'pending',    platform_pending
        )
      )
      from (
        select
          coalesce(data->>'channel', 'Unknown') as ch,
          count(*) as platform_count,
          count(*) filter (where data->>'status' = 'Dispatched') as platform_dispatched,
          count(*) filter (where data->>'status' in ('Ready to Ship','Pending')) as platform_pending
        from oms_orders
        where coalesce((data->>'deleted')::boolean, false) = false
        group by 1
      ) t
    )
  )
  into v_summary
  from oms_orders
  where coalesce((data->>'deleted')::boolean, false) = false;

  -- Upsert: if today's snapshot was already manually saved, update it
  insert into oms_reconciliation_history (snapshot_date, summary_data, saved_at)
  values (v_today, v_summary, now())
  on conflict (snapshot_date)
  do update set summary_data = v_summary, saved_at = now();
end;
$$;

grant execute on function oms_save_nightly_recon_snapshot() to anon, authenticated;

-- ============================================================
-- v5 — IMPROVED RLS: App-level password protection + global access
-- ============================================================
-- The app uses a hard-coded password check in LoginPage.jsx, so
-- all access goes through the Supabase anon key. The policies below
-- ensure data is globally accessible across ALL devices of the same
-- business (phone, laptop, tablet) while keeping it behind the
-- Supabase project's own anon-key access barrier.
--
-- To make this MORE secure later:
--   1. Enable Supabase Auth (Email + Password, or Google OAuth).
--   2. Change each policy's `using (true)` to `using (auth.uid() is not null)`.
--   3. Update LoginPage.jsx to call supabase.auth.signInWithPassword().
--
-- For now (small internal tool, shared anon key never leaves your devices):
-- the existing "Allow anon all" policies are appropriate.

-- Ensure realtime is enabled for the new history table too
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'oms_reconciliation_history'
  ) then
    alter publication supabase_realtime add table oms_reconciliation_history;
  end if;
end $$;
