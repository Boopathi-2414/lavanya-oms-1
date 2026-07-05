import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { genId, downloadTemplate } from '../db.js';
import { toast } from './Toast.jsx';

export default function Payments({ db, setDb }) {
  const [importStatus,  setImportStatus]  = useState('');
  const [claimStatus,   setClaimStatus]   = useState('');
  const [search,        setSearch]        = useState('');
  const [fRecon,        setFRecon]        = useState('');
  const [activeTab,     setActiveTab]     = useState('reconcile'); // 'reconcile' | 'claims'
  const fileInputRef   = useRef();
  const claimInputRef  = useRef();

  // ── Standard payment import ──────────────────────────────────
  // Columns needed: Order ID, Settlement Amount, GST %
  // GST auto-deducted: Net = Settlement - (Settlement * GST% / 100)
  function importPaymentExcel(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        let added = 0;
        data.forEach((row) => {
          // Order ID — required
          const orderId = String(
            row['Order ID'] || row['order_id'] || row['OrderID'] ||
            row['Suborder Number'] || row['Sub Order No'] || ''
          ).trim();
          if (!orderId) return;

          // Settlement Amount
          const settlement = parseFloat(
            row['Settlement Amount'] || row['Settlement'] ||
            row['Net Settlement'] || row['Amount'] || 0
          );

          // GST % (e.g. 18 means 18%)
          const gstPct = parseFloat(
            row['GST %'] || row['GST Percent'] || row['GST'] ||
            row['Tax %'] || row['Tax'] || 0
          );

          // Auto-calculate GST amount and net amount
          const gstAmount = gstPct > 0 ? parseFloat(((settlement * gstPct) / (100 + gstPct)).toFixed(2)) : 0;
          const netAmount = parseFloat((settlement - gstAmount).toFixed(2));

          // Skip duplicate
          if (db.payments.find((p) => p.orderId === orderId)) return;

          db.payments.push({
            id: genId(),
            orderId,
            settlement,
            gstPct,
            gstAmount,
            netAmount,           // settlement minus GST
            date:   String(row['Date'] || row['Settlement Date'] || '').trim(),
            status: String(row['Status'] || 'Received').trim(),
            reconciled: true,
          });

          // Mark order as reconciled
          const o = db.orders.find((x) => x.orderId === orderId);
          if (o) {
            o.reconciled  = true;
            o.netReceived = netAmount;
          }
          added++;
        });
        setDb({ ...db });
        setImportStatus(`✅ Imported ${added} payment record(s)`);
        toast(`${added} payment records imported`, 'success');
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Claim Payment Excel import ───────────────────────────────
  function importClaimExcel(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        let matched = 0, notFound = 0;
        const notFoundIds = [];

        data.forEach((row) => {
          const orderId     = String(row['Order ID'] || row['order_id'] || row['OrderID'] || '').trim();
          const claimAmount = parseFloat(
            row['Claim Amount'] || row['claim_amount'] || row['ClaimAmount'] || row['Amount'] || 0
          );
          const reason    = String(row['Reason'] || row['Notes'] || '').trim();
          const claimDate = String(row['Date'] || row['Claim Date'] || '').trim();

          if (!orderId || !claimAmount || isNaN(claimAmount)) return;

          const order = db.orders.find((o) => !o.deleted && o.orderId === orderId);
          if (order) {
            order.claimAmount = claimAmount;
            order.claimReason = reason;
            order.claimDate   = claimDate;
            order.claimStatus = 'Received';
            matched++;
          } else {
            notFoundIds.push(orderId);
            notFound++;
          }
        });

        setDb({ ...db });
        let msg = `✅ Claim amounts applied to ${matched} order(s)`;
        if (notFound > 0) msg += `. ⚠️ ${notFound} not matched: ${notFoundIds.slice(0, 5).join(', ')}${notFoundIds.length > 5 ? '…' : ''}`;
        setClaimStatus(msg);
        toast(`Claims applied: ${matched} matched`, matched > 0 ? 'success' : 'info');
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    if (claimInputRef.current) claimInputRef.current.value = '';
  }

  const q = search.toLowerCase();
  const rows = db.orders
    .filter((o) => !o.deleted)
    .map((o) => ({
      ...o,
      pd: db.payments.find((p) => p.orderId === o.orderId),
    }))
    .filter((o) => {
      if (q && !`${o.orderId} ${o.customer || ''}`.toLowerCase().includes(q)) return false;
      if (fRecon === 'yes' && !o.pd) return false;
      if (fRecon === 'no'  &&  o.pd) return false;
      return true;
    });

  // Monthly summary — group payments by month
  const monthlySummary = (() => {
    const map = {};
    db.payments.forEach((p) => {
      const month = p.date ? p.date.slice(0, 7) : 'Unknown';
      if (!map[month]) map[month] = { settlement: 0, gstAmount: 0, netAmount: 0, count: 0 };
      map[month].settlement += p.settlement || 0;
      map[month].gstAmount  += p.gstAmount  || 0;
      map[month].netAmount  += p.netAmount  || 0;
      map[month].count++;
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  const claimRows = db.orders
    .filter((o) => !o.deleted)
    .filter((o) => (o.amount < 0) || o.claimAmount)
    .map((o) => ({
      ...o,
      netBalance: (o.amount || 0) + (o.claimAmount || 0),
    }));

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'reconcile', label: '💰 Payment Reconciliation' },
          { key: 'monthly',   label: '📅 Monthly Report' },
          { key: 'claims',    label: `🧾 Claim Payments${claimRows.length > 0 ? ` (${claimRows.length})` : ''}` },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`btn ${activeTab === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── RECONCILIATION TAB ── */}
      {activeTab === 'reconcile' && (
        <>
          <div className="card">
            <div className="card-title">💰 Import Payment / Settlement Excel</div>
            <div className="info-banner">
              Columns needed: <strong>Order ID</strong>, <strong>Settlement Amount</strong>, <strong>GST %</strong>, Date (optional).<br />
              GST will be auto-deducted from Settlement Amount to show Net Received.
            </div>
            <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
              <div className="ico-big">💳</div>
              <p><strong>Click to upload</strong> Settlement Excel / CSV</p>
              <p>Columns: Order ID · Settlement Amount · GST % · Date</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => importPaymentExcel(e.target.files[0])} />
            </div>
            {importStatus && (
              <div style={{ color: 'var(--green)', fontWeight: 600, marginTop: 8 }}>{importStatus}</div>
            )}
          </div>

          <div className="card">
            <div className="card-title">📋 Payment Reconciliation</div>
            <div className="filter-bar">
              <div className="fg"><label>Search</label>
                <input type="text" placeholder="Order ID or Customer…" value={search}
                  onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="fg"><label>Reconciled</label>
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
                    <th>Claim Amt</th>
                    <th>Reconciled</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={11}><div className="empty">No payment data. Import settlement Excel above.</div></td></tr>
                  ) : (
                    rows.map((o) => (
                      <tr key={o.id}>
                        <td className="truncate" title={o.orderId}>{o.orderId}</td>
                        <td>{o.customer}</td>
                        <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                        <td style={{ color: (o.amount || 0) < 0 ? 'var(--red)' : '' }}>
                          ₹{(o.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td>{o.pd ? `₹${o.pd.settlement.toLocaleString('en-IN')}` : <span className="text-muted">—</span>}</td>
                        <td>{o.pd ? `${o.pd.gstPct || 0}%` : '—'}</td>
                        <td style={{ color: 'var(--red)' }}>{o.pd ? `₹${o.pd.gstAmount}` : '—'}</td>
                        <td style={{ color: 'var(--green)', fontWeight: 600 }}>
                          {o.pd ? `₹${o.pd.netAmount.toLocaleString('en-IN')}` : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {o.claimAmount
                            ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>₹{o.claimAmount.toLocaleString('en-IN')}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>{o.pd
                          ? <span className="status s-dispatched">✓ Yes</span>
                          : <span className="status s-ready">Pending</span>}
                        </td>
                        <td>{o.pd?.date || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── MONTHLY REPORT TAB ── */}
      {activeTab === 'monthly' && (
        <div className="card">
          <div className="card-title">📅 Monthly Payment Report</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            Settlement → GST deducted → Net Received per month.
          </p>
          {monthlySummary.length === 0 ? (
            <div className="empty">No payment data yet. Import settlement Excel in Reconciliation tab.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Orders</th>
                    <th>Total Settlement</th>
                    <th>Total GST Deducted</th>
                    <th>Net Received</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map(([month, s]) => (
                    <tr key={month}>
                      <td style={{ fontWeight: 600 }}>{month}</td>
                      <td>{s.count}</td>
                      <td>₹{s.settlement.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ color: 'var(--red)' }}>
                        − ₹{s.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: 'var(--green)', fontWeight: 700, fontSize: 15 }}>
                        ₹{s.netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {/* Grand Total row */}
                  <tr style={{ background: 'var(--bg-alt, #f9fafb)', fontWeight: 700 }}>
                    <td>Grand Total</td>
                    <td>{monthlySummary.reduce((a, [, s]) => a + s.count, 0)}</td>
                    <td>₹{monthlySummary.reduce((a, [, s]) => a + s.settlement, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style={{ color: 'var(--red)' }}>
                      − ₹{monthlySummary.reduce((a, [, s]) => a + s.gstAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ color: 'var(--green)', fontSize: 16 }}>
                      ₹{monthlySummary.reduce((a, [, s]) => a + s.netAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CLAIM PAYMENTS TAB ── */}
      {activeTab === 'claims' && (
        <>
          <div className="card">
            <div className="card-title">🧾 Upload Claim Amounts</div>
            <div className="upload-zone" onClick={() => claimInputRef.current?.click()}>
              <div className="ico-big">📤</div>
              <p><strong>Click to upload</strong> Claim Reimbursement Excel</p>
              <p>Columns: Order ID · Claim Amount · Reason · Date</p>
              <input ref={claimInputRef} type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => importClaimExcel(e.target.files[0])} />
            </div>
            {claimStatus && (
              <div style={{ fontWeight: 600, marginTop: 10, color: claimStatus.includes('⚠️') ? '#92400e' : 'var(--green)' }}>
                {claimStatus}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">📋 Return / Claim Ledger</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th><th>Customer</th><th>Channel</th>
                    <th>Order Amt</th><th>Claim Amt</th><th>Net Balance</th>
                    <th>Claim Status</th><th>Claim Date</th><th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {claimRows.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="empty">
                          <div className="big">🧾</div>
                          No claim entries yet.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    claimRows.map((o) => (
                      <tr key={o.id}>
                        <td className="truncate" title={o.orderId}>{o.orderId}</td>
                        <td>{o.customer}</td>
                        <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                        <td style={{ color: 'var(--red)', fontWeight: 600 }}>₹{(o.amount || 0).toLocaleString('en-IN')}</td>
                        <td style={{ color: 'var(--green)', fontWeight: 600 }}>
                          {o.claimAmount ? `₹${o.claimAmount.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td style={{ fontWeight: 700, color: o.netBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          ₹{o.netBalance.toLocaleString('en-IN')}
                        </td>
                        <td>
                          {o.claimStatus
                            ? <span className="status s-dispatched">✓ {o.claimStatus}</span>
                            : <span className="status s-transit">Pending</span>}
                        </td>
                        <td>{o.claimDate || '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{o.claimReason || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
