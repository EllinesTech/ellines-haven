/**
 * Most-Read Books Panel
 * ─────────────────────────────────
 * Admin dashboard showing platform's most-read books
 * Tracks engagement metrics, reader counts, and reading patterns
 */

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { getMostReadBooks, calculateCompletionMetrics } from '../../utils/bookMetrics';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function MostReadBooksPanel({ showToast }) {
  const { books } = useApp();

  const [mostReadBooks, setMostReadBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookDetails, setBookDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadMostRead = useCallback(async () => {
    setLoading(true);
    try {
      const results = await getMostReadBooks(books, days, 20);
      setMostReadBooks(results);
    } catch (e) {
      showToast?.('❌ ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [books, days, showToast]);

  useEffect(() => {
    loadMostRead();
  }, [loadMostRead]);

  const handleSelectBook = async (bookId) => {
    setSelectedBook(bookId);
    setDetailsLoading(true);
    try {
      const analyticsRef = doc(db, 'chapter_analytics', String(bookId));
      const snap = await getDoc(analyticsRef);
      if (snap.exists()) {
        const data = snap.data();
        const metrics = calculateCompletionMetrics(data);
        setBookDetails({
          ...data,
          ...metrics,
        });
      }
    } catch (e) {
      showToast?.('❌ Failed to load book details');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📚 Most-Read Books</h1>
          <span className="adm-page-sub">
            Track which books are getting the most engagement and reader interest across
            the platform
          </span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Time Period
          </label>
          <select className="field" value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={0}>All time</option>
          </select>
        </div>

        <button className="btn btn-outline btn-sm" onClick={loadMostRead} disabled={loading}>
          {loading ? '⏳' : '🔄 Refresh'}
        </button>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
          <p>Loading most-read books...</p>
        </div>
      )}

      {/* ── No data ── */}
      {!loading && mostReadBooks.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'var(--card)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
          <p>No reading data available for the selected period.</p>
        </div>
      )}

      {/* ── Books table ── */}
      {!loading && mostReadBooks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedBook ? '1fr 1fr' : '1fr', gap: 20 }}>
          {/* Left: Books list */}
          <div>
            <div
              style={{
                display: 'grid',
                gap: 8,
              }}
            >
              {mostReadBooks.map((book, idx) => (
                <div
                  key={book.bookId}
                  onClick={() => handleSelectBook(book.bookId)}
                  style={{
                    padding: '12px 16px',
                    background: selectedBook === book.bookId ? 'rgba(201,168,76,0.1)' : 'var(--card)',
                    border:
                      selectedBook === book.bookId
                        ? '1px solid var(--gold)'
                        : '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (selectedBook !== book.bookId) {
                      e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedBook !== book.bookId) {
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                        #{idx + 1} — {book.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                        by {book.author}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Total Reads
                      </div>
                      <div
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: 'var(--gold)',
                          marginTop: 2,
                        }}
                      >
                        {book.totalReads.toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        Unique Readers
                      </div>
                      <div
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: 'var(--ok)',
                          marginTop: 2,
                        }}
                      >
                        {book.uniqueReaders.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Engagement score bar */}
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        height: 4,
                        background: 'var(--border)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          background: 'var(--gold)',
                          width: `${Math.min(100, (book.engagementScore / 10) * 100)}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>
                      Engagement Score: {book.engagementScore}/10
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Book details */}
          {selectedBook && (
            <div>
              {detailsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <p>Loading details...</p>
                </div>
              ) : bookDetails ? (
                <div
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    padding: 18,
                  }}
                >
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--gold)' }}>
                    📊 Engagement Metrics
                  </h3>

                  {/* Completion rate */}
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Completion Rate
                    </div>
                    <div
                      style={{
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        color: bookDetails.completionRate > 60 ? 'var(--ok)' : 'var(--gold)',
                        marginBottom: 6,
                      }}
                    >
                      {bookDetails.completionRate}%
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: 'var(--border)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          background:
                            bookDetails.completionRate > 60
                              ? 'var(--ok)'
                              : 'var(--gold)',
                          width: `${bookDetails.completionRate}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted)',
                        marginTop: 6,
                      }}
                    >
                      {bookDetails.completionRate > 60
                        ? '✅ Excellent retention — readers love this book!'
                        : bookDetails.completionRate > 30
                        ? '⚠️ Moderate drop-off — consider reviewing content pacing'
                        : '⚠️ High drop-off — readers may need more engagement early on'}
                    </p>
                  </div>

                  {/* Chapter stats */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      marginBottom: 16,
                      paddingBottom: 16,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 4 }}>
                        Avg Chapters Read
                      </div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
                        {bookDetails.avgChaptersRead}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 4 }}>
                        Drop-off Point
                      </div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
                        {bookDetails.dropOffChapter ? `Ch ${bookDetails.dropOffChapter}` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div style={{ background: 'rgba(168,85,247,0.06)', padding: 12, borderRadius: 'var(--r-sm)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                      💡 Recommendations
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {bookDetails.completionRate < 40 && (
                        <li>Consider revising chapters after the drop-off point</li>
                      )}
                      {bookDetails.completionRate > 70 && (
                        <li>Excellent pacing! Consider this book as a model for future titles</li>
                      )}
                      <li>Monitor reader feedback for chapters with high drop-off</li>
                      <li>Use this data to optimize future books and marketing</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <p>No detailed analytics available for this book yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
