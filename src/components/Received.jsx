import { useState, useRef } from 'react';
import { returnTypeClass, returnTypeLabel, RETURN_TYPES } from '../db.js';
import { toast } from './Toast.jsx';

export default function Received({ db, setDb }) {
  const [scanValue, setScanValue] = useState('');
  const [result,    setResult]    = useState(null);   // { ok, order } | { ok: false, msg }
  const [scanType,  setScanType]  = useState('');     // type chosen after scan, before save
  const inputRef = useRef();

  // ── Scan / lookup ────────────────────────────────────────────
  function processReturnReceived() {
    const q = scanValue.trim();
    if (!q) return;
    const order = db.orders.find(
      (o) => !o.deleted && (o.awb === q || o.orderId === q || o.invoice === q)
    );
    if (!order) {
      setResult({ ok: false, msg: `❌ "${q}" not found.` });
      setScanType('');
      return;
    }
    // Show the confirmation card — don't commit yet
    setScanType(order.return_type || '');
    setResult({ ok: true, order });
  }

  // ── Confirm & save ───────────────────────────────────────────
  function confirmReceived() {
    if (!result?.ok) return;
    const order = db.orders.find((o) => o.id === result.order.id);
    if (!order) return;
    order.status       = 'Return Received';
    order.receivedDate = new Date().toISOString();
    if (scanType) order.return_type = scanType;
    setDb({ ...db });
    toast(
      scanType
        ? `Return Received — ${returnTypeLabel(scanType)}`
        : 'Return Received (type not set)',
      'success'
    );
    // Reset scan box for the next barcode
    setResult(null);
    setScanValue('');
    setScanType('');
    inputRef.current?.focus();
  }

  function cancelScan() {
    setResult(null);
    setScanValue('');
    setScanType('');
    inputRef.current?.focus();
  }

  const received = db.orders.filter((o) => o.status === 'Return Received' && !o.deleted);

  // Summary counts for the received list
  const custCount = received.filter((o) => o.return_type === 'Customer Return').length;
  const rtoCount  = received.filter((o) => o.return_type === 'RTO').length;
  const unknCount = received.filter((o) => !o.return_type).length;

  return (
    <div>
      {/* ── Scanner box ── */}
      <div className="scanner-box">
        <h3>📬 Scan AWB to Mark Return Received</h3>
        <p>Scan or type AWB / Order ID / Invoice Ref, then confirm the return type</p>

        <input
          ref={inputRef}
          className="scan-input"
          type="text"
          placeholder="Scan or type AWB / Order ID…"
          value={scanValue}
          onChange={(e) => setScanValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !result?.ok && processReturnReceived()}
          autoFocus
          disabled={result?.ok}   // freeze input while confirmation card is shown
        />

        {!result?.ok && (
          <div className="mt-2">
            <button className="btn btn-primary" onClick={processReturnReceived}>
              Search
            </button>
          </div>
        )}

        <div className="scan-result">
          {/* ── Error state ── */}
          {result && !result.ok && (
            <div style={{ fontWeight: 600, marginTop: 8, color: 'var(--red)' }}>
              {result.msg}
            </div>
          )}

          {/* ── CONFIRMATION CARD — shown immediately after scan ── */}
          {result?.ok && (
            <div className="return-confirm-card">
              {/* Order summary row */}
              <div className="rcc-header">
                <span className="rcc-orderid">#{result.order.orderId}</span>
                <span className="rcc-customer">{result.order.customer}</span>
                <span className={`chip chip-${(result.order.channel || '').toLowerCase()}`}>
                  {result.order.channel}
                </span>
                {result.order.awb && (
                  <span className="rcc-awb">AWB: {result.order.awb}</span>
                )}
              </div>

              {/* ── RETURN TYPE — the hero element ── */}
              <div className="rcc-type-row">
                <span className="rcc-type-label">Return Type</span>
                {/* Live badge updates as soon as you pick from dropdown */}
                <span className={`return-type-badge return-type-badge--lg ${returnTypeClass(scanType)}`}>
                  {returnTypeLabel(scanType || result.order.return_type)}
                </span>
                <select
                  className="rt-select rt-select--scan"
                  value={scanType}
                  onChange={(e) => setScanType(e.target.value)}
                >
                  <option value="">— Select type —</option>
                  {RETURN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Action buttons */}
              <div className="rcc-actions">
                <button className="btn btn-ghost btn-sm" onClick={cancelScan}>✕ Cancel</button>
                <button className="btn btn-success" onClick={confirmReceived}>
                  ✅ Confirm Received
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Received list ── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>✅ Return Received Orders</div>
          {received.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <span className="return-type-badge rt-customer">↩ Customer: {custCount}</span>
              <span className="return-type-badge rt-rto">🚚 RTO: {rtoCount}</span>
              {unknCount > 0 && <span className="return-type-badge rt-unknown">— Unknown: {unknCount}</span>}
            </div>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th><th>Customer</th><th>Channel</th>
                <th>AWB</th><th>SKU</th>
                <th>Return Type</th>
                <th>Received Date</th>
              </tr>
            </thead>
            <tbody>
              {received.length === 0 ? (
                <tr><td colSpan={7}><div className="empty">No return received orders yet.</div></td></tr>
              ) : (
                received.map((o) => (
                  <tr key={o.id}>
                    <td className="truncate" title={o.orderId}>{o.orderId}</td>
                    <td>{o.customer}</td>
                    <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                    <td>{o.awb || '—'}</td>
                    <td className="truncate" title={o.sku}>{o.sku || '—'}</td>
                    {/* ── Return Type badge ── */}
                    <td>
                      <span className={`return-type-badge ${returnTypeClass(o.return_type)}`}>
                        {returnTypeLabel(o.return_type)}
                      </span>
                    </td>
                    <td>{o.receivedDate ? new Date(o.receivedDate).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
