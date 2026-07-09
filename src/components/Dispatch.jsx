import { useState, useRef, useEffect } from 'react';
import { toast } from './Toast.jsx';
import { COMPANIES } from '../db.js';

// ── LOUD Error Beep ────────────────────────────────────────────────────────
// Same sound for any error (not found / already scanned / returned).
// DynamicsCompressor + 3 oscillators → browser-maximum volume.
// Also flashes the screen — noticeable even without looking at a mobile screen.
function playErrorBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume if suspended (mobile browsers require user-gesture unlock)
    ctx.resume().then(() => {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -3;
      compressor.knee.value      = 0;
      compressor.ratio.value     = 20;
      compressor.attack.value    = 0;
      compressor.release.value   = 0.05;
      compressor.connect(ctx.destination);

      // 3 oscillators in unison = louder perceived volume
      [300, 310, 320].forEach((freq) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(compressor);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(140, ctx.currentTime + 0.55);
        gain.gain.setValueAtTime(1.0, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
      });
      setTimeout(() => ctx.close(), 800);
    });
  } catch (_) {}

  // Visual flash — red overlay for 300ms (helps on mobile)
  const flash = document.createElement('div');
  Object.assign(flash.style, {
    position: 'fixed', inset: '0', background: 'rgba(220,38,38,0.35)',
    zIndex: '99999', pointerEvents: 'none', transition: 'opacity 0.2s',
  });
  document.body.appendChild(flash);
  setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 250); }, 200);
}

