import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { genId } from '../db.js';
import { toast } from './Toast.jsx';

export default function Payments({ db, setDb }) {
  const [importStatus, setImportStatus] = useState('');
  const [search,       setSearch]       = useState('');
  const [fRecon,       setFRecon]       = useState('');
  const [activeTab,    setActiveTab]    = useState('reconcile');
  const fileInputRef = useRef();

  // ── Payment import ───────────────────────────────────────────
  // Columns: Order ID, Settlement Amount, GST %, Date
  // Only matches orders already in Sales Entry (db.orders)
  function importPaymentExcel(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(
          wb.Sheets[wb.SheetNames[0]], { defval: '' }
        );
        let added = 0, skipped = 0, notInSales = 0;

        data.forEach((row) => {
          // Order ID column
          const orderId = String(
            row['Order ID'] || row['order_id'] || row['OrderID'] ||
            row['Suborder Number'] || row['Sub Order No'] || ''
          ).trim();
          if (!orderId) return;

          // Must exist in Sales Entry
          // Supports all 3 platforms:
          // Meesho:   "302865490123306432_1" or "302865490123306432"
          // Amazon:   "403-1234567-8901234"
          // Flipkart: "OD123456789012345678"
          const normalise = (id) => (id || '').trim().toLowerCase();
          const nOid = normalise(orderId);
          const salesOrder = db.orders.find((o) => {
            if (o.deleted) return false;
            const nOrder = normalise(o.orderId);
            // Exact match
            if (nOrder === nOid) return true;
            // Meesho: match with or without _1 suffix
            if (nOid.includes('_') && nOrder === nOid.split('_')[0]) return true;
            if (nOrder.includes('_') && nOrder.split('_')[0] === nOid) return true;
            // Amazon: match ignoring hyphens
            if (nOrder.replace(/-/g, '') === nOid.replace(/-/g, '')) return true;
            return false;
          });
          if (!salesOrder) { notInSales++; return; }

          // Skip duplicate payment
          if (db.payments.find((p) => p.orderId === orderId)) {
            skipped++;
            return;
          }

          const settlement = parseFloat(
            row['Settlement Amount'] || row['Settlement'] ||
            row['Net Settlement']   || row['Amount'] || 0
          );
          const gstPct    = parseFloat(
            row['GST %'] || row['GST Percent'] || row['GST'] ||
            row['Tax %'] || row['Tax'] || 0
          );
          // Auto-deduct GST from settlement
          const gstAmount = gstPct > 0
            ? parseFloat(((settlement * gstPct) / (100 + gstPct)).toFixed(2))
            : 0;
          const netAmount = parseFloat((settlement - gstAmount).toFixed(2));

          db.payments.push({
            id: genId(), orderId,
            settlement, gstPct, gstAmount, netAmount,
            date:       String(row['Date'] || row['Settlement Date'] || '').trim(),
            status:     'Received',
            reconciled: true,
          });

          // Mark order reconciled
          salesOrder.reconciled  = true;
          salesOrder.netReceived = netAmount;
          added++;
        });

        setDb({ ...db });
        const msgs = [`✅ ${added} payments imported`];
        if (skipped    > 0) msgs.push(`${skipped} already exist`);
        if (notInSales > 0) msgs.push(`${notInSales} not in Sales Entry (skipped)`);
        setImportStatus(msgs.join(' | '));
        toast(`${added} payment records imported`, added > 0 ? 'success' : 'info');
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Derived: monthly summary ─────────────────────────────────
  const monthlySummary = (() => {
    const map = {};
    (db.payments || []).forEach((p) => {
      const month = (p.date || '').slice(0, 7) || 'Unknown';
      if (!map[month]) map[month] = { count: 0, settlement: 0, gstAmount: 0, netAmount: 0 };
      map[month].count++;
      map[month].settlement += p.settlement  || 0;
      map[month].gstAmount  += p.gstAmount   || 0;
      map[month].netAmount  += p.netAmount   || 0;
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  // ── Reconciliation rows ──────────────────────────────────────
  const q = search.toLowerCase();
  const rows = (db.orders || [])
    .filter((o) => !o.deleted)
    .map((o) => ({
      ...o,
      pd: (db.payments || []).find((p) => p.orderId === o.orderId),
    }))
    .filter((o) => {
      if (q && !`${o.orderId} ${o.customer || ''}`.toLowerCase().includes(q)) return false;
      if (fRecon === 'yes' && !o.pd) return false;
      if (fRecon === 'no'  &&  o.pd) return false;
      return true;
    });

  const fmt = (n) =>
    (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const grandSettlement = monthlySummary.reduce((a, [, s]) => a + s.settlement, 0);
  const grandGst        = monthlySummary.reduce((a, [, s]) => a + s.gstAmount,  0);
  const grandNet        = monthlySummary.reduce((a, [, s]) => a + s.netAmount,  0);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'reconcile' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('reconcile')}
        >
          💰 Reconciliation
        </button>
        <button
          className={`btn ${activeTab === 'monthly' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('monthly')}
        >
          📅 Monthly Report
        </button>
      </div>

      {/* ── RECONCILIATION TAB ── */}
      {activeTab === 'reconcile' && (
        <div>
          {/* Upload card */}
          <div className="card">
            <div className="card-title">💰 Import Settlement Excel</div>
            <div className="info-banner">
              Columns: <strong>Order ID</strong> · <strong>Settlement Amount</strong> · <strong>GST %</strong> · Date<br />
              Sales Entry-ல் இல்லாத Order ID automatically skip ஆகும்.
            </div>
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              <div className="ico-big">💳</div>
              <p><strong>Click to upload</strong> Settlement Excel / CSV</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => importPaymentExcel(e.target.files[0])}
              />
            </div>
            {importStatus && (
              <div style={{ color: 'var(--green)', fontWeight: 600, marginTop: 8 }}>
                {importStatus}
              </div>
            )}
          </div>

          {/* Table card */}
          <div className="card">
            <div className="card-title">📋 Payment Reconciliation</div>
            <div className="filter-bar">
              <div className="fg">
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Order ID or Customer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="fg">
                <label>Status</label>
                <select value={fRecon} onChange={(e) => setFRecon(e.target.value)}>
                  <option value="">All</option>
                  <option value="yes">Reconciled</option>
                  <option value="no">Pending</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Channel</th>
                    <th>Order Amt</th>
                    <th>Settlement</th>
                    <th>GST %</th>
                    <th>GST Amt</th>
                    <th>Net Received</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10}>
                        <div className="empty">
                          No payment data. Import settlement Excel above.
                        </div>
                      </td>
                    </tr>
                  ) : rows.map((o) => (
                    <tr key={o.id}>
                      <td className="truncate" title={o.orderId}>{o.orderId}</td>
                      <td>{o.customer}</td>
                      <td>
                        <span className={`chip chip-${(o.channel || '').toLowerCase()}`}>
                          {o.channel}
                        </span>
                      </td>
                      <td style={{ color: (o.amount || 0) < 0 ? 'var(--red)' : '' }}>
                        ₹{(o.amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td>
                        {o.pd
                          ? `₹${fmt(o.pd.settlement)}`
                          : <span className="text-muted">—</span>}
                      </td>
                      <td>{o.pd ? `${o.pd.gstPct || 0}%` : '—'}</td>
                      <td style={{ color: 'var(--red)' }}>
                        {o.pd ? `₹${fmt(o.pd.gstAmount)}` : '—'}
                      </td>
                      <td style={{ color: 'var(--green)', fontWeight: 600 }}>
                        {o.pd
                          ? `₹${fmt(o.pd.netAmount)}`
                          : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {o.pd
                          ? <span className="status s-dispatched">✓ Reconciled</span>
                          : <span className="status s-ready">Pending</span>}
                      </td>
                      <td>{o.pd ? o.pd.date || '—' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MONTHLY REPORT TAB ── */}
      {activeTab === 'monthly' && (
        <div className="card">
          <div className="card-title">📅 Monthly Payment Report</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            Settlement → GST deducted → Net Received (மாதம் வாரியாக)
          </p>
          {monthlySummary.length === 0 ? (
            <div className="empty">
              <div className="big">📅</div>
              Payment data இல்லை. Reconciliation tab-ல் import பண்ணுங்கள்.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Orders</th>
                    <th>Total Settlement</th>
                    <th>GST Deducted</th>
                    <th>Net Received</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map(([month, s]) => (
                    <tr key={month}>
                      <td style={{ fontWeight: 600 }}>{month}</td>
                      <td>{s.count}</td>
                      <td>₹{fmt(s.settlement)}</td>
                      <td style={{ color: 'var(--red)' }}>− ₹{fmt(s.gstAmount)}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 700, fontSize: 15 }}>
                        ₹{fmt(s.netAmount)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg-alt,#f9fafb)', fontWeight: 700, borderTop: '2px solid var(--border,#e5e7eb)' }}>
                    <td>Grand Total</td>
                    <td>{monthlySummary.reduce((a, [, s]) => a + s.count, 0)}</td>
                    <td>₹{fmt(grandSettlement)}</td>
                    <td style={{ color: 'var(--red)' }}>− ₹{fmt(grandGst)}</td>
                    <td style={{ color: 'var(--green)', fontSize: 16 }}>₹{fmt(grandNet)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
