import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts?.toMillis?.() || ts);
    return d.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};
const fmtKsh = n => 'KSh ' + Number(n || 0).toLocaleString();

const STATUS_COLORS = {
  Completed: { color: '#2ecc71', bg: 'rgba(46,204,113,0.1)' },
  Pending:   { color: '#e8832a', bg: 'rgba(232,131,42,0.1)' },
  Rejected:  { color: '#e74c3c', bg: 'rgba(231,76,60,0.1)' },
  Cancelled: { color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

export default function AdminOrdersPanel({ showToast, isSuper }) {
  const { books, confirmOrder, rejectOrder, unlockBooksForBuyer } = useApp();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingOrder, setEditingOrder] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy] = useState('newest');

  // Real-time orders listener
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'orders'), limit(1000));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(),
        _createdMs: d.data().createdAt?.toMillis?.() || d.data().createdAt || 0 }));
      setOrders(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const sorted = [...orders].sort((a, b) =>
    sortBy === 'newest' ? b._createdMs - a._createdMs :
    sortBy === 'oldest' ? a._createdMs - b._createdMs :
    sortBy === 'amount_high' ? (b.total || 0) - (a.total || 0) :
    (a.total || 0) - (b.total || 0)
  );

  const filtered = sorted.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.id?.toLowerCase().includes(q) ||
      o.userEmail?.toLowerCase().includes(q) ||
      o.userName?.toLowerCase().includes(q) ||
      (o.items || []).some(i => i.title?.toLowerCase().includes(q)) ||
      o.ref?.toLowerCase().includes(q) ||
      o.paystackRef?.toLowerCase().includes(q)
    );
  });

  const totals = {
    all: orders.length,
    Completed: orders.filter(o => o.status === 'Completed').length,
    Pending: orders.filter(o => o.status === 'Pending').length,
    Rejected: orders.filter(o => o.status === 'Rejected').length,
    revenue: orders.filter(o => o.status === 'Completed').reduce((s, o) => s + (o.total || 0), 0),
  };

  const openEdit = o => {
    setEditingOrder(o);
    setEditData({
      status: o.status || 'Pending',
      total: o.total || 0,
      userName: o.userName || '',
      userEmail: o.userEmail || '',
      method: o.method || '',
      ref: o.ref || '',
      paystackRef: o.paystackRef || '',
      mpesaTransactionId: o.mpesaTransactionId || '',
      phone: o.phone || '',
      adminNote: o.adminNote || '',
      promoCode: o.promoCode || '',
      discountAmount: o.discountAmount || 0,
    });
  };

  const saveEdit = async () => {
    if (!editingOrder) return;
    setSaving(true);
    try {
      const patch = {
        status: editData.status,
        total: Number(editData.total) || 0,
        userName: editData.userName,
        userEmail: editData.userEmail?.toLowerCase(),
        method: editData.method,
        ref: editData.ref,
        paystackRef: editData.paystackRef,
        mpesaTransactionId: editData.mpesaTransactionId,
        phone: editData.phone,
        adminNote: editData.adminNote,
        promoCode: editData.promoCode,
        discountAmount: Number(editData.discountAmount) || 0,
        lastEditedBy: 'admin',
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'orders', editingOrder.id), patch);
      // If status changed to Completed, also unlock books
      if (editData.status === 'Completed' && editingOrder.status !== 'Completed' && editData.userEmail) {
        const resolved = (editingOrder.items || []).map(item => ({
          ...(books?.find(b => b.id === item.id) || item),
          downloadUnlocked: true,
        }));
        await unlockBooksForBuyer(editData.userEmail, resolved).catch(() => {});
      }
      showToast?.('✅ Order updated');
      setEditingOrder(null);
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSaving(false);
  };

  const exportCSV = () => {
    const rows = [
      ['Order ID', 'Date', 'Customer', 'Email', 'Items', 'Total', 'Status', 'Method', 'Ref', 'Promo', 'Admin Note'],
      ...filtered.map(o => [
        o.id, fmtDate(o.createdAt || o._createdMs), o.userName || '', o.userEmail || '',
        (o.items || []).map(i => i.title).join('; '),
        o.total || 0, o.status || '', o.method || '', o.ref || o.paystackRef || '',
        o.promoCode || '', o.adminNote || '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast?.('📊 Orders exported');
  };

  const printReceipt = (o) => {
    const w = window.open('', '_blank');
    const items = (o.items || []).map(i => `<tr><td>${i.title}</td><td>KSh ${(i.price || 0).toLocaleString()}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt ${o.id}</title>
      <style>body{font-family:sans-serif;max-width:600px;margin:20px auto;color:#111}
      h1{color:#c9a84c}table{width:100%;border-collapse:collapse}
      td,th{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}
      .total{font-weight:bold;font-size:1.1rem}</style></head><body>
      <h1>Ellines Haven</h1><h3>Order Receipt — ${o.id}</h3>
      <p>Date: ${fmtDate(o.createdAt || o._createdMs)}</p>
      <p>Customer: ${o.userName || '—'} (${o.userEmail || '—'})</p>
      <table><thead><tr><th>Book</th><th>Price</th></tr></thead><tbody>${items}</tbody></table>
      ${o.promoCode ? `<p>Promo: ${o.promoCode} (−KSh ${(o.discountAmount || 0).toLocaleString()})</p>` : ''}
      <p class="total">Total: KSh ${(o.total || 0).toLocaleString()}</p>
      <p>Method: ${o.method || '—'}${o.ref ? ` | Ref: ${o.ref}` : ''}${o.paystackRef ? ` | Paystack: ${o.paystackRef}` : ''}</p>
      ${o.adminNote ? `<p><em>Admin note: ${o.adminNote}</em></p>` : ''}
      <p>Status: ${o.status}</p>
      <hr/><p style="color:#888;font-size:0.8rem">haven.ellines.co.ke · ellines.haven@gmail.com · +254 748 255 466</p>
      </body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div className="adm-page">
      {/* Edit Modal */}
      {editingOrder && (
        <div className="adm-overlay">
          <div className="adm-confirm card" style={{ maxWidth: 560, width: '95%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--gold)', margin: 0 }}>✏️ Edit Order — {editingOrder.id}</h3>
              <button className="adm-close-btn" onClick={() => setEditingOrder(null)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { k: 'userName', l: 'Customer Name' },
                { k: 'userEmail', l: 'Customer Email' },
                { k: 'total', l: 'Total (KSh)', type: 'number' },
                { k: 'method', l: 'Payment Method' },
                { k: 'ref', l: 'Reference / Code' },
                { k: 'paystackRef', l: 'Paystack Reference' },
                { k: 'mpesaTransactionId', l: 'M-Pesa Transaction ID' },
                { k: 'phone', l: 'Phone Number' },
                { k: 'promoCode', l: 'Promo Code' },
                { k: 'discountAmount', l: 'Discount Amount (KSh)', type: 'number' },
              ].map(f => (
                <div key={f.k} className="adm-field-group">
                  <label>{f.l}</label>
                  <input className="field" type={f.type || 'text'} value={editData[f.k] || ''}
                    onChange={e => setEditData(p => ({ ...p, [f.k]: e.target.value }))} />
                </div>
              ))}
              <div className="adm-field-group">
                <label>Status</label>
                <select className="field" value={editData.status}
                  onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}>
                  {['Pending', 'Completed', 'Rejected', 'Cancelled'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="adm-field-group" style={{ gridColumn: '1/-1' }}>
                <label>Admin Note (internal)</label>
                <textarea className="field" rows={2} style={{ resize: 'vertical' }}
                  value={editData.adminNote || ''}
                  onChange={e => setEditData(p => ({ ...p, adminNote: e.target.value }))}
                  placeholder="Internal note visible only to admins…" />
              </div>
            </div>
            {/* Items (read-only) */}
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r-sm)', border: '1px solid var(--dim)' }}>
              <strong style={{ fontSize: '0.78rem', color: 'var(--gold)', display: 'block', marginBottom: 8 }}>📚 Books in this order (read-only)</strong>
              {(editingOrder.items || []).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span>{item.title}</span><span style={{ color: 'var(--gold)' }}>KSh {(item.price || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving} style={{ flex: 1 }}>
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => printReceipt(editingOrder)}>🖨 Print</button>
              <button className="btn btn-ghost" onClick={() => setEditingOrder(null)}>Cancel</button>
            </div>
            {editData.status === 'Completed' && editingOrder.status !== 'Completed' && (
              <p style={{ fontSize: '0.75rem', color: '#e8832a', marginTop: 8 }}>
                ⚠ Setting to Completed will automatically unlock books for the customer.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="adm-page-head">
        <div>
          <h1>🧾 All Orders & Receipts</h1>
          <span className="adm-page-sub">View, edit, and manage every customer order and receipt</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>📊 Export CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div className="adm-stats-grid cols-4" style={{ marginBottom: 24 }}>
        {[
          { icon: '🛒', label: 'Total Orders',  value: totals.all,       color: '#c9a84c', bg: 'rgba(201,168,76,0.1)' },
          { icon: '✅', label: 'Completed',      value: totals.Completed, color: '#2ecc71', bg: 'rgba(46,204,113,0.1)' },
          { icon: '⏳', label: 'Pending',        value: totals.Pending,   color: '#e8832a', bg: 'rgba(232,131,42,0.1)' },
          { icon: '💰', label: 'Total Revenue',  value: fmtKsh(totals.revenue), color: '#2ecc71', bg: 'rgba(46,204,113,0.1)' },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ background: s.bg, fontSize: '1.4rem' }}>{s.icon}</div>
            <div className="adm-stat-body">
              <strong style={{ color: s.color, fontSize: typeof s.value === 'string' ? '1.1rem' : '1.5rem' }}>{loading ? '…' : s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'Completed', 'Pending', 'Rejected', 'Cancelled'].map(s => (
            <button key={s} className={'adm-filter-btn' + (statusFilter === s ? ' active' : '')}
              onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <select className="field" value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '5px 10px', fontSize: '0.8rem', width: 140 }}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="amount_high">Highest Amount</option>
          <option value="amount_low">Lowest Amount</option>
        </select>
        <input className="field" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by ID, email, book, reference…"
          style={{ maxWidth: 340, marginLeft: 'auto' }} />
      </div>

      {/* Orders Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: '0.88rem' }}>
            Orders <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem' }}>({filtered.length})</span>
          </strong>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="adm-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🛒</div>
            <p>No orders found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order ID</th><th>Customer</th><th>Books</th><th>Total</th>
                  <th>Method</th><th>Status</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const sc = STATUS_COLORS[o.status] || STATUS_COLORS.Cancelled;
                  return (
                    <>
                      <tr key={o.id} style={{ cursor: 'pointer', background: expandedId === o.id ? 'rgba(201,168,76,0.04)' : 'transparent' }}
                        onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                        <td><code style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>{o.id}</code>
                          {o.adminNote && <div style={{ fontSize: '0.68rem', color: '#e8832a', marginTop: 2 }}>📝 {o.adminNote.slice(0, 40)}</div>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{o.userName || '—'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{o.userEmail || '—'}</div>
                        </td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                          {(o.items || []).map(i => i.title).join(', ') || '—'}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmtKsh(o.total)}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{o.method || '—'}</td>
                        <td>
                          <span style={{ padding: '3px 9px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: sc.bg, color: sc.color }}>
                            {o.status || 'Unknown'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(o.createdAt || o._createdMs)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="adm-act-btn adm-act-edit" onClick={e => { e.stopPropagation(); openEdit(o); }}>✏️ Edit</button>
                            <button className="adm-act-btn" style={{ color: '#4a9eff', border: '1px solid rgba(74,158,255,0.25)' }}
                              onClick={e => { e.stopPropagation(); printReceipt(o); }}>🖨</button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === o.id && (
                        <tr key={o.id + '_exp'}>
                          <td colSpan={8} style={{ padding: 0, background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ padding: '14px 20px', borderLeft: '3px solid var(--gold)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: '0.79rem' }}>
                                {[
                                  ['📋 Order ID', o.id],
                                  ['👤 Customer', o.userName || '—'],
                                  ['📧 Email', o.userEmail || '—'],
                                  ['💰 Total', fmtKsh(o.total)],
                                  ['💳 Method', o.method || '—'],
                                  ['🧾 Ref', o.ref || o.paystackRef || o.mpesaTransactionId || '—'],
                                  ['📱 Phone', o.phone || '—'],
                                  ['🎟 Promo', o.promoCode ? `${o.promoCode} (−KSh ${(o.discountAmount || 0).toLocaleString()})` : 'None'],
                                  ['📅 Date', fmtDate(o.createdAt || o._createdMs)],
                                  ['✅ Completed', fmtDate(o.confirmedAt || o.completedAt)],
                                ].map(([label, value]) => (
                                  <div key={label} style={{ padding: '6px 10px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--dim)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
                                    <div style={{ fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>{value}</div>
                                  </div>
                                ))}
                              </div>
                              {o.adminNote && (
                                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(232,131,42,0.08)', border: '1px solid rgba(232,131,42,0.25)', borderRadius: 'var(--r-sm)', fontSize: '0.8rem', color: '#e8832a' }}>
                                  📝 Admin Note: {o.adminNote}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
