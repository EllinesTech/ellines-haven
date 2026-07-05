import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const STAR = '★';
const EMPTY_STAR = '☆';
const stars = (n) => STAR.repeat(n) + EMPTY_STAR.repeat(5 - n);

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return String(ts).slice(0, 10); }
}

export default function ReviewsPanel({ books = [], showToast, isSuper }) {
  const [reviews,  setReviews]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');   // all | pending | published | flagged
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const [addMode,  setAddMode]  = useState(false);
  const [newRev,   setNewRev]   = useState({ user: '', email: '', book: '', rating: 5, text: '' });
  const [saving,   setSaving]   = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const toggleBulkSelect = (id) => {
    const next = new Set(bulkSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    setBulkSelected(next);
  };
  const selectAllBulk = (ids) => setBulkSelected(new Set(ids));
  const clearBulkSelect = () => setBulkSelected(new Set());

  /* Real-time Firestore listener */
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(list);
      setLoading(false);
    }, () => {
      /* fallback: load from localStorage mock data */
      try {
        const stored = JSON.parse(localStorage.getItem('eh_reviews') || '[]');
        setReviews(stored);
      } catch {}
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const persist = async (id, patch) => {
    try {
      await setDoc(doc(db, 'reviews', id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    } catch {
      /* update local state even if Firestore fails */
      setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    }
  };

  const approve = async (r) => {
    setSaving(true);
    await persist(r.id, { status: 'Published' });
    setReviews(prev => prev.map(x => x.id === r.id ? { ...x, status: 'Published' } : x));
    showToast?.('✅ Review published');
    setSaving(false);
  };

  const flag = async (r) => {
    await persist(r.id, { status: 'Flagged' });
    setReviews(prev => prev.map(x => x.id === r.id ? { ...x, status: 'Flagged' } : x));
    showToast?.('🚩 Review flagged');
  };

  const remove = async (r) => {
    if (!window.confirm('Delete this review permanently?')) return;
    try {
      await deleteDoc(doc(db, 'reviews', r.id));
      setReviews(prev => prev.filter(x => x.id !== r.id));
    } catch {
      setReviews(prev => prev.filter(x => x.id !== r.id));
    }
    showToast?.('🗑 Review deleted');
    if (selected?.id === r.id) setSelected(null);
  };

  const addReview = async () => {
    if (!newRev.user || !newRev.book || !newRev.text) { showToast?.('❌ Fill all required fields'); return; }
    setSaving(true);
    const entry = { ...newRev, status: 'Published', createdAt: serverTimestamp(), date: new Date().toISOString().slice(0, 10) };
    try {
      const ref = await addDoc(collection(db, 'reviews'), entry);
      setReviews(prev => [{ id: ref.id, ...entry, createdAt: Date.now() }, ...prev]);
    } catch {
      const fakeId = 'r_' + Date.now();
      setReviews(prev => [{ id: fakeId, ...entry, createdAt: Date.now() }, ...prev]);
    }
    setNewRev({ user: '', email: '', book: '', rating: 5, text: '' });
    setAddMode(false);
    showToast?.('✅ Review added');
    setSaving(false);
  };

  const filtered = reviews.filter(r => {
    const matchFilter = filter === 'all' || r.status?.toLowerCase() === filter;
    const matchSearch = !search || r.user?.toLowerCase().includes(search.toLowerCase()) || r.book?.toLowerCase().includes(search.toLowerCase()) || r.text?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all:       reviews.length,
    pending:   reviews.filter(r => r.status === 'Pending').length,
    published: reviews.filter(r => r.status === 'Published').length,
    flagged:   reviews.filter(r => r.status === 'Flagged').length,
  };

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : '—';

  return (
    <div className="adm-page">
      {/* Add Review Modal */}
      {addMode && (
        <div className="adm-overlay">
          <div className="adm-confirm card" style={{ maxWidth: 480, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1rem' }}>Add Review</h3>
              <button className="adm-close-btn" onClick={() => setAddMode(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="adm-field-group">
                <label>Reader Name *</label>
                <input className="field" value={newRev.user} onChange={e => setNewRev(p => ({ ...p, user: e.target.value }))} placeholder="e.g. Amina Njeri" />
              </div>
              <div className="adm-field-group">
                <label>Email (optional)</label>
                <input className="field" type="email" value={newRev.email} onChange={e => setNewRev(p => ({ ...p, email: e.target.value }))} placeholder="reader@email.com" />
              </div>
              <div className="adm-field-group">
                <label>Book *</label>
                <select className="field" value={newRev.book} onChange={e => setNewRev(p => ({ ...p, book: e.target.value }))}>
                  <option value="">— Select a book —</option>
                  {books.map(b => <option key={b.id} value={b.title}>{b.title}</option>)}
                </select>
              </div>
              <div className="adm-field-group">
                <label>Rating</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setNewRev(p => ({ ...p, rating: n }))}
                      style={{ fontSize: '1.4rem', background: 'none', border: 'none', cursor: 'pointer', color: n <= newRev.rating ? '#c9a84c' : 'rgba(255,255,255,0.2)', transition: 'color 0.15s' }}>
                      {STAR}
                    </button>
                  ))}
                  <span style={{ alignSelf: 'center', fontSize: '0.82rem', color: 'var(--gold)', marginLeft: 4 }}>{newRev.rating}/5</span>
                </div>
              </div>
              <div className="adm-field-group">
                <label>Review Text *</label>
                <textarea className="field" rows={4} value={newRev.text} onChange={e => setNewRev(p => ({ ...p, text: e.target.value }))} placeholder="Write the review…" style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary btn-sm" onClick={addReview} disabled={saving}>{saving ? '⏳' : '✓ Add Review'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddMode(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="adm-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="adm-confirm card" style={{ maxWidth: 520, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1rem' }}>Review Detail</h3>
              <button className="adm-close-btn" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{selected.user}</div>
                  {selected.email && <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{selected.email}</div>}
                </div>
                <span style={{ color: '#c9a84c', fontSize: '1.1rem', letterSpacing: 2 }}>{stars(selected.rating || 5)}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gold)', marginBottom: 8 }}>📚 {selected.book}</div>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text)', margin: 0 }}>{selected.text}</p>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 10 }}>{fmtDate(selected.createdAt)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.status !== 'Published' && (
                <button className="btn btn-primary btn-sm" onClick={() => { approve(selected); setSelected(null); }}>✓ Approve & Publish</button>
              )}
              {selected.status !== 'Flagged' && (
                <button className="btn btn-ghost btn-sm" onClick={() => { flag(selected); setSelected(null); }}>🚩 Flag</button>
              )}
              <button className="btn btn-sm" style={{ background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}
                onClick={() => { remove(selected); setSelected(null); }}>🗑 Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="adm-page-head">
        <div>
          <h1>Reviews</h1>
          <span className="adm-page-sub">{counts.all} total · {counts.published} published · {counts.pending} pending · avg {avgRating}★</span>
        </div>
        <button className="btn btn-primary" onClick={() => setAddMode(true)}>+ Add Review</button>
      </div>

      {/* Stats */}
      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        {[
          { label: 'Total Reviews',    value: counts.all,       color: 'var(--gold)' },
          { label: 'Published',        value: counts.published, color: 'var(--ok)'   },
          { label: 'Pending Approval', value: counts.pending,   color: '#e8832a'     },
          { label: 'Avg Rating',       value: avgRating + '★',  color: '#c9a84c'     },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card">
            <div className="adm-stat-body"><strong style={{ color: s.color }}>{s.value}</strong><span>{s.label}</span></div>
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {bulkSelected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 8, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 'var(--r)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--gold)', fontSize: '0.88rem' }}>{bulkSelected.size} review{bulkSelected.size !== 1 ? 's' : ''} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={async () => {
            if (!window.confirm('Publish ' + bulkSelected.size + ' review(s)?')) return;
            for (const id of bulkSelected) {
              const r = reviews.find(x => x.id === id);
              if (r) await persist(r.id, { status: 'Published' });
            }
            setReviews(prev => prev.map(r => bulkSelected.has(r.id) ? { ...r, status: 'Published' } : r));
            clearBulkSelect();
            showToast('✅ Published ' + bulkSelected.size + ' review(s)');
          }}>✓ Approve</button>
          <button className="btn btn-ghost btn-sm" onClick={async () => {
            if (!window.confirm('Flag ' + bulkSelected.size + ' review(s)?')) return;
            for (const id of bulkSelected) {
              const r = reviews.find(x => x.id === id);
              if (r) await persist(r.id, { status: 'Flagged' });
            }
            setReviews(prev => prev.map(r => bulkSelected.has(r.id) ? { ...r, status: 'Flagged' } : r));
            clearBulkSelect();
            showToast('🚩 Flagged ' + bulkSelected.size + ' review(s)');
          }}>🚩 Flag</button>
          <button className="btn btn-ghost btn-sm" onClick={async () => {
            if (!window.confirm('Delete ' + bulkSelected.size + ' review(s)?')) return;
            for (const id of bulkSelected) {
              try {
                await deleteDoc(doc(db, 'reviews', id));
              } catch {}
            }
            setReviews(prev => prev.filter(r => !bulkSelected.has(r.id)));
            clearBulkSelect();
            showToast('🗑️ Deleted ' + bulkSelected.size + ' review(s)');
          }}>🗑️ Delete</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={clearBulkSelect}>✕ Clear</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="field" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviews…" style={{ width: 220, padding: '7px 10px', fontSize: '0.82rem' }} />
        {['all', 'pending', 'published', 'flagged'].map(f => (
          <button key={f} className={'adm-filter-btn' + (filter === f ? ' active' : '')} onClick={() => { setFilter(f); clearBulkSelect(); }}
            style={{ textTransform: 'capitalize' }}>
            {f} {f !== 'all' && <span style={{ marginLeft: 4, fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '0 5px' }}>{counts[f] ?? 0}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading reviews…</div>
      ) : filtered.length === 0 ? (
        <div className="adm-empty">
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>⭐</div>
          <p>No reviews yet. {filter !== 'all' ? 'Try a different filter.' : 'Add the first one above.'}</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}><input type="checkbox" onChange={e => e.target.checked ? selectAllBulk(filtered.map(r => r.id)) : clearBulkSelect()} checked={filtered.length > 0 && filtered.every(r => bulkSelected.has(r.id))} style={{ cursor: 'pointer', accentColor: 'var(--gold)' }} /></th>
                <th>Reader</th>
                <th>Book</th>
                <th>Rating</th>
                <th>Review</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer', background: bulkSelected.has(r.id) ? 'rgba(201,168,76,0.07)' : undefined }} onClick={() => setSelected(r)}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={bulkSelected.has(r.id)} onChange={() => toggleBulkSelect(r.id)} style={{ cursor: 'pointer', accentColor: 'var(--gold)' }} /></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.user}</div>
                    {r.email && <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{r.email}</div>}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{r.book}</td>
                  <td>
                    <span style={{ color: '#c9a84c', letterSpacing: 1, fontSize: '0.85rem' }}>{stars(r.rating || 5)}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 4 }}>{r.rating || 5}/5</span>
                  </td>
                  <td style={{ maxWidth: 220, fontSize: '0.82rem', color: 'var(--muted)' }}>
                    {(r.text || '').length > 70 ? r.text.slice(0, 70) + '…' : r.text}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <span className={'adm-status adm-status--' + (r.status === 'Published' ? 'completed' : r.status === 'Flagged' ? 'refunded' : 'pending')}>
                      {r.status || 'Pending'}
                    </span>
                  </td>
                  <td className="adm-actions" onClick={e => e.stopPropagation()}>
                    {r.status !== 'Published' && (
                      <button className="adm-act-btn adm-act-edit" onClick={() => approve(r)}>Approve</button>
                    )}
                    {r.status !== 'Flagged' && (
                      <button className="adm-act-btn" onClick={() => flag(r)} style={{ marginLeft: 4, color: '#e8832a', borderColor: 'rgba(232,131,42,0.3)' }}>Flag</button>
                    )}
                    <button className="adm-act-btn adm-act-del" onClick={() => remove(r)} style={{ marginLeft: 4 }}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
