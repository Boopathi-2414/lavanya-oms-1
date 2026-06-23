import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { genId } from '../db.js';
import { toast } from './Toast.jsx';

const EMPTY_FORM = { sku: '', hsn: '', category: '', rate: '', mrp: '', stock: '' };

export default function Products({ db, setDb }) {
  const [search,      setSearch]      = useState('');
  const [showModal,   setShowModal]   = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const fileInputRef = useRef();

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(p) {
    setEditingId(p.id);
    setForm({ sku: p.sku, hsn: p.hsn || '', category: p.category || '',
              rate: p.rate || '', mrp: p.mrp || '', stock: p.stock ?? '' });
    setShowModal(true);
  }

  function saveProduct() {
    if (!form.sku.trim()) { toast('SKU required', 'error'); return; }
    const data = { ...form, rate: parseFloat(form.rate) || 0, mrp: parseFloat(form.mrp) || 0, stock: parseInt(form.stock) || 0 };
    if (editingId) {
      const idx = db.products.findIndex((p) => p.id === editingId);
      if (idx !== -1) db.products[idx] = { ...db.products[idx], ...data };
      toast('Product updated', 'success');
    } else {
      db.products.push({ ...data, id: genId(), createdAt: new Date().toISOString() });
      toast('Product added', 'success');
    }
    setDb({ ...db });
    setShowModal(false);
  }

  function deleteProduct(id) {
    if (!window.confirm('Delete this product?')) return;
    db.products = db.products.filter((p) => p.id !== id);
    setDb({ ...db });
    toast('Deleted', 'success');
  }

  function importExcel(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        let added = 0;
        data.forEach((row) => {
          const sku = String(row['SKU'] || row['Product'] || row['Name'] || '').trim();
          if (!sku || db.products.find((p) => p.sku === sku)) return;
          db.products.push({
            id: genId(), sku, hsn: String(row['HSN'] || ''), category: String(row['Category'] || ''),
            rate: parseFloat(row['Purchase Rate'] || row['Rate'] || 0),
            mrp:  parseFloat(row['MRP'] || row['Sell Price'] || 0),
            stock: parseInt(row['Stock'] || row['Qty'] || 0),
            createdAt: new Date().toISOString(),
          });
          added++;
        });
        setDb({ ...db });
        toast(`${added} products imported`, 'success');
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const q = search.toLowerCase();
  const products = db.products.filter((p) =>
    !q || `${p.sku} ${p.category}`.toLowerCase().includes(q)
  );

  return (
    <div>
      <div className="card">
        <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>🏷️ Product Price Database</div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
            📤 Import Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => importExcel(e.target.files[0])} />
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Product</button>
        </div>

        <div className="filter-bar">
          <div className="fg"><label>Search</label>
            <input type="text" placeholder="SKU or category…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU / Name</th><th>HSN</th><th>Category</th>
                <th>Purchase Rate</th><th>MRP</th><th>Stock</th><th>Margin</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={8}><div className="empty"><div className="big">🏷️</div>No products. Add or import your price list.</div></td></tr>
              ) : (
                products.map((p) => {
                  const m = p.mrp && p.rate ? Math.round(((p.mrp - p.rate) / p.mrp) * 100) : 0;
                  return (
                    <tr key={p.id}>
                      <td className="font-bold">{p.sku}</td>
                      <td>{p.hsn || '—'}</td>
                      <td>{p.category || '—'}</td>
                      <td>₹{(p.rate || 0).toLocaleString('en-IN')}</td>
                      <td>₹{(p.mrp  || 0).toLocaleString('en-IN')}</td>
                      <td>{p.stock ?? '—'}</td>
                      <td><span style={{ color: m > 30 ? 'var(--green)' : m > 15 ? 'var(--gold)' : 'var(--red)' }}>{m}%</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(p)}>✏️</button>{' '}
                        <button className="btn btn-danger btn-xs" onClick={() => deleteProduct(p.id)}>🗑</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-title">{editingId ? 'Edit Product' : 'Add Product'}</div>
            <div className="form-row">
              <div><label>SKU / Product Name</label>
                <input type="text" placeholder="e.g. 7 Neck Scales" value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div><label>HSN Code</label>
                <input type="text" placeholder="e.g. 38246090" value={form.hsn}
                  onChange={(e) => setForm({ ...form, hsn: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div><label>Purchase Rate (₹)</label>
                <input type="number" placeholder="0.00" step="0.01" value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>
              <div><label>MRP / Sell Price (₹)</label>
                <input type="number" placeholder="0.00" step="0.01" value={form.mrp}
                  onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div><label>Category</label>
                <input type="text" placeholder="e.g. Tailoring Tools" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div><label>Stock Qty</label>
                <input type="number" placeholder="0" value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProduct}>Save Product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
