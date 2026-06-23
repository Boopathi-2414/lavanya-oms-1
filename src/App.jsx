import { useState, useEffect, useCallback, useRef } from 'react';
import { loadDB, saveDB } from './db.js';
import * as XLSX from 'xlsx';
import { today } from './db.js';
import { isSupabaseConfigured } from './supabase.js';
import { fetchFreshDB, syncDBToSupabase, snapshotIds, mergeMissingLocalIntoFresh, subscribeToChanges, migrateHistoricalData } from './supabaseData.js';

import ToastContainer, { toast } from './components/Toast.jsx';
import LoginPage      from './components/LoginPage.jsx';
import Dashboard      from './components/Dashboard.jsx';
import Sales          from './components/Sales.jsx';
import Dispatch       from './components/Dispatch.jsx';
import Returns        from './components/Returns.jsx';
import Received       from './components/Received.jsx';
import Payments       from './components/Payments.jsx';
import Products       from './components/Products.jsx';
import Reports        from './components/Reports.jsx';
import Trash          from './components/Trash.jsx';
import FraudAnalysis    from './components/FraudAnalysis.jsx';
import PickupDashboard  from './components/PickupDashboard.jsx';

const NAV = [
  { section: 'Overview' },
  { id: 'dashboard', label: 'Dashboard',        ico: '📊' },
  { section: 'Operations' },
  { id: 'sales',     label: 'Sales Entry',      ico: '📦' },
  { id: 'dispatch',  label: 'Scan & Dispatch',  ico: '🚀' },
  { id: 'pickup',    label: 'Pickup Dashboard', ico: '📦' },
  { id: 'returns',   label: 'Return Transit',   ico: '🔄' },
  { id: 'received',  label: 'Return Received',  ico: '✅' },
  { section: 'Finance' },
  { id: 'payments',  label: 'Payment Entry',    ico: '💰' },
  { id: 'products',  label: 'Purchase Rates',   ico: '🏷️' },
  { section: 'Analytics' },
  { id: 'fraud',     label: 'Fraud Analysis',   ico: '🚨', badge: 'fraud' },
  { section: 'Reports' },
  { id: 'reports',   label: 'Monthly Report',   ico: '📈' },
  { id: 'trash',     label: 'Trash',            ico: '🗑️' },
];

