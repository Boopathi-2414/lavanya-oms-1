import { toast } from './Toast.jsx';

export default function Trash({ db, setDb }) {
  function restoreOrder(id) {
    const idx = db.trash.findIndex((o) => o.id === id);
    if (idx === -1) return;
    const o = { ...db.trash[idx] };
    delete o.deleted;
    delete o.deletedAt;
    db.orders.push(o);
    db.trash.splice(idx, 1);
    setDb({ ...db });
    toast('Order restored', 'success');
  }

  function permDelete(id) {
    if (!window.confirm('Permanently delete this order? This cannot be undone.')) return;
    db.trash = db.trash.filter((o) => o.id !== id);
    setDb({ ...db });
    toast('Permanently deleted', 'success');
  }

  function emptyTrash() {
    if (!db.trash.length) { toast('Trash is already empty', 'info'); return; }
    if (!window.confirm(`Permanently delete all ${db.trash.length} items?`)) return;
    db.trash = [];
    setDb({ ...db });
    toast('Trash emptied', 'success');
  }

  const { trash } = db;

  return (
    <div className="card">
      <div className="card-title">🗑️ Deleted Orders</div>
      <p className="text-sm text-muted mb-3">Restore orders or permanently delete them.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order ID</th><th>Customer</th><th>Channel</th><th>AWB</th>
              <th>Amount</th><th>Status</th><th>Deleted At</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {trash.length === 0 ? (
              <tr><td colSpan={8}><div className="empty"><div className="big">🗑️</div>Trash is empty</div></td></tr>
            ) : (
              trash.map((o) => (
                <tr key={o.id}>
                  <td className="truncate" title={o.orderId}>{o.orderId}</td>
                  <td>{o.customer}</td>
                  <td><span className={`chip chip-${(o.channel || '').toLowerCase()}`}>{o.channel}</span></td>
                  <td>{o.awb || '—'}</td>
                  <td>₹{(o.amount || 0).toLocaleString('en-IN')}</td>
                  <td><span className="status s-ready">{o.status}</span></td>
                  <td>{o.deletedAt ? new Date(o.deletedAt).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-success btn-xs" onClick={() => restoreOrder(o.id)}>↩ Restore</button>{' '}
                    <button className="btn btn-danger btn-xs" onClick={() => permDelete(o.id)}>✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <button className="btn btn-danger btn-sm" onClick={emptyTrash}>🔥 Empty Trash</button>
      </div>
    </div>
  );
}
