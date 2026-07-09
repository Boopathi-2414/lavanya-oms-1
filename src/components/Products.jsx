import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { genId } from '../db.js';
import { toast } from './Toast.jsx';

const EMPTY_FORM = { sku: '', category: '', rate: '' };

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
    setForm({ sku: p.sku, category: p.category || '', rate: p.rate || '' });
    setShowModal(true);
  }

  function saveProduct() {
    if (!form.sku.trim()) { toast('SKU / Product name required', 'error'); return; }
    const data = { sku: form.sku.trim(), category: form.category.trim(), rate: parseFloat(form.rate) || 0 };
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
          // Accept SKU or Product Name column
          const sku = String(
            row['SKU'] || row['Product'] || row['Product Name'] ||
            row['Name'] || row['Item'] || ''
          ).trim();
          if (!sku || db.products.find((p) => p.sku === sku)) return;
          const category = String(row['Category'] || row['Product Category'] || '').trim();
          db.products.push({
            id:   genId(),
            sku,
            category,
            rate: parseFloat(row['Purchase Rate'] || row['Rate'] || row['Cost'] || 0),
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
    !q || p.sku.toLowerCase().includes(q)
  );

  return (
    <div>
      <div className="card">
        <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>🏷️ Purchase Rate Database</div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
            📤 Import Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => importExcel(e.target.files[0])} />
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Product</button>
        </div>

        <div className="info-banner">
          Import Excel with columns: <strong>SKU</strong> (or Product Name) · <strong>Category</strong> (optional, used for Return Analytics grouping) · <strong>Purchase Rate</strong>
        </div>

        <div className="filter-bar">
          <div className="fg"><label>Search</label>
            <input type="text" placeholder="SKU or product name…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU / Product Name</th>
                <th>Category</th>
                <th>Purchase Rate (₹)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty">
                      <div className="big">🏷️</div>
                      No products. Add manually or import Excel.
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id}>
                    <td className="font-bold">{p.sku}</td>
                    <td>{p.category || <span style={{ color: 'var(--muted,#9ca3af)' }}>Uncategorized</span>}</td>
                    <td>₹{(p.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(p)}>✏️</button>{' '}
                      <button className="btn btn-danger btn-xs" onClick={() => deleteProduct(p.id)}>🗑</button>
                    </td>
                  </tr>
                ))
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
              <div>
                <label>SKU / Product Name</label>
                <input type="text" placeholder="e.g. 7 Neck Scales" value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div>
                <label>Purchase Rate (₹)</label>
                <input type="number" placeholder="0.00" step="0.01" value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Category (optional)</label>
                <input type="text" placeholder="e.g. Aari Hooks, Fabric Stickers" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProduct}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
