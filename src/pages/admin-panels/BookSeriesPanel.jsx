import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * BOOK SERIES PANEL
 * 
 * Manage book series:
 * - Create/edit/delete series
 * - Link books to series (displayed in reading order)
 * - Series metadata (description, cover)
 * - Automatic "Next in series" links
 */

function SeriesForm({ series, onSave, onCancel, books }) {
  const [data, setData] = useState(
    series || {
      name: '',
      description: '',
      order: 1,
      books: [],
      featured: false,
    }
  );

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--r)', padding: 20, marginBottom: 20 }}>
      <h3 style={{ marginBottom: 16, color: 'var(--gold)', fontSize: '0.95rem' }}>
        {series ? '✏️ Edit Series' : '✍️ New Series'}
      </h3>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Series Name *
        </label>
        <input
          className="field"
          value={data.name}
          onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g., East African Chronicles"
          style={{ fontSize: '0.85rem' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Description
        </label>
        <textarea
          className="field"
          value={data.description}
          onChange={(e) => setData((d) => ({ ...d, description: e.target.value }))}
          placeholder="Describe this series..."
          rows={3}
          style={{ fontSize: '0.85rem', resize: 'vertical' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Books in Series (select and drag to reorder)
        </label>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--r-sm)', padding: 12 }}>
          {books.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>No books available</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {books.map((book) => (
                <label
                  key={book.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 'var(--r-sm)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={data.books.includes(book.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setData((d) => ({ ...d, books: [...d.books, book.id] }));
                      } else {
                        setData((d) => ({ ...d, books: d.books.filter((b) => b !== book.id) }));
                      }
                    }}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ flex: 1 }}>{book.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={data.featured}
            onChange={(e) => setData((d) => ({ ...d, featured: e.target.checked }))}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: '0.82rem' }}>Featured Series (show on home page)</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onSave(data)}>
          {series ? '💾 Update Series' : '📚 Create Series'}
        </button>
      </div>
    </div>
  );
}

export default function BookSeriesPanel({ showToast, books, isSuper }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const seriesSnap = await getDocs(
          query(collection(db, 'book_series'), orderBy('createdAt', 'desc'))
        );
        setSeries(seriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        showToast?.('❌ Failed to load series: ' + e.message);
      }
      setLoading(false);
    };
    load();
  }, [showToast]);

  const saveSeries = async (seriesData) => {
    try {
      const seriesId = editing?.id || seriesData.name.toLowerCase().replace(/\s+/g, '-') + '_' + Date.now();
      await setDoc(doc(db, 'book_series', seriesId), {
        ...seriesData,
        updatedAt: serverTimestamp(),
        createdAt: editing?.createdAt || serverTimestamp(),
      }, { merge: true });
      showToast?.('✅ Series saved');
      setEditing(null);
      setCreating(false);
      // Reload
      const seriesSnap = await getDocs(
        query(collection(db, 'book_series'), orderBy('createdAt', 'desc'))
      );
      setSeries(seriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      showToast?.('❌ Failed to save series: ' + e.message);
    }
  };

  const deleteSeries = async (seriesId) => {
    if (!window.confirm('Delete this series? Books will NOT be deleted, just unlinked.')) return;
    try {
      await deleteDoc(doc(db, 'book_series', seriesId));
      showToast?.('✅ Series deleted');
      setSeries((s) => s.filter((x) => x.id !== seriesId));
    } catch (e) {
      showToast?.('❌ Delete failed: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>📚</div>
        <p>Loading series…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📚 Book Series Manager</h1>
          <span className="adm-page-sub">
            Link multiple books into series. Readers will see "Next in series" suggestions and reading order.
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New Series
        </button>
      </div>

      {/* Create Series */}
      {creating && (
        <SeriesForm
          series={null}
          onSave={saveSeries}
          onCancel={() => setCreating(false)}
          books={books}
        />
      )}

      {/* Edit Series */}
      {editing && (
        <SeriesForm
          series={editing}
          onSave={saveSeries}
          onCancel={() => setEditing(null)}
          books={books}
        />
      )}

      {/* Series List */}
      <h3 style={{ marginBottom: 16, fontSize: '0.95rem' }}>All Series ({series.length})</h3>
      {series.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          <p>No series created yet. Create one to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {series.map((s) => (
            <div
              key={s.id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 'var(--r)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 4 }}>{s.name}</strong>
                  {s.featured && (
                    <span style={{ fontSize: '0.7rem', background: 'var(--gold)', color: '#000', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      FEATURED
                    </span>
                  )}
                </div>
              </div>

              {s.description && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
                  {s.description}
                </p>
              )}

              <div style={{ marginBottom: 12, padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r-sm)' }}>
                <strong style={{ fontSize: '0.75rem', display: 'block', marginBottom: 6, color: 'var(--gold)' }}>
                  📚 {s.books?.length || 0} books
                </strong>
                {s.books && s.books.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {s.books.map((bookId, idx) => {
                      const book = books.find((b) => b.id === bookId);
                      return (
                        <small key={bookId} style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                          {idx + 1}. {book?.title || 'Unknown Book'}
                        </small>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setEditing(s)}>
                  ✏️ Edit
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1, color: '#e74c3c', borderColor: 'rgba(231,76,60,0.3)' }}
                  onClick={() => deleteSeries(s.id)}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 40, color: 'var(--muted)', fontSize: '0.82rem' }}>
        💡 Series help readers discover related books and encourage series reading. Featured series appear on the home page.
      </div>
    </div>
  );
}
