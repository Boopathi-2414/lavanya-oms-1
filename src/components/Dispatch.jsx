import { useState, useRef } from 'react';
import { toast } from './Toast.jsx';
import { COMPANIES } from '../db.js';

export default function Dispatch({ db, setDb }) {
  const [scanValue, setScanValue] = useState('');
  const [result,    setResult]    = useState(null);
  const [fCompany,  setFCompany]  = useState(''); // Feature 5: segregate dispatch view by company
  const inputRef = useRef();

  function findOrder(q) {
    return db.orders.find((o) => !o.deleted && (o.awb === q || o.orderId === q || o.invoice === q));
  }

  function processDispatch() {
    const q = scanValue.trim();
    if (!q) return;
    const order = findOrder(q);
    if (!order) {
      setResult({ ok: false, msg: `❌ "${q}" not found. Try Order ID or Invoice Ref (IN-xxx).` });
      return;
    }
    if (order.status === 'Dispatched') {
      setResult({ ok: 'warn', msg: `⚠️ Already dispatched: ${order.orderId}` });
      return;
    }
    // If scanning a real AWB for an Amazon order that has only an invoice ref
    if (order.channel === 'Amazon' && order.awb && order.awb.startsWith('IN-') && /^\d{10,16}$/.test(q)) {
      order.awb = q;
    }
    order.status = 'Dispatched';
    order.dispatchedAt = new Date().toISOString();
    setDb({ ...db });
    setResult({ ok: true, msg: `✅ Dispatched! ${order.orderId} | ${order.customer} | ${order.channel} | ${order.company || 'Unknown'}` });
    setScanValue('');
    inputRef.current?.focus();
    toast(`Order ${order.orderId} dispatched`, 'success');
  }

  const dispatched = db.orders.filter((o) => o.status === 'Dispatched' && !o.deleted)
    .filter((o) => !fCompany || (o.company || 'Unknown') === fCompany)
    .slice().reverse();

  // Feature 5: auto-dispatch segregation — counts always reflect exactly
  // the company filter selected above, never mixed across companies.
  const dispatchedCompanyCounts = [...COMPANIES.map((c) => c.name), 'Unknown'].map((name) => ({
    name,
    count: db.orders.filter((o) => o.status === 'Dispatched' && !o.deleted && (o.company || 'Unknown') === name).length,
  }));

  return (
    <div>
      <div className="scanner-box">
        <h3>🔍 Scan AWB to Dispatch</h3>
        <p>Scan the barcode on the label or type AWB / Order ID / Invoice Ref (IN-xxx)</p>
        <input
          ref={inputRef}
          className="scan-input"
          type="text"
          placeholder="Scan or type AWB / Order ID…"
          value={scanValue}
          onChange={(e) => setScanValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && processDispatch()}
          autoFocus
        />
        <div className="mt-2">
          <button className="btn btn-success" onClick={processDispatch}>Mark as Dispatched</button>
        </div>
        <div className="scan-result">
          {result && (
            <div style={{ fontWeight: 600, marginTop: 8,
              color: result.ok === true ? 'var(--green)' : result.ok === 'warn' ? 'var(--gold)' : 'var(--red)' }}>
              {result.msg}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>🚀 Dispatched Orders</div>
          <div style={{ flex: 1 }} />
          <div className="fg" style={{ marginBottom: 0 }}><label>Company</label>
            <select value={fCompany} onChange={(e) => setFCompany(e.target.value)}>
              <option value="">All</option>
              {COMPANIES.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>

        {/* Feature 5: auto-dispatch segregation summary */}
        <div className="info-banner" style={{ marginBottom: 12 }}>
          <strong>🏢 Dispatched by Company:</strong>{' '}
          {dispatchedCompanyCounts.map((c, i) => (
            <span key={c.name}>
              {i > 0 && ' | '}
              {c.name}: {c.count} Order{c.count === 1 ? '' : 's'}
            </span>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th><th>Customer</th><th>Channel</th><th>Company</th><th>AWB</th>
                <th>SKU</th><th>Payment</th><th>Amount</th><th>Dispatched At</th>
              </tr>
            </thead>
            <tbody>
              {dispatched.length === 0 ? (
                <tr><td colSpan={9}><div className="empty">No dispatched orders yet.</div></td></tr>
              ) : (
                dispatched.map((o) => (
                  <tr key={o.id}>
                    <td className="truncate" title={o.orderId}>{o.orderId}</td>
                    <td>{o.customer}</td>
                    <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                    <td>
                      <span className="chip" style={{ background: '#eef2ff', color: '#3730a3' }}>
                        {o.company || 'Unknown'}
                      </span>
                    </td>
                    <td>{o.awb || '—'}</td>
                    <td className="truncate" title={o.sku}>{o.sku || '—'}</td>
                    <td><span className={`status ${o.payment === 'COD' ? 's-cod' : 's-prepaid'}`}>{o.payment}</span></td>
                    <td>₹{(o.amount || 0).toLocaleString('en-IN')}</td>
                    <td>{o.dispatchedAt ? new Date(o.dispatchedAt).toLocaleString('en-IN') : '—'}</td>
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