// Today's date string for daily courier count reset
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dispatch({ db, setDb }) {
  const [scanValue,    setScanValue]    = useState('');
  const [result,       setResult]       = useState(null);
  const [fCompany,     setFCompany]     = useState('');
  const [cameraOpen,   setCameraOpen]   = useState(false);
  const [cameraError,  setCameraError]  = useState('');
  const [dispatchPage, setDispatchPage] = useState(1);
  const DISPATCH_PAGE_SIZE = 50;
  const inputRef    = useRef();
  const videoRef    = useRef();
  const streamRef   = useRef(null);
  const scanLoopRef = useRef(null);

  // ── AWB helpers ──────────────────────────────────────────────
  function normalise(s) {
    return (s || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function extractAwbFromUrl(raw) {
    const s = (raw || '').trim();
    if (!s.startsWith('http')) return s;
    try {
      const url = new URL(s);
      for (const key of ['trackingId', 'awbNo', 'awb', 'tracking_id', 'waybill', 'id']) {
        const v = url.searchParams.get(key);
        if (v && v.trim()) return v.trim().toUpperCase();
      }
      const segments = (url.hash ? url.hash.replace('#', '') : url.pathname)
        .split('/').filter(Boolean);
      if (segments.length) {
        const last = segments[segments.length - 1];
        if (last && last.length >= 8) return last.toUpperCase();
      }
    } catch (_) {}
    return s;
  }

  function findOrder(rawQ) {
    const q       = extractAwbFromUrl(rawQ.trim());
    const stripped = q.replace(/^AWB#?\s*/i, '').trim();
    const nq      = normalise(stripped);
    const nqOrig  = normalise(q);
    let o = db.orders.find((x) => !x.deleted && (normalise(x.awb) === nq || normalise(x.awb) === nqOrig));
    if (o) return o;
    o = db.orders.find((x) => !x.deleted && (normalise(x.orderId) === nq || normalise(x.orderId) === nqOrig));
    if (o) return o;
    o = db.orders.find((x) => !x.deleted && (normalise(x.invoice) === nq || normalise(x.invoice) === nqOrig));
    if (o) return o;
    if (nq.length >= 10) {
      const tail = nq.slice(-10);
      o = db.orders.find((x) => !x.deleted && x.awb && normalise(x.awb).endsWith(tail));
      if (o) return o;
    }
    return null;
  }

  // ── Process dispatch ─────────────────────────────────────────
  function processDispatch(rawOverride) {
    const rawQ = (rawOverride || scanValue).trim();
    if (!rawQ) return;
    const q     = extractAwbFromUrl(rawQ);
    const order = findOrder(rawQ);
    if (!order) {
      setResult({ ok: false, msg: `❌ "${q}" not found. Try Order ID or Invoice Ref (IN-xxx).` });
      playErrorBeep();
      return;
    }
    if (order.status === 'Dispatched') {
      setResult({ ok: 'warn', msg: `⚠️ Already dispatched: ${order.orderId}` });
      playErrorBeep();
      return;
    }
    if (order.status && order.status.includes('Return')) {
      setResult({ ok: 'warn', msg: `⚠️ Return order — cannot dispatch: ${order.orderId}` });
      playErrorBeep();
      return;
    }
    const cleanQ = q.replace(/^AWB#?\s*/i, '').trim();
    if (order.channel === 'Amazon' && order.awb && order.awb.startsWith('IN-') && /^\d{10,16}$/.test(cleanQ)) {
      order.awb = cleanQ;
    }
    order.status      = 'Dispatched';
    order.dispatchedAt = new Date().toISOString();
    setDb({ ...db });
    setResult({ ok: true, msg: `✅ Dispatched! ${order.orderId} | ${order.customer} | ${order.channel} | ${order.company || 'Unknown'}` });
    setScanValue('');
    inputRef.current?.focus();
    toast(`Order ${order.orderId} dispatched`, 'success');
  }

  // ── Camera / barcode scan ─────────────────────────────────────
  // Uses BarcodeDetector (Chrome/Android) or falls back to ZXing via CDN
  async function openCamera() {
    setCameraError('');
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      startBarcodeLoop();
    } catch (err) {
      setCameraError('Camera access denied. Please allow camera permission and try again.');
      setCameraOpen(false);
    }
  }

  function stopCamera() {
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setCameraOpen(false);
  }

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), []);

  function startBarcodeLoop() {
    const hasBarcodeDetector = 'BarcodeDetector' in window;
    if (hasBarcodeDetector) {
      const detector = new window.BarcodeDetector({ formats: ['code_128', 'code_39', 'qr_code', 'data_matrix', 'ean_13', 'ean_8'] });
      const loop = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const val = barcodes[0].rawValue;
            stopCamera();
            setScanValue(val);
            setTimeout(() => processDispatch(val), 100);
            return;
          }
        } catch (_) {}
        scanLoopRef.current = requestAnimationFrame(loop);
      };
      scanLoopRef.current = requestAnimationFrame(loop);
    } else {
      // Fallback: ZXing via CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/zxing-js/0.20.0/umd/index.min.js';
      script.onload = () => {
        const codeReader = new window.ZXing.BrowserMultiFormatReader();
        codeReader.decodeFromVideoElement(videoRef.current).then((result) => {
          const val = result.getText();
          codeReader.reset();
          stopCamera();
          setScanValue(val);
          setTimeout(() => processDispatch(val), 100);
        }).catch(() => {});
        // Store cleanup ref
        scanLoopRef.current = { cancel: () => codeReader.reset() };
      };
      document.head.appendChild(script);
    }
  }

  // ── Courier stats ─────────────────────────────────────────────
  const today = todayStr();
  const todayOrders = db.orders.filter(
    (o) => o.status === 'Dispatched' && !o.deleted && o.dispatchedAt && o.dispatchedAt.startsWith(today)
  );
  const todayCourierMap = {};
  for (const o of todayOrders) {
    const courier = o.courier || (
      o.awb
        ? /^SF\d{8,13}FPL$/i.test(o.awb)   ? 'Shadowfax'
        : /^SF\d+$/i.test(o.awb)            ? 'Shadowfax'
        : /^1490\d{12}$/.test(o.awb)        ? 'Delhivery'
        : /^\d{13,18}$/.test(o.awb)         ? 'Delhivery'
        : /^(?:FMPP|FMPC|FM[A-Z])/i.test(o.awb) ? 'Ekart'
        : 'Other'
        : 'Unknown'
    );
    todayCourierMap[courier] = (todayCourierMap[courier] || 0) + 1;
  }
  const dispatched = db.orders.filter((o) => o.status === 'Dispatched' && !o.deleted)
    .filter((o) => !fCompany || (o.company || 'Unknown') === fCompany)
    .slice().reverse();
  const dispatchedCompanyCounts = [...COMPANIES.map((c) => c.name), 'Unknown'].map((name) => ({
    name,
    count: db.orders.filter((o) => o.status === 'Dispatched' && !o.deleted && (o.company || 'Unknown') === name).length,
  }));
  // Rendering every dispatched order unbounded gets slow as this list
  // grows — slice to a page instead.
  const dispatchTotalPages = Math.max(1, Math.ceil(dispatched.length / DISPATCH_PAGE_SIZE));
  const dispatchSafePage   = Math.min(dispatchPage, dispatchTotalPages);
  const dispatchPageRows   = dispatched.slice((dispatchSafePage - 1) * DISPATCH_PAGE_SIZE, dispatchSafePage * DISPATCH_PAGE_SIZE);

  return (
    <div>
      {/* ── Camera overlay ── */}
      {cameraOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: '#000', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <video ref={videoRef} style={{ width: '100%', maxWidth: 500, borderRadius: 8 }} playsInline muted />
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            border: '3px solid #22c55e', width: 260, height: 120, borderRadius: 8, pointerEvents: 'none',
          }} />
          <button onClick={stopCamera} style={{
            marginTop: 24, padding: '12px 32px', background: '#ef4444', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>❌ Cancel</button>
          <p style={{ color: '#fff', marginTop: 12, fontSize: 13 }}>Hold the barcode straight in front of the frame</p>
        </div>
      )}

      <div className="scanner-box">
        <h3>🔍 Scan AWB to Dispatch</h3>
        <p>Barcode scan / type AWB / Order ID / Invoice Ref (IN-xxx) / Tracking URL</p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            className="scan-input"
            type="text"
            placeholder="Scan or type AWB / Order ID…"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && processDispatch()}
            autoFocus
            style={{ flex: 1, minWidth: 200 }}
          />
          {/* Camera button — shows on mobile and desktop */}
          <button
            onClick={openCamera}
            title="Camera Scan"
            style={{
              padding: '10px 14px', background: '#7c3aed', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 20, cursor: 'pointer', lineHeight: 1,
            }}
          >📷</button>
        </div>

        {cameraError && <p style={{ color: 'var(--red)', marginTop: 6, fontSize: 13 }}>{cameraError}</p>}

        <div className="mt-2">
          <button className="btn btn-success" onClick={() => processDispatch()}>Mark as Dispatched</button>
        </div>
        <div className="scan-result">
          {result && (
            <div style={{
              fontWeight: 600, marginTop: 8,
              color: result.ok === true ? 'var(--green)' : result.ok === 'warn' ? 'var(--gold)' : 'var(--red)',
            }}>
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

        <div className="info-banner" style={{ marginBottom: 8, background: '#f0fdf4', borderColor: '#86efac' }}>
          <strong>📦 Today's Courier Count ({today}):</strong>{' '}
          {Object.keys(todayCourierMap).length === 0
            ? <span style={{ color: 'var(--muted)' }}>No dispatches yet today</span>
            : Object.entries(todayCourierMap).map(([courier, count], i) => (
              <span key={courier}>
                {i > 0 && ' | '}
                <strong>{courier}</strong>: {count} parcels
              </span>
            ))
          }
          {todayOrders.length > 0 && (
            <span style={{ marginLeft: 12, color: 'var(--muted)' }}>(Total: {todayOrders.length})</span>
          )}
        </div>

        <div className="info-banner" style={{ marginBottom: 12 }}>
          <strong>🏢 Dispatched by Company:</strong>{' '}
          {dispatchedCompanyCounts.map((c, i) => (
            <span key={c.name}>{i > 0 && ' | '}{c.name}: {c.count}</span>
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
                dispatchPageRows.map((o) => (
                  <tr key={o.id}>
                    <td className="truncate" title={o.orderId}>{o.orderId}</td>
                    <td>{o.customer}</td>
                    <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                    <td><span className="chip" style={{ background: '#eef2ff', color: '#3730a3' }}>{o.company || 'Unknown'}</span></td>
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

        {dispatched.length > DISPATCH_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 12, color: 'var(--muted,#6b7280)' }}>
              Showing {(dispatchSafePage - 1) * DISPATCH_PAGE_SIZE + 1}–{Math.min(dispatchSafePage * DISPATCH_PAGE_SIZE, dispatched.length)} of {dispatched.length}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={dispatchSafePage <= 1} onClick={() => setDispatchPage(dispatchSafePage - 1)}>← Prev</button>
            <span style={{ fontSize: 12 }}>Page {dispatchSafePage} / {dispatchTotalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={dispatchSafePage >= dispatchTotalPages} onClick={() => setDispatchPage(dispatchSafePage + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
