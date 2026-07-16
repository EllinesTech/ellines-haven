/**
 * Book Edit Panel - For Super Admin & Admin
 * ─────────────────────────────────────────
 * Manage book metadata including word count, reading time,
 * status, pricing, and other professional details
 */

import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getReadingStats, calculateReadingTime, countWordsFromChapters, formatWordCount } from '../../utils/readingTime';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import './BookEditPanel.css';

export default function BookEditPanel({ showToast, books = [] }) {
  const { user, setBooks } = useApp();
  const isSuper = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin' || isSuper;

  const [selectedBookId, setSelectedBookId] = useState('');
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [liveWc, setLiveWc] = useState(null); // word count from uploaded chapters

  const selectedBook = books.find(b => b.id === selectedBookId);

  // Fetch live word count from Firestore chapters whenever a book is selected
  useEffect(() => {
    if (!selectedBookId) { setLiveWc(null); return; }
    setLiveWc(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'book_chapters', String(selectedBookId)));
        if (snap.exists() && snap.data().chapters?.length > 0) {
          const wc = countWordsFromChapters(snap.data().chapters);
          setLiveWc(wc > 0 ? wc : null);
        }
      } catch { /* ignore — offline or no chapters */ }
    })();
  }, [selectedBookId]);

  const startEdit = (book) => {
    setSelectedBookId(book.id);
    setEditData({
      title: book.title || '',
      author: book.author || '',
      status: book.status || 'complete',
      price: book.price || 0,
      pages: book.pages || 0,
      wordCount: book.wordCount || 0,
      chapterCount: book.chapterCount || 0,
      rating: book.rating || 5.0,
      reviews: book.reviews || 0,
      audienceRating: book.audienceRating || '',
      freeFirstChapter: book.freeFirstChapter || false,
      allowIndividualPurchase: book.allowIndividualPurchase !== false,
      chapterPriceOverride: book.chapterPriceOverride || 0,
    });
    setSaveMsg('');
  };

  const handleChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const autoCalculateReadingTime = () => {
    // Priority: live chapter word count > manual word count > pages estimate
    const wc = liveWc || editData.wordCount || (editData.pages ? editData.pages * 250 : 0);
    if (wc > 0) {
      const readingTime = calculateReadingTime(wc);
      const source = liveWc
        ? `from ${liveWc.toLocaleString()} live chapter words`
        : editData.wordCount
          ? `from ${editData.wordCount.toLocaleString()} manual words`
          : `estimated from ${editData.pages} pages`;
      showToast?.(`📚 Reading time: ${readingTime} (${source})`);
      return readingTime;
    }
    showToast?.('❌ Need word count or pages to calculate reading time');
    return null;
  };

  const saveChanges = async () => {
    if (!selectedBook) return;
    setSaving(true);

    try {
      const updated = books.map(b => {
        if (b.id === selectedBookId) {
          // Use live chapter count as the source of truth; fall back to manual entry
          const effectiveWc = liveWc || editData.wordCount || b.wordCount || 0;
          const newReadTime = effectiveWc
            ? calculateReadingTime(effectiveWc)
            : (editData.pages ? calculateReadingTime(editData.pages * 250) : b.readTime);

          return {
            ...b,
            ...editData,
            wordCount: effectiveWc, // always store the best available count
            readTime: newReadTime,
            updatedAt: new Date().toISOString(),
            lastEditedBy: user?.email,
          };
        }
        return b;
      });

      setBooks(updated);
      setSaveMsg('✅ Book updated successfully');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e) {
      setSaveMsg('❌ Error: ' + e.message);
    }
    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <div className="adm-panel-notice">
        <div style={{ fontSize: '1.1rem', marginBottom: 10 }}>🔒 Admin Only</div>
        <p>You don't have permission to edit books.</p>
      </div>
    );
  }

  return (
    <div className="adm-panel bep-panel">
      <div className="adm-panel-header">
        <h2>📚 Book Editor</h2>
        <p>Manage book metadata, pricing, and reading metrics</p>
      </div>

      {/* Book selector */}
      <div style={{ marginBottom: 20 }}>
        <label htmlFor="book-select" style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.85rem' }}>
          Select Book to Edit
        </label>
        <select
          id="book-select"
          className="field"
          value={selectedBookId}
          onChange={e => setSelectedBookId(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        >
          <option value="">Choose a book…</option>
          {books.map(b => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.status}) — {b.type}
            </option>
          ))}
        </select>
        {selectedBook && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => startEdit(selectedBook)}
            style={{ fontSize: '0.75rem' }}
          >
            ✏️ Edit
          </button>
        )}
      </div>

      {/* Edit form */}
      {selectedBook && (
        <div className="bep-edit-form">
          <div style={{ marginBottom: 16, padding: 12, background: 'rgba(74,158,255,0.06)', borderRadius: 8 }}>
            <strong style={{ color: '#4a9eff', fontSize: '0.85rem' }}>Current Book:</strong>{' '}
            <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
              {selectedBook.title} • {selectedBook.status}
            </span>
          </div>

          {/* Basic Info */}
          <div className="bep-section">
            <h3 style={{ fontSize: '0.95rem', marginBottom: 12, color: 'var(--gold)' }}>ℹ️ Basic Info</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>Title</label>
                <input
                  className="field"
                  value={editData.title}
                  onChange={e => handleChange('title', e.target.value)}
                  disabled={!isSuper}
                  title={!isSuper ? 'Only Super Admin can edit' : ''}
                />
              </div>
              <div>
                <label>Author</label>
                <input
                  className="field"
                  value={editData.author}
                  onChange={e => handleChange('author', e.target.value)}
                  disabled={!isSuper}
                  title={!isSuper ? 'Only Super Admin can edit' : ''}
                />
              </div>
            </div>
          </div>

          {/* Status & Type */}
          <div className="bep-section">
            <h3 style={{ fontSize: '0.95rem', marginBottom: 12, color: 'var(--gold)' }}>📊 Status & Availability</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>Status</label>
                <select className="field" value={editData.status} onChange={e => handleChange('status', e.target.value)}>
                  <option value="complete">✅ Complete</option>
                  <option value="premium">⭐ Premium</option>
                  <option value="free-preview">👀 Free Preview</option>
                  <option value="ongoing">📖 Ongoing</option>
                  <option value="coming-soon">🔜 Coming Soon</option>
                  <option value="limited">⏳ Limited Edition</option>
                  <option value="draft">📝 Draft</option>
                </select>
              </div>
              <div>
                <label>Audience Rating</label>
                <input
                  className="field"
                  placeholder="e.g., 18+, 16+, 13+"
                  value={editData.audienceRating}
                  onChange={e => handleChange('audienceRating', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bep-section">
            <h3 style={{ fontSize: '0.95rem', marginBottom: 12, color: 'var(--gold)' }}>💰 Pricing</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>Price (KSh)</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="10"
                  value={editData.price}
                  onChange={e => handleChange('price', parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label>Chapter Price Override (KSh)</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="5"
                  value={editData.chapterPriceOverride}
                  onChange={e => handleChange('chapterPriceOverride', parseInt(e.target.value) || 0)}
                  title="Override auto-calculated chapter price (optional)"
                />
              </div>
            </div>
          </div>

          {/* Reading Metrics - IMPORTANT */}
          <div className="bep-section" style={{ background: 'rgba(168,85,247,0.06)', padding: 12, borderRadius: 8 }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 12, color: '#a855f7' }}>📈 Reading Metrics</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 12 }}>
              Word count is the industry standard. Calculates to ~8-10 hours automatically (250 WPM baseline).
            </p>

            {/* Live word count from uploaded chapters */}
            {liveWc ? (
              <div style={{
                padding: '10px 14px', marginBottom: 14,
                background: 'rgba(46,204,113,0.08)',
                border: '1px solid rgba(46,204,113,0.3)',
                borderRadius: 8, fontSize: '0.82rem',
              }}>
                <strong style={{ color: 'var(--ok)' }}>✅ Live from uploaded chapters:</strong>
                {' '}
                <strong style={{ color: 'var(--text)', fontSize: '1rem' }}>
                  {liveWc.toLocaleString()} words
                </strong>
                {' '}
                <span style={{ color: 'var(--muted)' }}>
                  · {calculateReadingTime(liveWc)} read time
                </span>
                <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
                  This is the exact count from the full chapter text in Firestore.
                </div>
              </div>
            ) : (
              <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--dim)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
                No chapters uploaded yet — enter word count manually below.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label>Word Count (manual override)</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="500"
                  placeholder="e.g., 62500"
                  value={editData.wordCount}
                  onChange={e => handleChange('wordCount', parseInt(e.target.value) || 0)}
                  style={{ fontWeight: 600, color: editData.wordCount ? 'var(--ok)' : 'var(--text)' }}
                />
                <small style={{ color: 'var(--muted)', fontSize: '0.7rem', marginTop: 4, display: 'block' }}>
                  {liveWc
                    ? `Live chapters = ${liveWc.toLocaleString()} words. Override only if needed.`
                    : 'Primary metric (250 WPM = ~1 hour per 15,000 words)'}
                </small>
              </div>
              <div>
                <label>Pages (backup)</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="10"
                  placeholder="e.g., 250"
                  value={editData.pages}
                  onChange={e => handleChange('pages', parseInt(e.target.value) || 0)}
                  title="Used if word count not available (~250 words/page)"
                />
              </div>
            </div>

            {/* Reading time preview — uses live count if available */}
            {(liveWc || editData.wordCount || editData.pages) && (
              <div style={{ padding: 10, background: 'var(--card)', borderRadius: 6, marginBottom: 12, fontSize: '0.8rem', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>Estimated Reading Time:</strong>{' '}
                <strong style={{ color: 'var(--gold)' }}>
                  {calculateReadingTime(liveWc || editData.wordCount || editData.pages * 250)}
                </strong>
                {liveWc && (
                  <span style={{ color: 'var(--ok)', fontSize: '0.72rem', marginLeft: 8 }}>
                    (from live chapters · {formatWordCount(liveWc, 'compact')} words)
                  </span>
                )}
              </div>
            )}

            <button
              className="btn btn-outline btn-sm"
              onClick={autoCalculateReadingTime}
              style={{ fontSize: '0.72rem' }}
            >
              🧮 Calculate Reading Time
            </button>
          </div>

          {/* Chapters */}
          <div className="bep-section">
            <h3 style={{ fontSize: '0.95rem', marginBottom: 12, color: 'var(--gold)' }}>📖 Chapters</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>Total Chapters</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={editData.chapterCount}
                  onChange={e => handleChange('chapterCount', parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={editData.freeFirstChapter}
                    onChange={e => handleChange('freeFirstChapter', e.target.checked)}
                  />
                  <span>Free First Chapter</span>
                </label>
              </div>
            </div>
            {editData.status === 'ongoing' && (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={editData.allowIndividualPurchase}
                    onChange={e => handleChange('allowIndividualPurchase', e.target.checked)}
                  />
                  <span>Allow Individual Chapter Purchase</span>
                </label>
              </div>
            )}
          </div>

          {/* Ratings (for Super Admin only) */}
          {isSuper && (
            <div className="bep-section" style={{ background: 'rgba(201,168,76,0.06)', padding: 12, borderRadius: 8 }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: 12, color: 'var(--gold)' }}>⭐ Ratings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label>Rating</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={editData.rating}
                    onChange={e => handleChange('rating', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label>Number of Reviews</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    value={editData.reviews}
                    onChange={e => handleChange('reviews', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={saveChanges}
              disabled={saving}
              style={{ fontSize: '0.85rem', fontWeight: 600 }}
            >
              {saving ? '💾 Saving…' : '💾 Save Changes'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSelectedBookId('');
                setEditData({});
              }}
              style={{ fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            {saveMsg && (
              <span
                style={{
                  fontSize: '0.8rem',
                  color: saveMsg.startsWith('✅') ? 'var(--ok)' : '#e8832a',
                  fontWeight: 600,
                  marginLeft: 8,
                }}
              >
                {saveMsg}
              </span>
            )}
          </div>

          {/* Permissions Note */}
          <div style={{ marginTop: 16, padding: 10, background: 'rgba(201,168,76,0.06)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--gold)' }}>📝 Permissions:</strong>
            <ul style={{ margin: '6px 0 0 0', paddingLeft: 20 }}>
              <li><strong>Admin:</strong> Can edit pricing, status, reading metrics, chapters</li>
              <li><strong>Super Admin:</strong> Can edit everything including title, author, ratings</li>
            </ul>
          </div>
        </div>
      )}

      {!selectedBook && selectedBookId && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
          Book not found
        </div>
      )}

      {!selectedBookId && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          👇 Select a book to start editing
        </div>
      )}
    </div>
  );
}
