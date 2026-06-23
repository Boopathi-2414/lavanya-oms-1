// ============================================================
// import_data.js — One-time historical data importer
// ============================================================
// PURPOSE:
//   Reads your old exported data (finaldata.json) and pushes every
//   order and trash record into the Supabase tables that the dashboard
//   uses (oms_orders and oms_trash).
//
// HOW TO RUN (once only):
//   1. Make sure you have Node.js installed (v18+ recommended).
//   2. In this project folder, install the Supabase client if needed:
//        npm install
//   3. Copy .env.example to .env and fill in your Supabase credentials:
//        VITE_SUPABASE_URL=https://your-project-ref.supabase.co
//        VITE_SUPABASE_ANON_KEY=eyJ...
//   4. Place your exported file (finaldata.json) in the same folder as
//      this script (the project root).
//   5. Run:
//        node import_data.js
//
// SAFETY:
//   - Uses UPSERT (insert … on conflict do update) so running this
//     script more than once is harmless — no duplicate rows.
//   - Never deletes or overwrites existing records that are already
//     in Supabase; new records simply appear alongside them.
//   - Does NOT touch any source file, UI code, or .env file.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Resolve paths ─────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed — we just parse it)
function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  if (!existsSync(envPath)) {
    console.error('\n❌  .env file not found.');
    console.error('   Copy .env.example to .env and fill in your Supabase credentials.\n');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && val) process.env[key] = process.env[key] ?? val;
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || SUPABASE_URL.includes('your-project-ref')) {
  console.error('\n❌  VITE_SUPABASE_URL is not set in .env.');
  console.error('   Edit .env and add your real Supabase project URL.\n');
  process.exit(1);
}
if (!SUPABASE_KEY || SUPABASE_KEY.endsWith('...')) {
  console.error('\n❌  VITE_SUPABASE_ANON_KEY is not set in .env.');
  console.error('   Edit .env and add your real Supabase anon key.\n');
  process.exit(1);
}

// ── Load data file ────────────────────────────────────────────────────
const DATA_FILE = resolve(__dirname, 'finaldata.json');

if (!existsSync(DATA_FILE)) {
  console.error('\n❌  finaldata.json not found in the project root.');
  console.error(`   Expected location: ${DATA_FILE}\n`);
  process.exit(1);
}

console.log('\n📂  Reading finaldata.json …');
let rawData;
try {
  const raw = readFileSync(DATA_FILE, 'utf8');
  // The export format wraps everything in a JSON string inside JSON
  // (the file content is a quoted+escaped JSON string)
  const parsed = JSON.parse(raw);
  rawData = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
} catch (err) {
  console.error('❌  Could not parse finaldata.json:', err.message);
  process.exit(1);
}

const orders    = Array.isArray(rawData.orders)    ? rawData.orders    : [];
const trashList = Array.isArray(rawData.trash)     ? rawData.trash     : [];
const payments  = Array.isArray(rawData.payments)  ? rawData.payments  : [];
const products  = Array.isArray(rawData.products)  ? rawData.products  : [];
const fraudList = Array.isArray(rawData.fraudList) ? rawData.fraudList : [];

console.log(`   Found: ${orders.length} orders, ${trashList.length} trash records`);
if (payments.length)  console.log(`          ${payments.length} payments`);
if (products.length)  console.log(`          ${products.length} products`);
if (fraudList.length) console.log(`          ${fraudList.length} fraud list entries`);

// ── Supabase client ───────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────
const BATCH = 100; // Supabase handles ~500 rows/request fine; 100 is safe

async function upsertBatch(tableName, records) {
  if (!records.length) return { inserted: 0, errors: [] };

  // Each row: { id, data, updated_at }
  // The app stores the full object in `data` and uses `id` as the PK.
  const rows = records.map((rec) => ({
    id:         String(rec.id),
    data:       rec,
    updated_at: rec.updatedAt || rec.createdAt || new Date().toISOString(),
  }));

  let inserted = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: 'id' });

    if (error) {
      errors.push({ batch: i / BATCH, message: error.message });
    } else {
      inserted += chunk.length;
    }

    // Small delay to stay well within Supabase rate limits
    if (i + BATCH < rows.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return { inserted, errors };
}

