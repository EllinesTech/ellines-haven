/**
 * Chapter Breakdown Panel
 * ─────────────────────────────────
 * Admin view: per-chapter word count breakdown and pacing analysis
 * Shows reading time estimates, word distribution, and content balance
 */

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { getChapterWordCountBreakdown } from '../../utils/bookMetrics';
import { calculateReadingTime, formatWordCount } from '../../utils/readingTime';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function ChapterBreakdownPanel({ showToast }) {
  const { books } = useApp();

  const [selectedBookId, setSelectedBookId] = useState('');
  const [chapters, setChapters] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalStats, setTotalStats] = useState({});

  const loadChapters = useCallback(async () => {
    if (!selectedBookId) return;

    setLoading(true);
    try {
      const chaptersRef = doc(db, 'book_chapters', String(selectedBookId));
      const snap = await getDoc(chaptersRef);

      if (snap.exists()) {
        const data = snap.data();
        const chaptersArray = data.chapters || [];
        setChapters(chaptersArray);

        // Calculate breakdown
        const bd = getChapterWordCountBreakdown(chaptersArray);
        setBreakdown(bd);

        // Calculate total stats
        const totalWords = bd.reduce((sum, ch) => sum + ch.wordCount, 0);
        const totalReadTime = calculateReadingTime(totalWords);
        const avgWordCount = Math.round(totalWords / bd.length);
        const avgReadTime = calculateReadingTime(avgWordCount);

        setTotalStats({
          totalWords,
          totalReadTime,
          averageWordsPerChapter: avgWordCount,
          averageReadTimePerChapter: avgReadTime,
          chapterCount: bd.length,
          longestChapter: Math.max(...bd.map(ch => ch.wordCount)),
          shortestChapter: Math.min(...bd.map(ch => ch.wordCount)),
        });
      } else {
        showToast?.('No chapters found for this book');
        setBreakdown([]);
        setTotalStats({});
      }
    } catch (e) {
      showToast?.('❌ Failed to load chapters: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedBookId, showToast]);

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  const ongoingBooks = books.filter(b => b.status === 'ongoing' || (b.tableOfContents?.length > 0));
  const maxWordCount = Math.max(...breakdown.map(ch => ch.wordCount), 1);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📖 Chapter Word Count Breakdown</h1>
          <span className="adm-page-sub">
            Analyze word distribution, reading time per chapter, and content pacing
          </span>
        </div>
      </div>

      {/* ── Book selector ── */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
          Select Book
        </label>
        <select
          className="field"
          value={selectedBookId}
          onChange={e => setSelectedBookId(e.target.value)}
        >
          <option value="">— Select a book —</option>
          {ongoingBooks.map(b => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>

      {/* ── No selection ── */}
      {!selectedBookId && (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
            color: 'var(--muted)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📖</div>
          <p>Select a book to see its chapter breakdown.</p>
        </div>
      )}

      {/* ── Loading ── */}
      {selectedBookId && loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
          <p>Loading chapters...</p>
        </div>
      )}

      {/* ── Summary stats ── */}
      {selectedBookId && !loading && breakdown.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Total Words
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)', marginTop: 4 }}>
                {formatWordCount(totalStats.totalWords)}
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Reading Time
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ok)', marginTop: 4 }}>
                {totalStats.totalReadTime}
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Chapters
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                {totalStats.chapterCount}
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Avg/Chapter
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                {formatWordCount(totalStats.averageWordsPerChapter, 'compact')}
              </div>
            </div>
          </div>

          {/* ── Pacing analysis ── */}
          <div
            style={{
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.25)',
              borderRadius: 'var(--r-md)',
              padding: 14,
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>
              📊 Pacing Analysis
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.6 }}>
              <div>
                <strong>Average per chapter:</strong> {formatWordCount(totalStats.averageWordsPerChapter)} words ({totalStats.averageReadTimePerChapter})
              </div>
              <div style={{ marginTop: 6 }}>
                <strong>Range:</strong> {formatWordCount(totalStats.shortestChapter)} –{' '}
                {formatWordCount(totalStats.longestChapter)} words
              </div>
              <div style={{ marginTop: 6 }}>
                {totalStats.longestChapter > totalStats.averageWordsPerChapter * 1.5 ? (
                  <span style={{ color: 'var(--gold)' }}>
                    ⚠️ Uneven pacing detected — some chapters are significantly longer
                  </span>
                ) : (
                  <span style={{ color: 'var(--ok)' }}>
                    ✅ Good pacing — consistent chapter lengths
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Chapter table ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--muted)', fontWeight: 600 }}>
                    Chapter
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--muted)', fontWeight: 600 }}>
                    Words
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--muted)', fontWeight: 600 }}>
                    % of Total
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--muted)', fontWeight: 600 }}>
                    Read Time
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--muted)', fontWeight: 600 }}>
                    Distribution
                  </th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((ch, idx) => {
                  const readTime = calculateReadingTime(ch.wordCount, { showRange: false });
                  const barWidth = (ch.wordCount / maxWordCount) * 100;

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px', color: 'var(--text)' }}>
                        <strong>{ch.title}</strong>
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--text)', textAlign: 'right' }}>
                        {formatWordCount(ch.wordCount)}
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'right',
                          color: 'var(--gold)',
                          fontWeight: 600,
                        }}
                      >
                        {ch.percentOfTotal}%
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--muted)', textAlign: 'right' }}>
                        {readTime}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--text)' }}>
                        <div
                          style={{
                            height: 20,
                            background: 'var(--border)',
                            borderRadius: 3,
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              background: 'linear-gradient(90deg, var(--gold), rgba(201,168,76,0.5))',
                              width: `${barWidth}%`,
                              transition: 'width 0.3s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              paddingRight: 4,
                            }}
                          >
                            {barWidth > 10 && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  color: 'var(--text)',
                                  fontWeight: 600,
                                }}
                              >
                                {ch.percentOfTotal}%
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── No chapters ── */}
      {selectedBookId && !loading && breakdown.length === 0 && (
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
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📖</div>
          <p>No chapters uploaded for this book yet.</p>
        </div>
      )}
    </div>
  );
}
