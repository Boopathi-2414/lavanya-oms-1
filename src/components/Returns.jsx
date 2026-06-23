import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { downloadTemplate, normalizeReturnType, returnTypeClass, returnTypeLabel, RETURN_TYPES } from '../db.js';
import { toast } from './Toast.jsx';

export default function Returns({ db, setDb }) {
  const [importStatus, setImportStatus] = useState('');
  // Per-row pending type before "Mark Received" — keyed by order id
  const [pendingType, setPendingType] = useState({});
  // ── Filter state ─────────────────────────────────────────────
  const [filterType,    setFilterType]    = useState('');   // '' | 'Customer Return' | 'RTO' | 'unknown'
  const [filterChannel, setFilterChannel] = useState('');   // '' | 'Amazon' | 'Flipkart' | 'Meesho'
  const [filterSearch,  setFilterSearch]  = useState('');   // free-text search

  const fileInputRef = useRef();

  // ── Excel import ────────────────────────────────────────────
  function importReturnExcel(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        let updated = 0;
        data.forEach((row) => {
          const oid = String(row['Order ID'] || row['order_id'] || row['OrderID'] || '').trim();
          const awb = String(row['AWB'] || row['Tracking'] || row['AWB Number'] || '').trim();
          // Accept "Return Type", "ReturnType", "Type" columns
          const rawType = String(row['Return Type'] || row['ReturnType'] || row['Type'] || '').trim();

          const order = db.orders.find(
            (o) => (oid && o.orderId === oid) || (awb && (o.awb === awb || o.invoice === awb))
          );
          if (order) {
            order.status      = 'In Transit (Return)';
            order.transitDate = new Date().toISOString();
            // Set return_type only if the column was provided; preserve existing value otherwise
            const normalised = normalizeReturnType(rawType);
            if (normalised) order.return_type = normalised;
            updated++;
          }
        });
        setDb({ ...db });
        setImportStatus(`✅ Updated ${updated} orders to "In Transit (Return)"`);
        toast(`${updated} orders marked In Transit`, 'success');
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Mark received with type confirmation ────────────────────
  function markReceived(id) {
    const o = db.orders.find((x) => x.id === id);
    if (!o) return;
    // Use the inline dropdown selection if set; fall back to existing return_type
    const chosen = pendingType[id] || o.return_type || '';
    o.status       = 'Return Received';
    o.receivedDate = new Date().toISOString();
    if (chosen) o.return_type = chosen;
    setDb({ ...db });
    // Clear the pending selection for this row
    setPendingType((prev) => { const n = { ...prev }; delete n[id]; return n; });
    toast(
      chosen
        ? `Return Received — ${returnTypeLabel(chosen)}`
        : 'Return Received (type not set)',
      'success'
    );
  }

  // Inline type change without saving yet (shows badge immediately)
  function setType(id, val) {
    // Optimistically update the order in db so the badge shows right away
    const o = db.orders.find((x) => x.id === id);
    if (o) { o.return_type = val; setDb({ ...db }); }
    setPendingType((prev) => ({ ...prev, [id]: val }));
  }

  // ── Also show "Return Received" tab ─────────────────────────
  const [activeTab, setActiveTab] = useState('transit'); // 'transit' | 'received'

  const allTransit  = db.orders.filter((o) => o.status === 'In Transit (Return)'  && !o.deleted);
  const allReceived = db.orders.filter((o) => o.status === 'Return Received'       && !o.deleted);

  // ── Counts for summary strip (based on full transit list, before filters) ──
  const custCount = allTransit.filter((o) => o.return_type === 'Customer Return').length;
  const rtoCount  = allTransit.filter((o) => o.return_type === 'RTO').length;
  const unknCount = allTransit.filter((o) => !o.return_type).length;

  // ── Apply filters to whichever tab is active ─────────────────
  function applyFilters(list) {
    const q = filterSearch.toLowerCase();
    return list.filter((o) => {
      if (filterChannel && o.channel !== filterChannel) return false;
      if (filterType === 'unknown' && o.return_type) return false;
      if (filterType && filterType !== 'unknown' && o.return_type !== filterType) return false;
      if (q && !`${o.orderId} ${o.customer} ${o.awb || ''} ${o.sku || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  const displayList = applyFilters(activeTab === 'transit' ? allTransit : allReceived);

  function clearFilters() {
    setFilterType('');
    setFilterChannel('');
    setFilterSearch('');
  }

  // ── Return type badge inline component ──────────────────────
  function ReturnBadge({ rt }) {
    const cls = returnTypeClass(rt);
    const lbl = returnTypeLabel(rt);
    // Map class → inline color style as a fallback for apps not loading styles.css
    const styleMap = {
      'rt-customer': { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' },
      'rt-rto':      { background: '#fef9c3', color: '#854d0e', border: '1px solid #fcd34d' },
      'rt-unknown':  { background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' },
    };
    return (
      <span
        className={`return-type-badge ${cls}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          whiteSpace: 'nowrap',
          ...(styleMap[cls] || styleMap['rt-unknown']),
        }}
      >
        {lbl}
      </span>
    );
  }

  return (
    <div>
      {/* ── Upload card ── */}
      <div className="card">
        <div className="card-title">📤 Import Return Transit Excel</div>
        <div className="info-banner">
          Add a <strong>"Return Type"</strong> column to your Excel with values
          <strong> Customer Return</strong> or <strong>RTO</strong> and they will be
          auto-tagged on import. You can also set or change the type inline in the table below.
        </div>
        <div
          className="upload-zone"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="ico-big">📊</div>
          <p><strong>Click to upload</strong> Excel / CSV file</p>
          <p>Columns: Order ID, AWB, Status, Return Type</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => importReturnExcel(e.target.files[0])}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {importStatus && (
            <div style={{ color: 'var(--green)', fontWeight: 600 }}>{importStatus}</div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
            onClick={() => downloadTemplate('returns')}>
            ⬇ Download Template
          </button>
        </div>
      </div>

      {/* ── Returns Table Card ── */}
      <div className="card">

        {/* ── Tab bar ──────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '2px solid var(--border,#e5e7eb)' }}>
          {[
            { key: 'transit',  label: `🔄 In Transit (${allTransit.length})` },
            { key: 'received', label: `✅ Received (${allReceived.length})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '6px 16px', border: 'none', cursor: 'pointer',
                fontWeight: activeTab === key ? 700 : 400,
                fontSize: 14,
                background: 'transparent',
                borderBottom: activeTab === key ? '2px solid var(--primary,#6366f1)' : '2px solid transparent',
                color: activeTab === key ? 'var(--primary,#6366f1)' : 'var(--muted,#6b7280)',
                marginBottom: -2,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Summary strip (transit tab only) ─────────────── */}
        {activeTab === 'transit' && allTransit.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--muted,#6b7280)' }}>Summary:</span>
            <span
              className="return-type-badge rt-customer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 12px',
                borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd',
              }}
              onClick={() => setFilterType(filterType === 'Customer Return' ? '' : 'Customer Return')}
              title="Click to filter by Customer Return"
            >
              ↩ Customer Return: {custCount}
            </span>
            <span
              className="return-type-badge rt-rto"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 12px',
                borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: '#fef9c3', color: '#854d0e', border: '1px solid #fcd34d',
              }}
              onClick={() => setFilterType(filterType === 'RTO' ? '' : 'RTO')}
              title="Click to filter by RTO"
            >
              🚚 RTO: {rtoCount}
            </span>
            {unknCount > 0 && (
              <span
                className="return-type-badge rt-unknown"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 12px',
                  borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db',
                }}
                onClick={() => setFilterType(filterType === 'unknown' ? '' : 'unknown')}
                title="Click to filter by Unknown type"
              >
                — Unknown: {unknCount}
              </span>
            )}
          </div>
        )}

        {/* ── Filter bar ───────────────────────────────────── */}
        <div className="filter-bar" style={{ marginBottom: 12 }}>
          {/* Search */}
          <div className="fg">
            <label>Search</label>
            <input
              type="text"
              placeholder="Order ID, Customer, AWB…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
            />
          </div>

          {/* Return Type filter — only relevant on transit tab */}
          {activeTab === 'transit' && (
            <div className="fg">
              <label>Return Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                <option value="Customer Return">↩ Customer Return</option>
                <option value="RTO">🚚 RTO</option>
                <option value="unknown">— Unknown</option>
              </select>
            </div>
          )}

          {/* Channel filter */}
          <div className="fg">
            <label>Channel</label>
            <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
              <option value="">All</option>
              <option>Amazon</option>
              <option>Flipkart</option>
              <option>Meesho</option>
            </select>
          </div>

          {/* Clear */}
          <div>
            <label>&nbsp;</label>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>✕ Clear</button>
          </div>
        </div>

        {/* ── Active filter chips ──────────────────────────── */}
        {(filterType || filterChannel || filterSearch) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted,#6b7280)', alignSelf: 'center' }}>Filtering:</span>
            {filterSearch && (
              <span style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                "{filterSearch}" <span style={{ cursor: 'pointer' }} onClick={() => setFilterSearch('')}>×</span>
              </span>
            )}
            {filterType && (
              <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                {filterType === 'unknown' ? '— Unknown' : filterType} <span style={{ cursor: 'pointer' }} onClick={() => setFilterType('')}>×</span>
              </span>
            )}
            {filterChannel && (
              <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                {filterChannel} <span style={{ cursor: 'pointer' }} onClick={() => setFilterChannel('')}>×</span>
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--muted,#6b7280)', alignSelf: 'center' }}>
              — {displayList.length} result{displayList.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────── */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Channel</th>
                <th>AWB</th>
                <th>SKU</th>
                <th>Return Type</th>
                <th>{activeTab === 'transit' ? 'Transit Date' : 'Received Date'}</th>
                {activeTab === 'transit' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {displayList.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'transit' ? 8 : 7}>
                    <div className="empty">
                      {allTransit.length === 0 && activeTab === 'transit'
                        ? 'No return transit orders. Import an Excel or mark orders from Sales.'
                        : allReceived.length === 0 && activeTab === 'received'
                          ? 'No received returns yet.'
                          : 'No orders match the current filters.'}
                    </div>
                  </td>
                </tr>
              ) : (
                displayList.map((o) => (
                  <tr key={o.id}>
                    <td className="truncate" title={o.orderId}>{o.orderId}</td>
                    <td>{o.customer}</td>
                    <td>
                      <span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span>
                    </td>
                    <td>{o.awb || '—'}</td>
                    <td className="truncate" title={o.sku}>{o.sku || '—'}</td>

                    {/* ── Return Type cell — color badge + inline selector (transit only) ── */}
                    <td>
                      {activeTab === 'transit' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {/* Live color badge — updates as soon as dropdown changes */}
                          <ReturnBadge rt={o.return_type} />
                          {/* Inline selector */}
                          <select
                            className="rt-select"
                            value={o.return_type || ''}
                            onChange={(e) => setType(o.id, e.target.value)}
                            style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6 }}
                          >
                            <option value="">— Set type —</option>
                            {RETURN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      ) : (
                        /* Received tab — just show the badge, no selector */
                        <ReturnBadge rt={o.return_type} />
                      )}
                    </td>

                    <td>
                      {activeTab === 'transit'
                        ? (o.transitDate  ? new Date(o.transitDate).toLocaleDateString('en-IN')  : '—')
                        : (o.receivedDate ? new Date(o.receivedDate).toLocaleDateString('en-IN') : '—')}
                    </td>

                    {activeTab === 'transit' && (
                      <td>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => markReceived(o.id)}
                          title={o.return_type ? `Mark Received as ${o.return_type}` : 'Set Return Type first (optional)'}
                        >
                          ✅ Mark Received
                        </button>
                      </td>
                    )}
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