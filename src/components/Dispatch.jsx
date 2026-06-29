import { useState, useRef, useCallback } from 'react';
import { toast } from './Toast.jsx';
import { COMPANIES } from '../db.js';

// ── Sound feedback using Web Audio API (no external files needed) ──────────
function playBeep(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'success') {
      // Two ascending tones — pleasant "ding ding"
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'warn') {
      // Single mid tone — "already dispatched" warning
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
      // Two descending low tones — error buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
    // Clean up after playback
    setTimeout(() => ctx.close(), 600);
  } catch (_) {
    // Silently ignore if AudioContext unavailable
  }
}

// Today's date string for daily courier count reset
function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export default function Dispatch({ db, setDb }) {
  const [scanValue, setScanValue] = useState('');
  const [result,    setResult]    = useState(null);
  const [fCompany,  setFCompany]  = useState('');
  const inputRef = useRef();

  // ── Flexible AWB/Order matching ──────────────────────────────
  // Normalises the scanned value before comparing so barcode-scanner
  // quirks (extra spaces, mixed case, leading zeros) never cause a miss.
  function normalise(s) {
    return (s || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function findOrder(q) {
    // Strip "AWB#" or "AWB " prefix that Amazon DELHIVERY labels emit when scanned
    const stripped = q.replace(/^AWB#?\s*/i, '').trim();
    const nq = normalise(stripped);
    const nqOrig = normalise(q);
    // 1. Exact AWB match — try stripped first, then original
    let o = db.orders.find((x) => !x.deleted && (normalise(x.awb) === nq || normalise(x.awb) === nqOrig));
    if (o) return o;
    // 2. Order ID match
    o = db.orders.find((x) => !x.deleted && (normalise(x.orderId) === nq || normalise(x.orderId) === nqOrig));
    if (o) return o;
    // 3. Invoice match
    o = db.orders.find((x) => !x.deleted && (normalise(x.invoice) === nq || normalise(x.invoice) === nqOrig));
    if (o) return o;
    // 4. Partial AWB match — last 10 digits (for scanners that drop prefix)
    if (nq.length >= 10) {
      const tail = nq.slice(-10);
      o = db.orders.find((x) => !x.deleted && x.awb && normalise(x.awb).endsWith(tail));
      if (o) return o;
    }
    return null;
  }

  function processDispatch() {
    const q = scanValue.trim();
    if (!q) return;
    const order = findOrder(q);
    if (!order) {
      setResult({ ok: false, msg: `❌ "${q}" not found. Try Order ID or Invoice Ref (IN-xxx).` });
      playBeep('error');
      return;
    }
    if (order.status === 'Dispatched') {
      setResult({ ok: 'warn', msg: `⚠️ Already dispatched: ${order.orderId}` });
      playBeep('warn');
      return;
    }
    // If scanning a real AWB for an Amazon order that has only an invoice ref
    // Supports: plain digits (ATSPL SUR labels) and AWB# prefix (ATSPL_DELHIVERY labels)
    const cleanQ = q.replace(/^AWB#?\s*/i, '').trim();
    if (order.channel === 'Amazon' && order.awb && order.awb.startsWith('IN-') && /^\d{10,16}$/.test(cleanQ)) {
      order.awb = cleanQ;
    }
    order.status = 'Dispatched';
    order.dispatchedAt = new Date().toISOString();
    setDb({ ...db });
    setResult({ ok: true, msg: `✅ Dispatched! ${order.orderId} | ${order.customer} | ${order.channel} | ${order.company || 'Unknown'}` });
    setScanValue('');
    inputRef.current?.focus();
    toast(`Order ${order.orderId} dispatched`, 'success');
    playBeep('success');
  }

  const dispatched = db.orders.filter((o) => o.status === 'Dispatched' && !o.deleted)
    .filter((o) => !fCompany || (o.company || 'Unknown') === fCompany)
    .slice().reverse();

  // ── Today's courier-wise dispatch count (resets each day) ─────
  const today = todayStr();
  const todayOrders = db.orders.filter(
    (o) => o.status === 'Dispatched' && !o.deleted &&
    o.dispatchedAt && o.dispatchedAt.startsWith(today)
  );

  // Build courier breakdown for today's dispatches
  const todayCourierMap = {};
  for (const o of todayOrders) {
    const courier = o.courier || (
      o.awb
        ? /^SF\d{8,13}FPL$/i.test(o.awb) ? 'Shadowfax'
        : /^SF\d+$/i.test(o.awb) ? 'Shadowfax'
        : /^1490\d{12}$/.test(o.awb) ? 'Delhivery'   // Meesho Delhivery 16-digit — check BEFORE FM/Ekart
        : /^\d{13,18}$/.test(o.awb) ? 'Delhivery'
        : /^(?:FMPP|FMPC|FM[A-Z])/i.test(o.awb) ? 'Ekart'  // Ekart: FMPP/FMPC/FMxx only, never raw FM on Delhivery
        : 'Other'
        : 'Unknown'
    );
    todayCourierMap[courier] = (todayCourierMap[courier] || 0) + 1;
  }

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
        {/* Today's courier-wise dispatch summary */}
        <div className="info-banner" style={{ marginBottom: 8, background: '#f0fdf4', borderColor: '#86efac' }}>
          <strong>📦 இன்றைய Courier Count ({today}):</strong>{' '}
          {Object.keys(todayCourierMap).length === 0
            ? <span style={{ color: 'var(--muted)' }}>இன்று எந்த dispatch-உம் இல்லை</span>
            : Object.entries(todayCourierMap).map(([courier, count], i) => (
              <span key={courier}>
                {i > 0 && ' | '}
                <strong>{courier}</strong>: {count} parcels
              </span>
            ))
          }
          {todayOrders.length > 0 && (
            <span style={{ marginLeft: 12, color: 'var(--muted)' }}>
              (மொத்தம்: {todayOrders.length})
            </span>
          )}
        </div>

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