// ── Customer profiles (fraud detection background table) ──────────────
function normKey(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function upsertCustomerProfiles(allOrders) {
  // Aggregate order + return counts per lookup key
  const profileMap = new Map();

  for (const order of allOrders) {
    const key = normKey(order.customer) + '|' + normKey(order.phone);
    if (!key.replace('|', '').trim()) continue;

    if (!profileMap.has(key)) {
      profileMap.set(key, {
        lookup_key:    key,
        customer_name: order.customer || '',
        phone:         order.phone    || '',
        address:       order.address  || '',
        company_id:    order.companyId || 'lavanya',
        channel:       order.channel  || '',
        last_order_id: order.id       || '',
        order_count:   0,
        return_count:  0,
        updated_at:    order.createdAt || new Date().toISOString(),
      });
    }

    const p = profileMap.get(key);
    p.order_count += 1;
    if (order.orderType === 'Exchange') p.return_count += 1;
    // Keep the latest order id
    if (order.createdAt > (p.updated_at || '')) {
      p.last_order_id = order.id;
      p.updated_at    = order.createdAt;
    }
  }

  const profiles = [...profileMap.values()];
  if (!profiles.length) return { inserted: 0, errors: [] };

  let inserted = 0;
  const errors = [];

  for (let i = 0; i < profiles.length; i += BATCH) {
    const chunk = profiles.slice(i, i + BATCH);
    const { error } = await supabase
      .from('customer_profiles')
      .upsert(chunk, { onConflict: 'lookup_key' });

    if (error) {
      errors.push({ batch: i / BATCH, message: error.message });
    } else {
      inserted += chunk.length;
    }
    if (i + BATCH < profiles.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return { inserted, errors };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔗  Connecting to Supabase …');

  // Quick connectivity check
  const { error: pingError } = await supabase
    .from('oms_orders')
    .select('id')
    .limit(1);

  if (pingError) {
    console.error('\n❌  Could not reach Supabase:', pingError.message);
    console.error('   Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env,');
    console.error('   and make sure you have run supabase_schema.sql in your project.\n');
    process.exit(1);
  }

  console.log('   ✅  Connected.\n');

  // ── 1. Orders ───────────────────────────────────────────────────────
  if (orders.length) {
    process.stdout.write(`📦  Importing ${orders.length} orders into oms_orders … `);
    const { inserted, errors } = await upsertBatch('oms_orders', orders);
    if (errors.length) {
      console.log(`⚠️  ${inserted} OK, ${errors.length} batch error(s):`);
      errors.forEach((e) => console.error('   ', e.message));
    } else {
      console.log(`✅  ${inserted} upserted`);
    }
  } else {
    console.log('ℹ️  No orders to import.');
  }

  // ── 2. Trash ────────────────────────────────────────────────────────
  if (trashList.length) {
    process.stdout.write(`🗑️  Importing ${trashList.length} trash records into oms_trash … `);
    const { inserted, errors } = await upsertBatch('oms_trash', trashList);
    if (errors.length) {
      console.log(`⚠️  ${inserted} OK, ${errors.length} batch error(s):`);
      errors.forEach((e) => console.error('   ', e.message));
    } else {
      console.log(`✅  ${inserted} upserted`);
    }
  } else {
    console.log('ℹ️  No trash records to import.');
  }

  // ── 3. Payments ─────────────────────────────────────────────────────
  if (payments.length) {
    process.stdout.write(`💳  Importing ${payments.length} payments into oms_payments … `);
    const { inserted, errors } = await upsertBatch('oms_payments', payments);
    if (errors.length) {
      console.log(`⚠️  ${inserted} OK, ${errors.length} batch error(s):`);
      errors.forEach((e) => console.error('   ', e.message));
    } else {
      console.log(`✅  ${inserted} upserted`);
    }
  }

  // ── 4. Products ─────────────────────────────────────────────────────
  if (products.length) {
    process.stdout.write(`🏷️  Importing ${products.length} products into oms_products … `);
    const { inserted, errors } = await upsertBatch('oms_products', products);
    if (errors.length) {
      console.log(`⚠️  ${inserted} OK, ${errors.length} batch error(s):`);
      errors.forEach((e) => console.error('   ', e.message));
    } else {
      console.log(`✅  ${inserted} upserted`);
    }
  }

  // ── 5. Fraud list ───────────────────────────────────────────────────
  if (fraudList.length) {
    process.stdout.write(`🚨  Importing ${fraudList.length} fraud entries into oms_fraud_list … `);
    const { inserted, errors } = await upsertBatch('oms_fraud_list', fraudList);
    if (errors.length) {
      console.log(`⚠️  ${inserted} OK, ${errors.length} batch error(s):`);
      errors.forEach((e) => console.error('   ', e.message));
    } else {
      console.log(`✅  ${inserted} upserted`);
    }
  }

  // ── 6. Customer profiles (fraud detection) ──────────────────────────
  const allOrdersForProfiles = [...orders, ...trashList];
  if (allOrdersForProfiles.length) {
    process.stdout.write(`👤  Building customer profiles for fraud detection … `);
    const { inserted, errors } = await upsertCustomerProfiles(allOrdersForProfiles);
    if (errors.length) {
      console.log(`⚠️  ${inserted} OK, ${errors.length} batch error(s):`);
      errors.forEach((e) => console.error('   ', e.message));
    } else {
      console.log(`✅  ${inserted} profiles upserted`);
    }
  }

  console.log('\n🎉  Import complete!');
  console.log('   Open your dashboard and click "Refresh Data" (or reload the page)');
  console.log('   to see all your historical orders alongside the new data.\n');
}

main().catch((err) => {
  console.error('\n❌  Unexpected error:', err);
  process.exit(1);
});
