import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { getChapterAnalytics } from '../../utils/chapterAnalytics';

/**
 * ChapterAnalyticsPanel
 *
 * Admin view: shows per-chapter read counts and unique reader counts
 * for a selected book over the last N days.
 */
export default function ChapterAnalyticsPanel({ showToast }) {
  const { books } = useApp();

  const [selectedBook, setSelectedBook] = useState('');
  const [days,         setDays]         = useState(30);
  const [rows,         setRows]         = useState([]);
  const [loading,      setLoading]      = useState(false);

  const ongoingBooks = books.filter(b => b.status === 'ongoing' || (b.tableOfContents?.length > 0));

  const load = useCallback(async () => {
    if (!selectedBook) return;
    setLoading(true);
    try {
      const data = await getChapterAnalytics(selectedBook, days);
      setRows(data);
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setLoading(false);
  }, [selectedBook, days, showToast]);

  useEffect(() => { load(); }, [load]);

  const book       = books.find(b => b.id === selectedBook);
  const isPart     = s => /^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(s);
  const realToc    = (book?.tableOfContents || []).filter(t => !isPart(t));
  const maxReads   = rows.reduce((m, r) => Math.max(m, r.reads), 1);
  const totalReads = rows.reduce((s, r) => s + r.reads, 0);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📊 Chapter Analytics</h1>
          <span className="adm-page-sub">
            See which chapters readers engage with most — read counts and unique readers per chapter
          </span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Book
          </label>
          <select
            className="field"
            value={selectedBook}
            onChange={e => setSelectedBook(e.target.value)}
          >
            <option value="">— Select a book —</option>
            {ongoingBooks.map(b => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Time range
          </label>
          <select className="field" value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        <button className="btn btn-outline btn-sm" onClick={load} disabled={!selectedBook || loading}>
          {loading ? '⏳' : '🔄 Refresh'}
        </button>
      </div>

      {/* ── No book selected ── */}
      {!selectedBook && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--muted)', fontSize: '0.9rem',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
          <p>Select a book above to see its chapter analytics.</p>
        </div>
      )}

      {/* ── Loading ── */}
      {selectedBook && loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
          ⏳ Loading analytics…
        </div>
      )}

      {/* ── No data ── */}
      {selectedBook && !loading && rows.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--muted)', fontSize: '0.9rem',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
          <p>No chapter reads recorded for this book in the last {days} days.</p>
          <p style={{ fontSize: '0.8rem', marginTop: 8 }}>
            Analytics are recorded when readers open a chapter in the Reader.
          </p>
        </div>
      )}

      {/* ── Results ── */}
      {selectedBook && !loading && rows.length > 0 && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Reads',       value: totalReads,   icon: '📖' },
              { label: 'Unique Readers',    value: Math.max(...rows.map(r => r.uniqueReaders)), icon: '👤' },
              { label: 'Chapters w/ Reads', value: rows.length,  icon: '📋' },
              { label: 'Most Read Chapter', value: `Ch ${rows.reduce((a, b) => b.reads > a.reads ? b : a, rows[0]).chapter + 1}`, icon: '🏆' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{c.icon}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--gold)' }}>{c.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Per-chapter bar chart */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '0.92rem', color: 'var(--gold)', marginBottom: 16 }}>
              Reads per Chapter — last {days} days
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(row => {
                const chapTitle = realToc[row.chapter]
                  ? realToc[row.chapter].replace(/^(Chapter \d+|Day \d+|Story \d+) — /, '')
                  : `Chapter ${row.chapter + 1}`;
                const pct = Math.round((row.reads / maxReads) * 100);

                return (
                  <div key={row.chapter} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Chapter num */}
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      color: 'var(--muted)', minWidth: 28, textAlign: 'right',
                    }}>
                      {String(row.chapter + 1).padStart(2, '0')}
                    </span>

                    {/* Title */}
                    <span style={{
                      fontSize: '0.82rem', color: 'var(--text)',
                      flex: 1, minWidth: 0, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {chapTitle}
                    </span>

                    {/* Bar */}
                    <div style={{
                      flex: 2, height: 20, background: 'rgba(255,255,255,0.05)',
                      borderRadius: 4, overflow: 'hidden', minWidth: 80,
                    }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: pct > 66
                          ? 'linear-gradient(90deg,#2ecc71,#27ae60)'
                          : pct > 33
                          ? 'linear-gradient(90deg,#4a9eff,#2980b9)'
                          : 'linear-gradient(90deg,#e8832a,#c0392b)',
                        borderRadius: 4,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>

                    {/* Reads count */}
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 700,
                      color: 'var(--gold)', minWidth: 40, textAlign: 'right',
                    }}>
                      {row.reads}
                    </span>

                    {/* Unique readers */}
                    <span style={{
                      fontSize: '0.72rem', color: 'var(--muted)',
                      minWidth: 50, textAlign: 'right',
                    }}>
                      {row.uniqueReaders} reader{row.uniqueReaders !== 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 14 }}>
              Each read is recorded when a reader opens a chapter. Multiple reads by the same
              user on the same day count as one unique read event.
            </p>
          </div>

          {/* Drop-off insight */}
          {rows.length >= 3 && (() => {
            const ch1Reads  = rows.find(r => r.chapter === 0)?.reads || 0;
            const lastReads = rows[rows.length - 1].reads;
            const dropPct   = ch1Reads > 0 ? Math.round((1 - lastReads / ch1Reads) * 100) : 0;
            return (
              <div className="card" style={{
                padding: '14px 18px', marginTop: 16,
                background: dropPct > 70
                  ? 'rgba(231,76,60,0.08)'
                  : dropPct > 40
                  ? 'rgba(232,131,42,0.08)'
                  : 'rgba(46,204,113,0.08)',
                border: `1px solid ${dropPct > 70 ? 'rgba(231,76,60,0.3)' : dropPct > 40 ? 'rgba(232,131,42,0.3)' : 'rgba(46,204,113,0.3)'}`,
              }}>
                <strong style={{ color: dropPct > 70 ? '#e74c3c' : dropPct > 40 ? '#e8832a' : '#2ecc71', fontSize: '0.88rem' }}>
                  {dropPct > 70 ? '⚠️' : dropPct > 40 ? '📉' : '✅'} Reader Retention
                </strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 6 }}>
                  {dropPct > 0
                    ? `${dropPct}% drop-off from Chapter 1 to Chapter ${rows[rows.length - 1].chapter + 1}. `
                    : 'Consistent reads across all chapters. '}
                  {dropPct > 70
                    ? 'Most readers are not finishing this book — consider checking the early chapters.'
                    : dropPct > 40
                    ? 'Moderate drop-off is normal. The most-read chapters are performing well.'
                    : 'Excellent retention — readers are consistently finishing chapters.'}
                </p>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
