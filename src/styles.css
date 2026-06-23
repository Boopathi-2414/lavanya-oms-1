:root {
  --deep: #1a1033; --mid: #2d1f5e; --accent: #7c3aed; --accent2: #a855f7;
  --gold: #f59e0b; --green: #10b981; --red: #ef4444; --sky: #06b6d4;
  --bg: #f5f3ff; --card: #ffffff; --text: #1e1b4b; --muted: #6b7280;
  --border: #e0d9f7; --radius: 12px; --shadow: 0 2px 16px rgba(124,58,237,.10);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

/* SIDEBAR */
.sidebar { position: fixed; top: 0; left: 0; width: 240px; height: 100vh; background: linear-gradient(180deg,var(--deep) 0%,var(--mid) 100%); display: flex; flex-direction: column; z-index: 100; overflow-y: auto; }
.brand { padding: 24px 20px 20px; border-bottom: 1px solid rgba(255,255,255,.08); }
.brand-name { color: #fff; font-size: 15px; font-weight: 700; line-height: 1.3; }
.brand-sub { color: var(--accent2); font-size: 11px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; margin-top: 2px; }
.nav { padding: 16px 12px; flex: 1; }
.nav-section { font-size: 10px; font-weight: 600; color: rgba(255,255,255,.35); letter-spacing: .1em; text-transform: uppercase; padding: 8px 8px 4px; margin-top: 8px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; color: rgba(255,255,255,.7); font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; margin-bottom: 2px; border: none; background: none; width: 100%; text-align: left; }
.nav-item:hover { background: rgba(255,255,255,.08); color: #fff; }
.nav-item.active { background: var(--accent); color: #fff; }
.nav-item .ico { font-size: 16px; width: 20px; text-align: center; }
.sidebar-footer { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,.08); }
.sidebar-footer span { color: rgba(255,255,255,.4); font-size: 11px; }

/* LAYOUT */
.main { margin-left: 240px; min-height: 100vh; }
.topbar { background: var(--card); border-bottom: 1px solid var(--border); padding: 16px 28px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
.page-title { font-size: 20px; font-weight: 700; color: var(--deep); }
.topbar-right { display: flex; align-items: center; gap: 12px; }
.badge { background: var(--accent); color: #fff; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; }
.content { padding: 28px; }

/* CARDS */
.card { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 24px; margin-bottom: 20px; border: 1px solid var(--border); }
.card-title { font-size: 15px; font-weight: 700; color: var(--deep); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card { background: var(--card); border-radius: var(--radius); padding: 20px; border: 1px solid var(--border); box-shadow: var(--shadow); position: relative; overflow: hidden; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: var(--radius) var(--radius) 0 0; }
.stat-card.total::before { background: var(--accent); }
.stat-card.dispatched::before { background: var(--green); }
.stat-card.transit::before { background: var(--gold); }
.stat-card.received::before { background: var(--sky); }
.stat-card.rts::before { background: var(--red); }
.stat-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.stat-value { font-size: 32px; font-weight: 800; color: var(--deep); margin-top: 4px; }
.stat-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

/* BUTTONS */
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all .15s; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--mid); }
.btn-success { background: var(--green); color: #fff; }
.btn-success:hover { background: #059669; }
.btn-danger { background: var(--red); color: #fff; }
.btn-danger:hover { background: #dc2626; }
.btn-outline { background: transparent; color: var(--accent); border: 1.5px solid var(--accent); }
.btn-outline:hover { background: var(--accent); color: #fff; }
.btn-ghost { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--border); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-xs { padding: 3px 7px; font-size: 11px; border-radius: 5px; }

/* UPLOAD ZONE */
.upload-zone { border: 2px dashed var(--accent); border-radius: var(--radius); padding: 36px 24px; text-align: center; cursor: pointer; transition: all .2s; background: rgba(124,58,237,.03); }
.upload-zone:hover, .upload-zone.drag-over { background: rgba(124,58,237,.08); border-color: var(--accent2); }
.upload-zone .ico-big { font-size: 36px; }
.upload-zone p { color: var(--muted); margin-top: 8px; font-size: 13px; }
.upload-zone strong { color: var(--accent); }

/* TABLE */
.table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead { background: var(--deep); color: #fff; }
th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; cursor: pointer; user-select: none; }
th:hover { background: rgba(255,255,255,.1); }
th .sort-arrow { font-size: 10px; margin-left: 4px; opacity: .5; }
th.sort-asc .sort-arrow, th.sort-desc .sort-arrow { opacity: 1; }
td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr:hover { background: rgba(124,58,237,.03); }
tbody tr:last-child td { border-bottom: none; }

/* STATUS BADGES */
.status { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.status::before { content: '●'; font-size: 8px; }
.s-ready { background: #ede9fe; color: #5b21b6; }
.s-dispatched { background: #d1fae5; color: #065f46; }
.s-transit { background: #fef3c7; color: #92400e; }
.s-received { background: #cffafe; color: #164e63; }
.s-prepaid { background: #d1fae5; color: #065f46; }
.s-cod { background: #fff7ed; color: #c2410c; }

/* CHIPS */
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.chip-amazon { background: #fff8e1; color: #b45309; }
.chip-flipkart { background: #e8f4fd; color: #1d4ed8; }
.chip-meesho { background: #fdf2f8; color: #9d174d; }

/* FORMS */
input[type=text], input[type=date], input[type=number], input[type=password], select, textarea {
  width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: 8px;
  font-size: 13px; color: var(--text); background: var(--card); outline: none; transition: border .15s;
}
input:focus, select:focus, textarea:focus { border-color: var(--accent); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
.filter-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: flex-end; }
.filter-bar .fg { flex: 1; min-width: 140px; }

/* SCANNER */
.scanner-box { background: var(--deep); border-radius: var(--radius); padding: 28px; text-align: center; margin-bottom: 20px; }
.scanner-box h3 { color: #fff; font-size: 16px; margin-bottom: 8px; }
.scanner-box p { color: rgba(255,255,255,.5); font-size: 12px; margin-bottom: 16px; }
.scan-input { background: rgba(255,255,255,.1); border: 2px solid var(--accent); border-radius: 10px; padding: 14px 18px; color: #fff; font-size: 16px; text-align: center; letter-spacing: .04em; width: 100%; max-width: 400px; outline: none; }
.scan-input:focus { border-color: var(--accent2); }
.scan-input::placeholder { color: rgba(255,255,255,.4); }
.scan-result { margin-top: 14px; min-height: 50px; }

/* PROGRESS */
.progress { background: var(--border); border-radius: 10px; height: 8px; margin-top: 8px; }
.progress-bar { height: 8px; border-radius: 10px; background: var(--accent); transition: width .4s; }

/* TOAST */
#toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.toast { background: var(--deep); color: #fff; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 500; box-shadow: 0 4px 24px rgba(0,0,0,.25); border-left: 4px solid var(--accent); animation: slideIn .3s ease; max-width: 320px; }
.toast.success { border-color: var(--green); }
.toast.error { border-color: var(--red); }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* MODAL */
.modal-overlay { display: flex; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 200; justify-content: center; align-items: center; }
.modal { background: var(--card); border-radius: var(--radius); padding: 28px; max-width: 540px; width: 100%; margin: 16px; max-height: 90vh; overflow-y: auto; }
.modal-title { font-size: 18px; font-weight: 700; color: var(--deep); margin-bottom: 18px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

/* LOGIN */
.login-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg,var(--deep) 0%,var(--mid) 100%); }
.login-card { background: var(--card); border-radius: 20px; padding: 40px 36px; width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
.login-logo { text-align: center; margin-bottom: 28px; }
.login-logo .emoji { font-size: 48px; }
.login-logo h1 { font-size: 22px; font-weight: 800; color: var(--deep); margin-top: 10px; }
.login-logo p { color: var(--muted); font-size: 13px; margin-top: 4px; }
.login-field { margin-bottom: 18px; }
.login-btn { width: 100%; padding: 12px; background: var(--accent); color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: background .15s; margin-top: 8px; }
.login-btn:hover { background: var(--mid); }
.login-error { background: #fef2f2; border: 1px solid var(--red); color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }

/* MISC */
.empty { text-align: center; padding: 48px 24px; color: var(--muted); }
.empty .big { font-size: 40px; margin-bottom: 10px; }
.info-banner { background: #fffbeb; border: 1px solid var(--gold); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 12px; color: #92400e; line-height: 1.5; }
.awb-ref { font-size: 10px; color: var(--gold); font-style: italic; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.flex { display: flex; }
.items-center { align-items: center; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.mt-2 { margin-top: 8px; }
.mb-3 { margin-bottom: 12px; }
.font-bold { font-weight: 700; }
.text-muted { color: var(--muted); }
.text-sm { font-size: 12px; }

@media (max-width: 768px) {
  .sidebar { width: 100%; height: auto; position: relative; }
  .main { margin-left: 0; }
  .form-row { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .grid2 { grid-template-columns: 1fr; }
}

/* ============================================================
   NEW STYLES — v3.5 (Exchange, Fraud, Claims, Parse Log)
   ============================================================ */

/* Exchange & Fraud stat cards */
.stat-card.exchange::before { background: #f59e0b; }
.stat-card.fraud::before    { background: #ef4444; }
.stat-card.exchange { cursor: pointer; }
.stat-card.exchange:hover { box-shadow: 0 4px 24px rgba(245,158,11,.2); transform: translateY(-1px); transition: all .15s; }

/* Exchange & regular order type badges */
.s-exchange { background: #fff8e1; color: #b45309; }
.s-regular  { background: var(--bg); color: var(--muted); }

/* Fraud alert row highlight */
tr.fraud-row { background: #fff1f1 !important; }

/* Nav badge (for fraud count) */
.nav-badge {
  margin-left: auto;
  background: #ef4444;
  color: #fff;
  border-radius: 10px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}

/* Parse log table */
.parse-log {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: auto;
  max-height: 300px;
  font-size: 12px;
}
.parse-log table { width: 100%; border-collapse: collapse; }
.parse-log thead { background: var(--deep); color: #fff; position: sticky; top: 0; }
.parse-log th { padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.parse-log td { padding: 7px 12px; border-bottom: 1px solid var(--border); }
.parse-log tbody tr:last-child td { border-bottom: none; }

/* Claim status badge */
.s-claim-ok      { background: #d1fae5; color: #065f46; }
.s-claim-pending { background: #fef3c7; color: #92400e; }

/* Tab switcher in Payments */
.tab-bar { display: flex; gap: 8px; margin-bottom: 20px; }

/* ============================================================
   v3.6 — Return Type badges, inline selector, scan card
   ============================================================ */

/* ── Return-type pill badges ──────────────────────────────── */
.return-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 11px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: .02em;
}
/* Blue — Customer Return */
.rt-customer {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #93c5fd;
}
/* Orange — RTO */
.rt-rto {
  background: #ffedd5;
  color: #c2410c;
  border: 1px solid #fdba74;
}
/* Grey — type not set yet */
.rt-unknown {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}
/* Large variant shown in the scan confirmation card */
.return-type-badge--lg {
  font-size: 15px;
  padding: 7px 18px;
  border-radius: 24px;
}

/* ── Inline return-type dropdown (table rows) ─────────────── */
.rt-select {
  margin-top: 4px;
  padding: 4px 8px;
  font-size: 11px;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--text);
  cursor: pointer;
  width: 100%;
  max-width: 160px;
}
.rt-select:focus { border-color: var(--accent); outline: none; }
/* Larger variant inside the scan card */
.rt-select--scan {
  font-size: 13px;
  padding: 7px 12px;
  max-width: 220px;
  border-radius: 8px;
}

/* ── Scan confirmation card ───────────────────────────────── */
.return-confirm-card {
  margin-top: 16px;
  background: #1e1047;          /* slightly lighter than scanner-box deep */
  border: 2px solid var(--accent);
  border-radius: 14px;
  padding: 20px 24px;
  text-align: left;
  animation: popIn .2s ease;
}
@keyframes popIn {
  from { transform: scale(.96); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

/* Order summary row inside card */
.rcc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255,255,255,.1);
}
.rcc-orderid {
  font-family: monospace;
  font-size: 13px;
  color: rgba(255,255,255,.6);
}
.rcc-customer {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
.rcc-awb {
  font-size: 11px;
  color: rgba(255,255,255,.45);
}

/* Return-type selection row — the "hero" UI */
.rcc-type-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.rcc-type-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,.5);
  text-transform: uppercase;
  letter-spacing: .06em;
  min-width: 84px;
}

/* Buttons row */
.rcc-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