export default function App() {
  const [user,    setUser]    = useState(null);
  const [tab,     setTab]     = useState('dashboard');
  const [db,      setDbRaw]   = useState(() => loadDB());

  // Sync status surfaced on the Dashboard's "Refresh Data" button.
  const [syncState,      setSyncState]      = useState('idle'); // idle | syncing | synced | offline | error
  const [lastSynced,     setLastSynced]     = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Diff baseline for pushing only changed rows to Supabase — captured
  // separately from `db` itself (see supabaseData.js for why: every screen
  // mutates db.orders/db.trash/etc. in place before calling setDb).
  const snapshotRef = useRef(snapshotIds(db));

  // Fetches the real, shared data straight from Supabase — used both on
  // page load and from the Dashboard's "Refresh Data" button, so the
  // person always sees current data instead of a stale local copy.
  const refreshFromSupabase = useCallback(async ({ silent } = {}) => {
    if (!isSupabaseConfigured()) { setSyncState('offline'); return; }
    setSyncState('syncing');
    try {
      const fresh = await fetchFreshDB();
      const local = loadDB();
      // Never let a refresh silently throw away records that only exist on
      // THIS device (offline edits not synced yet, or the first time this
      // device connects to a Supabase project that already has other
      // devices' data, or vice versa).
      const { merged, rescued } = mergeMissingLocalIntoFresh(fresh, local);
      const rescuedCount = Object.values(rescued).reduce((a, b) => a + b, 0);

      if (rescuedCount > 0) {
        const result = await syncDBToSupabase(merged, snapshotIds(fresh));
        snapshotRef.current = result.snapshot;
        setDbRaw(merged);
        saveDB(merged);
        setSyncState(result.ok ? 'synced' : 'error');
        setLastSynced(new Date());
        toast(`Found ${rescuedCount} record(s) saved only on this device — uploaded them to Supabase instead of overwriting them.`, 'success');
      } else {
        setDbRaw(fresh);
        saveDB(fresh); // keep the local cache in step, for instant load + offline fallback only
        snapshotRef.current = snapshotIds(fresh);
        setSyncState('synced');
        setLastSynced(new Date());
        if (!silent) toast('Dashboard refreshed with the latest data from Supabase', 'success');
      }
    } catch (e) {
      console.error('Supabase refresh failed:', e);
      setSyncState('error');
      if (!silent) toast('Could not reach Supabase — showing the last saved data instead', 'error');
    }
  }, []);

  // Every time the app loads (right after sign-in), pull fresh data instead
  // of trusting whatever's cached locally. We hold the dashboard behind a
  // brief loading screen below rather than flashing stale numbers first.
  useEffect(() => {
    if (!user) return;
    if (isSupabaseConfigured()) {
      refreshFromSupabase({ silent: true }).finally(() => setInitialLoading(false));
    } else {
      setInitialLoading(false);
    }
  }, [user]); // eslint-disable-line

  // Live cross-device updates: once signed in, listen for any insert/
  // update/delete on the core tables (from THIS device or any other —
  // laptop, phone, whatever else is open) and pull the fresh copy down
  // automatically, instead of waiting for a manual "Refresh Data" click
  // or the next full page load. Multiple changes that land in a quick
  // burst (e.g. a PDF import writing 40 orders at once) are coalesced
  // into a single refetch via a short debounce, rather than firing one
  // fetchFreshDB() per row.
  useEffect(() => {
    if (!user || initialLoading || !isSupabaseConfigured()) return;

    let debounceTimer = null;
    const unsubscribe = subscribeToChanges(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshFromSupabase({ silent: true });
      }, 600);
    });

    return () => {
      clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [user, initialLoading]); // eslint-disable-line

  function handleManualRefresh() {
    if (isSupabaseConfigured()) {
      refreshFromSupabase({});
    } else {
      setDbRaw(loadDB());
      toast('Reloaded from local storage — Supabase is not configured, so this device has no shared copy to refresh from.', 'info');
    }
  }

  const setDb = useCallback((next) => {
    setDbRaw(next);
    saveDB(next); // instant local cache, also doubles as the offline fallback
    if (isSupabaseConfigured()) {
      syncDBToSupabase(next, snapshotRef.current).then((result) => {
        snapshotRef.current = result.snapshot;
        if (!result.ok) {
          toast('Some changes couldn\u2019t reach Supabase just now (saved locally) — they\u2019ll sync automatically on the next save.', 'info');
        }
      });
    }
  }, []);

  useEffect(() => {
    if (user && !initialLoading && db.orders.length === 0)
      toast('Welcome to Lavanya OMS v3.8! Upload PDF labels to get started.', 'info');
  }, [user, initialLoading]); // eslint-disable-line

  function exportAllData() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.orders.filter((x) => !x.deleted)), 'Orders');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.payments), 'Payments');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.products), 'Products');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.fraudList || []), 'FraudBlocklist');
    XLSX.writeFile(wb, `Lavanya_AllData_${today()}.xlsx`);
    toast('All data exported', 'success');
  }

  if (!user) {
    return (
      <>
        <ToastContainer />
        <LoginPage onLogin={setUser} />
      </>
    );
  }

  if (initialLoading) {
    return (
      <>
        <ToastContainer />
        <div className="login-wrapper">
          <div className="login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🪡</div>
            <p style={{ color: 'var(--muted)' }}>Loading the latest data from Supabase…</p>
          </div>
        </div>
      </>
    );
  }

  const activeOrders  = db.orders.filter((o) => !o.deleted);
  const fraudCount    = activeOrders.filter((o) => o.fraudAlert).length;
  const exchangeCount = activeOrders.filter((o) => o.orderType === 'Exchange').length;

  const tabTitles = {
    dashboard: 'Dashboard', sales: 'Sales Entry', dispatch: 'Scan & Dispatch', pickup: 'Pickup Dashboard',
    returns: 'Return Transit', received: 'Return Received', payments: 'Payment Entry',
    products: 'Purchase Rates', reports: 'Monthly Report', trash: 'Trash',
    fraud: 'Fraud Analysis / Blocklist',
  };

  function renderTab() {
    const props = {
      db, setDb,
      onRefresh: handleManualRefresh,
      syncState,
      lastSynced,
      supabaseConfigured: isSupabaseConfigured(),
    };
    switch (tab) {
      case 'dashboard': return <Dashboard    {...props} />;
      case 'sales':     return <Sales        {...props} />;
      case 'dispatch':  return <Dispatch     {...props} />;
      case 'pickup':    return <PickupDashboard db={db} />;
      case 'returns':   return <Returns      {...props} />;
      case 'received':  return <Received     {...props} />;
      case 'payments':  return <Payments     {...props} />;
      case 'products':  return <Products     {...props} />;
      case 'reports':   return <Reports      {...props} />;
      case 'trash':     return <Trash        {...props} />;
      case 'fraud':     return <FraudAnalysis {...props} />;
      default:          return <Dashboard    {...props} />;
    }
  }

  return (
    <>
      <ToastContainer />

      {/* ── SIDEBAR ── */}
      <nav className="sidebar">
        <div className="brand">
          <div style={{ fontSize: 22, marginBottom: 6 }}>🪡</div>
          <div className="brand-name">Lavanya Aari<br />Materials</div>
          <div className="brand-sub">Order Management</div>
        </div>

        <div className="nav">
          {NAV.map((item, i) => {
            if (item.section) {
              return <div key={i} className="nav-section">{item.section}</div>;
            }
            const badgeCount = item.badge === 'fraud' ? fraudCount : 0;
            return (
              <button
                key={item.id}
                className={`nav-item${tab === item.id ? ' active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className="ico">{item.ico}</span>
                {item.label}
                {badgeCount > 0 && (
                  <span className="nav-badge">{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Exchange quick-link */}
        {exchangeCount > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <button
              className={`nav-item${tab === 'sales' ? '' : ''}`}
              style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b', width: '100%', borderRadius: 8 }}
              onClick={() => setTab('dashboard')}
            >
              🔁 {exchangeCount} Exchange{exchangeCount > 1 ? 's' : ''}
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <span>v3.16 · {user.role} · {isSupabaseConfigured() ? 'Synced via Supabase' : 'Local Storage'}</span>
          {isSupabaseConfigured() && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 6, fontSize: 11, width: '100%', opacity: 0.75 }}
              onClick={async () => {
                toast('Migrating historical data to Supabase…', 'info');
                const result = await migrateHistoricalData((msg) => toast(msg, 'info'));
                if (result.ok) {
                  toast(`✅ Migration complete — ${result.inserted} records uploaded`, 'success');
                  refreshFromSupabase({ silent: true });
                } else if (result.error) {
                  toast(`Migration error: ${result.error}`, 'error');
                } else {
                  toast(`⚠ Migration done with ${result.errors} error(s) — check console`, 'info');
                }
              }}
              title="Push the 233-order historical dataset to Supabase (safe to run multiple times)"
            >
              ☁ Migrate Historical Data
            </button>
          )}
        </div>
      </nav>

      {/* ── MAIN ── */}
      <div className="main">
        <div className="topbar">
          <div className="page-title">{tabTitles[tab] || tab}</div>
          <div className="topbar-right">
            <button className="btn btn-outline btn-sm" onClick={exportAllData}>⬇ Export All</button>
            <span className="badge">{activeOrders.length} orders</span>
            {fraudCount > 0 && (
              <span
                className="badge"
                style={{ background: '#ef4444', cursor: 'pointer' }}
                onClick={() => setTab('fraud')}
                title="View fraud alerts"
              >
                🚨 {fraudCount} alerts
              </span>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setUser(null); toast('Signed out', 'info'); }}
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="content">
          {renderTab()}
        </div>
      </div>
    </>
  );
}
