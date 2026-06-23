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
  function importPaymentExcel(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        let added = 0;
        data.forEach((row) => {
          const orderId = String(row['Order ID'] || row['order_id'] || row['OrderID'] || '').trim();
          const awb     = String(row['AWB'] || row['Tracking'] || '').trim();
          if (!orderId && !awb) return;
          if (!db.payments.find((p) => p.orderId === orderId)) {
            db.payments.push({
              id: genId(), orderId, awb,
              settlement: parseFloat(row['Settlement'] || row['Settlement Amount'] || row['Net Settlement'] || 0),
              gst:        parseFloat(row['GST'] || row['Tax'] || 0),
              date:       row['Date'] || row['Settlement Date'] || '',
              status:     row['Status'] || 'Received',
              reconciled: true,
            });
            const o = db.orders.find((x) => x.orderId === orderId || x.awb === awb || x.invoice === awb);
            if (o) o.reconciled = true;
            added++;
          }
        });
        setDb({ ...db });
        setImportStatus(`✅ Imported ${added} payment record(s)`);
        toast(`${added} payment records imported`, 'success');
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Feature 3: Claim Payment Excel import ───────────────────
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
          const awb         = String(row['AWB'] || row['AWB Number'] || row['Tracking'] || '').trim();
          const claimAmount = parseFloat(
            row['Claim Amount'] || row['claim_amount'] || row['ClaimAmount'] || row['Amount'] || 0
          );
          const reason      = String(row['Reason'] || row['Notes'] || '').trim();
          const claimDate   = String(row['Date'] || row['Claim Date'] || '').trim();

          if (!orderId && !awb) return;
          if (!claimAmount || isNaN(claimAmount)) return;

          // Match order by Order ID or AWB / Invoice
          const order = db.orders.find(
            (o) => !o.deleted &&
              ((orderId && o.orderId === orderId) ||
               (awb && (o.awb === awb || o.invoice === awb)))
          );

          if (order) {
            order.claimAmount = claimAmount;
            order.claimReason = reason;
            order.claimDate   = claimDate;
            order.claimStatus = 'Received';
            matched++;
          } else {
            notFoundIds.push(orderId || awb);
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
      pd: db.payments.find((p) => p.orderId === o.orderId || p.awb === o.awb || p.awb === o.invoice),
    }))
    .filter((o) => {
      if (q && !`${o.orderId} ${o.awb || ''} ${o.invoice || ''}`.toLowerCase().includes(q)) return false;
      if (fRecon === 'yes' && !o.pd) return false;
      if (fRecon === 'no'  &&  o.pd) return false;
      return true;
    });

  // Claim rows: orders with negative balance or a claimAmount
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === 'reconcile' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('reconcile')}
        >
          💰 Payment Reconciliation
        </button>
        <button
          className={`btn ${activeTab === 'claims' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('claims')}
        >
          🧾 Claim Payments
          {claimRows.length > 0 && (
            <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
              {claimRows.length}
            </span>
          )}
        </button>
      </div>

      {/* ── RECONCILIATION TAB ── */}
      {activeTab === 'reconcile' && (
        <>
          <div className="card">
            <div className="card-title">💰 Import Payment / Settlement Excel</div>
            <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
              <div className="ico-big">💳</div>
              <p><strong>Click to upload</strong> Master Template Excel</p>
              <p>Columns: Order ID, AWB, Settlement Amount, GST, Date</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => importPaymentExcel(e.target.files[0])} />
            </div>
            {importStatus && (
              <div style={{ color: 'var(--green)', fontWeight: 600, marginTop: 8 }}>{importStatus}</div>
            )}
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadTemplate('payments')}>
                ⬇ Download Template
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">📋 Payment Reconciliation</div>
            <div className="filter-bar">
              <div className="fg"><label>Search</label>
                <input type="text" placeholder="Order ID or AWB…" value={search}
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
                    <th>Order ID</th><th>AWB / Ref</th><th>Customer</th><th>Channel</th>
                    <th>Order Amt</th><th>Settlement</th><th>GST</th><th>Claim Amt</th><th>Reconciled</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={10}><div className="empty">No payment data. Import settlement Excel above.</div></td></tr>
                  ) : (
                    rows.map((o) => (
                      <tr key={o.id}>
                        <td className="truncate" title={o.orderId}>{o.orderId}</td>
                        <td>{o.awb || '—'}</td>
                        <td>{o.customer}</td>
                        <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                        <td style={{ color: (o.amount || 0) < 0 ? 'var(--red)' : '' }}>
                          ₹{(o.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td>{o.pd ? `₹${o.pd.settlement.toLocaleString('en-IN')}` : <span className="text-muted">—</span>}</td>
                        <td>{o.pd ? `₹${o.pd.gst}` : '—'}</td>
                        {/* Feature 3: Claim amount column */}
                        <td>
                          {o.claimAmount
                            ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>₹{o.claimAmount.toLocaleString('en-IN')}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>{o.pd
                          ? <span className="status s-dispatched">✓ Yes</span>
                          : <span className="status s-ready">Pending</span>}
                        </td>
                        <td>{o.pd?.date || o.orderDate || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── CLAIM PAYMENTS TAB (Feature 3) ── */}
      {activeTab === 'claims' && (
        <>
          <div className="card">
            <div className="card-title">🧾 Upload Claim Amounts (Marketplace Reimbursements)</div>
            <div className="info-banner">
              <strong>ℹ️ How it works:</strong> When a marketplace reimburses you for a damaged/wrong item return,
              upload the Excel file with <strong>Order ID / AWB</strong> and <strong>Claim Amount</strong>.
              The system will match and offset the negative return balance.
            </div>
            <div className="upload-zone" onClick={() => claimInputRef.current?.click()}>
              <div className="ico-big">📤</div>
              <p><strong>Click to upload</strong> Claim Reimbursement Excel</p>
              <p>Columns: Order ID, AWB, Claim Amount, Reason, Date</p>
              <input ref={claimInputRef} type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => importClaimExcel(e.target.files[0])} />
            </div>
            {claimStatus && (
              <div style={{ fontWeight: 600, marginTop: 10, color: claimStatus.includes('⚠️') ? '#92400e' : 'var(--green)' }}>
                {claimStatus}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadTemplate('claims')}>
                ⬇ Download Claim Template
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">📋 Return / Claim Ledger</div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Orders with negative balances (returns) and their claim offsets. Net Balance = Order Amt + Claim Amt.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th><th>Customer</th><th>Channel</th><th>AWB</th>
                    <th>Order Amt</th><th>Claim Amt</th><th>Net Balance</th><th>Claim Status</th><th>Claim Date</th><th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {claimRows.length === 0 ? (
                    <tr>
                      <td colSpan={10}>
                        <div className="empty">
                          <div className="big">🧾</div>
                          No claim or negative entries yet.<br />
                          <span style={{ fontSize: 12 }}>Upload a Claim Excel above, or negative returns will appear here automatically.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    claimRows.map((o) => (
                      <tr key={o.id}>
                        <td className="truncate" title={o.orderId}>{o.orderId}</td>
                        <td>{o.customer}</td>
                        <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                        <td>{o.awb || '—'}</td>
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
