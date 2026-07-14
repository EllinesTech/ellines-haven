import { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';

/* ─────────────────────────────────────────────────────────────────
   SeriesPanel — Admin control for ongoing / serialised books

   Per-book controls:
   • Status toggle (ongoing / complete / etc.)
   • Chapters Released count (auto-fills badge on BookCard)
   • Total Planned Chapters
   • Per-chapter price override (admin can set manually; auto = price ÷ total)
   • Enable / disable individual chapter purchases
   • Quick TOC chapter release toggle (mark each entry as released or coming soon)
   • Notify readers when new chapter drops (fires a notification blast)
───────────────────────────────────────────────────────────────────── */

const BOOK_STATUSES = [
  { value: 'complete',     label: '✅ Complete',       color: '#2ecc71' },
  { value: 'ongoing',      label: '📖 Ongoing',        color: '#4a9eff' },
  { value: 'premium',      label: '⭐ Premium',         color: '#c9a84c' },
  { value: 'free-preview', label: '👀 Free Preview',    color: '#a855f7' },
  { value: 'coming-soon',  label: '🔜 Coming Soon',     color: '#e8832a' },
  { value: 'limited',      label: '⏳ Limited',         color: '#e74c3c' },
  { value: 'draft',        label: '📝 Draft',           color: '#64748b' },
];

const statusColor = (s) => BOOK_STATUSES.find(x => x.value === s)?.color || 'var(--muted)';
const isPart = (s) => /^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(s);

export default function SeriesPanel({ showToast }) {
  const { books, saveBook } = useApp();

  // Filter to books that are ongoing or have chapters
  const [filter, setFilter] = useState('ongoing');
  const [selected, setSelected] = useState(null); // book id
  const [saving, setSaving] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState('');
  const [sendingNotify, setSendingNotify] = useState(false);

  // Local editable state for the selected book
  const [draft, setDraft] = useState(null);

  const filteredBooks = books.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'ongoing') return b.status === 'ongoing';
    if (filter === 'has-chapters') {
      const count = (b.tableOfContents || []).filter(t => !isPart(t)).length;
      return count > 0;
    }
    return true;
  });

  const selectBook = (book) => {
    setSelected(book.id);
    const realToc = (book.tableOfContents || []).filter(t => !isPart(t));
    const releasedCount = book.chaptersReleased > 0
      ? book.chaptersReleased
      : realToc.length;
    const totalPlanned = book.totalChapters > 0
      ? book.totalChapters
      : book.chapterCount > 0 ? book.chapterCount : releasedCount;
    const autoPrice = totalPlanned > 0
      ? Math.ceil((book.price / totalPlanned) / 5) * 5
      : 50;
    setDraft({
      id: book.id,
      title: book.title,
      status: book.status || 'complete',
      price: book.price || 0,
      chaptersReleased: releasedCount,
      totalChapters: totalPlanned,
      chapterCount: book.chapterCount || 0,
      tableOfContents: book.tableOfContents || [],
      allowIndividualPurchase: book.allowIndividualPurchase !== false, // default true
      freeFirstChapter: book.freeFirstChapter === true, // default false
      chapterPriceOverride: book.chapterPriceOverride || 0, // 0 = auto
      autoChapterPrice: autoPrice,
      releasedTocIndices: book.releasedTocIndices
        ?? Array.from({ length: releasedCount }, (_, i) => i), // default: first N released
    });
    setNotifyMsg('');
  };

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const recalcAutoPrice = (d) => {
    const realToc = (d.tableOfContents || []).filter(t => !isPart(t));
    const total = d.totalChapters > 0 ? d.totalChapters : realToc.length;
    return total > 0 ? Math.ceil((d.price / total) / 5) * 5 : 50;
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const book = books.find(b => b.id === draft.id);
      if (!book) throw new Error('Book not found');

      const updated = {
        ...book,
        status: draft.status,
        chaptersReleased: Number(draft.chaptersReleased),
        totalChapters: Number(draft.totalChapters),
        chapterCount: Number(draft.chapterCount) || Number(draft.totalChapters),
        allowIndividualPurchase: draft.allowIndividualPurchase,
        freeFirstChapter: draft.freeFirstChapter,
        chapterPriceOverride: Number(draft.chapterPriceOverride) || 0,
        releasedTocIndices: draft.releasedTocIndices,
      };
      await saveBook(updated);

      // Also write a series-specific doc for quick reads
      await setDoc(
        doc(db, 'book_series', String(draft.id)),
        {
          bookId: draft.id,
          title: draft.title,
          status: draft.status,
          chaptersReleased: Number(draft.chaptersReleased),
          totalChapters: Number(draft.totalChapters),
          allowIndividualPurchase: draft.allowIndividualPurchase,
          freeFirstChapter: draft.freeFirstChapter,
          chapterPriceOverride: Number(draft.chapterPriceOverride) || 0,
          releasedTocIndices: draft.releasedTocIndices,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      showToast?.('✅ Series settings saved for "' + draft.title + '"');
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSaving(false);
  };

  const toggleReleasedIndex = (idx) => {
    const cur = draft.releasedTocIndices || [];
    const next = cur.includes(idx) ? cur.filter(x => x !== idx) : [...cur, idx].sort((a, b) => a - b);
    set('releasedTocIndices', next);
    // Auto-update chaptersReleased to match
    set('chaptersReleased', next.length);
  };

  const releaseAll = () => {
    const realToc = (draft.tableOfContents || []).filter(t => !isPart(t));
    const indices = realToc.map((_, i) => i);
    set('releasedTocIndices', indices);
    set('chaptersReleased', indices.length);
  };

  const releaseNone = () => {
    set('releasedTocIndices', []);
    set('chaptersReleased', 0);
  };

  const sendNewChapterNotification = async () => {
    if (!draft || !notifyMsg.trim()) return;
    setSendingNotify(true);
    try {
      await setDoc(doc(db, 'contact_messages', 'chapnotif_' + draft.id + '_' + Date.now()), {
        type: 'new_chapter_blast',
        bookId: draft.id,
        bookTitle: draft.title,
        message: notifyMsg.trim(),
        subject: `📖 New Chapter Released: ${draft.title}`,
        status: 'new',
        notified: false,
        createdAt: serverTimestamp(),
      });
      showToast?.('📢 Notification queued for admin to send');
      setNotifyMsg('');
    } catch (e) {
      showToast?.('❌ ' + e.message);
    }
    setSendingNotify(false);
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📖 Series Manager</h1>
          <span className="adm-page-sub">Manage ongoing book series — chapter releases, pricing, and reader notifications</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { v: 'ongoing',      l: '📖 Ongoing' },
          { v: 'has-chapters', l: '📋 Has Chapters' },
          { v: 'all',          l: '📚 All Books' },
        ].map(t => (
          <button key={t.v} onClick={() => setFilter(t.v)}
            style={{
              padding: '7px 14px', border: 'none', borderRadius: 20, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, fontSize: '0.82rem',
              background: filter === t.v ? 'var(--gold)' : 'rgba(255,255,255,0.06)',
              color: filter === t.v ? '#000' : 'var(--muted)',
              transition: 'all 0.15s',
            }}>
            {t.l}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--muted)', alignSelf: 'center' }}>
          {filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left: book list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredBooks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: '0.85rem' }}>
              No books in this filter.
            </div>
          )}
          {filteredBooks.map(book => {
            const realToc = (book.tableOfContents || []).filter(t => !isPart(t));
            const released = book.chaptersReleased > 0 ? book.chaptersReleased : realToc.length;
            const total = book.totalChapters > 0 ? book.totalChapters : book.chapterCount || realToc.length;
            const isSelected = selected === book.id;
            return (
              <button key={book.id} onClick={() => selectBook(book)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: isSelected ? 'rgba(201,168,76,0.08)' : 'var(--card)',
                  border: isSelected ? '1px solid rgba(201,168,76,0.4)' : '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s', width: '100%',
                }}>
                {book.cover && book.coverType === 'photo'
                  ? <img src={book.cover} alt="" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <div style={{ width: 32, height: 44, background: book.coverColor || '#1a1a3a', borderRadius: 4, flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                    {book.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: statusColor(book.status), background: statusColor(book.status) + '20', padding: '1px 7px', borderRadius: 10 }}>
                      {book.status}
                    </span>
                    {released > 0 && (
                      <span style={{ fontSize: '0.68rem', color: '#4a9eff' }}>
                        {released}/{total > 0 ? total : '?'} ch
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && <span style={{ color: 'var(--gold)', fontSize: '0.8rem', flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* ── Right: edit panel ── */}
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Book header */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <span style={{ fontSize: '1.2rem' }}>📖</span>
                <div>
                  <strong style={{ color: 'var(--gold)', display: 'block' }}>{draft.title}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>ID: {draft.id}</span>
                </div>
              </div>
            </div>

            {/* ── Status ── */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '0.88rem', color: 'var(--gold)', marginBottom: 12 }}>📌 Publication Status</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BOOK_STATUSES.map(s => (
                  <button key={s.value} onClick={() => set('status', s.value)}
                    style={{
                      padding: '6px 14px', border: `1px solid ${draft.status === s.value ? s.color : 'var(--border)'}`,
                      borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.15s',
                      background: draft.status === s.value ? s.color + '22' : 'transparent',
                      color: draft.status === s.value ? s.color : 'var(--muted)',
                    }}>
                    {s.label} {draft.status === s.value && '✓'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Chapter Counts ── */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '0.88rem', color: 'var(--gold)', marginBottom: 4 }}>📊 Chapter Progress</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 14 }}>
                These numbers power the "X of Y chapters" badge on BookCard and the series purchase panel.
                They auto-derive from the TOC release toggles below, or set manually here.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Chapters Released</label>
                  <input className="field" type="number" min={0}
                    value={draft.chaptersReleased}
                    onChange={e => set('chaptersReleased', Number(e.target.value))}
                    style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: '#4a9eff' }}
                  />
                  <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>Available to readers now</small>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Total Planned</label>
                  <input className="field" type="number" min={0}
                    value={draft.totalChapters}
                    onChange={e => {
                      set('totalChapters', Number(e.target.value));
                      set('autoChapterPrice', recalcAutoPrice({ ...draft, totalChapters: Number(e.target.value) }));
                    }}
                    style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem' }}
                  />
                  <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>0 = not announced</small>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Full Book Price (KSh)</label>
                  <input className="field" type="number" min={0}
                    value={draft.price}
                    onChange={e => {
                      set('price', Number(e.target.value));
                      set('autoChapterPrice', recalcAutoPrice({ ...draft, price: Number(e.target.value) }));
                    }}
                    style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem' }}
                  />
                  <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>Buy-all bundle price</small>
                </div>
              </div>
            </div>

            {/* ── Chapter Purchase Settings ── */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '0.88rem', color: 'var(--gold)', marginBottom: 4 }}>💰 Chapter Purchase Settings</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 14 }}>
                Controls whether readers can buy individual chapters on the book detail page.
              </p>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox"
                  checked={draft.freeFirstChapter}
                  onChange={e => set('freeFirstChapter', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>🎁 Free First Chapter</span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
                    Let readers read Chapter 1 for free before buying the full series
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox"
                  checked={draft.allowIndividualPurchase}
                  onChange={e => set('allowIndividualPurchase', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>
                    Allow Individual Chapter Purchases
                  </span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
                    Shows "Buy Individual Chapters" tab on the book detail page
                  </span>
                </div>
              </label>

              {draft.allowIndividualPurchase && (
                <div style={{ paddingLeft: 26 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Per-Chapter Price Override (KSh)
                  </label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="field" type="number" min={0}
                      value={draft.chapterPriceOverride || ''}
                      onChange={e => set('chapterPriceOverride', Number(e.target.value))}
                      placeholder="0 = auto-calculate"
                      style={{ maxWidth: 180 }}
                    />
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      Auto price: <strong style={{ color: 'var(--gold)' }}>KSh {draft.autoChapterPrice}</strong>
                      <span style={{ marginLeft: 6, fontSize: '0.7rem' }}>
                        ({draft.price} ÷ {draft.totalChapters || '?'} chapters, rounded to nearest 5)
                      </span>
                    </div>
                  </div>
                  <small style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>
                    Leave 0 to use auto-calculated price. Set a value to override it.
                  </small>
                </div>
              )}
            </div>

            {/* ── TOC Release Toggles ── */}
            {(draft.tableOfContents || []).length > 0 && (
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ fontSize: '0.88rem', color: 'var(--gold)' }}>📋 Chapter Release Control</h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={releaseAll}>Release All</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={releaseNone}>Lock All</button>
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 14 }}>
                  Toggle each chapter to mark it as released (visible to buyers) or coming soon (locked).
                  <strong style={{ color: '#4a9eff' }}> Released count auto-updates.</strong>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                  {(() => {
                    let chNum = 0;
                    return (draft.tableOfContents || []).map((item, i) => {
                      if (isPart(item)) {
                        return (
                          <div key={i} style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, padding: '6px 4px 2px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
                            {item}
                          </div>
                        );
                      }
                      chNum++;
                      const curNum = chNum;
                      const isReleased = (draft.releasedTocIndices || []).includes(i);
                      const chapTitle = item.replace(/^(Chapter \d+|Day \d+|Story \d+) — /, '');
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8,
                          background: isReleased ? 'rgba(46,204,113,0.06)' : 'rgba(255,255,255,0.02)',
                          border: isReleased ? '1px solid rgba(46,204,113,0.25)' : '1px solid var(--border)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }} onClick={() => toggleReleasedIndex(i)}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isReleased ? 'var(--ok)' : 'var(--muted)', minWidth: 24 }}>
                            {String(curNum).padStart(2, '0')}
                          </span>
                          <span style={{ flex: 1, fontSize: '0.83rem', color: isReleased ? 'var(--text)' : 'var(--muted)' }}>
                            {chapTitle}
                          </span>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '2px 10px', borderRadius: 10,
                            background: isReleased ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.04)',
                            color: isReleased ? 'var(--ok)' : 'var(--muted)',
                            border: isReleased ? '1px solid rgba(46,204,113,0.3)' : '1px solid var(--border)',
                          }}>
                            {isReleased ? '✓ Released' : '🔒 Coming Soon'}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#4a9eff', fontWeight: 600 }}>
                  {(draft.releasedTocIndices || []).length} of {(draft.tableOfContents || []).filter(t => !isPart(t)).length} chapters released
                </div>
              </div>
            )}

            {/* ── New Chapter Notification ── */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '0.88rem', color: 'var(--gold)', marginBottom: 4 }}>🔔 New Chapter Notification</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 12 }}>
                Queue a notification for readers who clicked "Notify When Complete". Admin will send it via the Messages panel.
              </p>
              <textarea className="field"
                rows={3}
                value={notifyMsg}
                onChange={e => setNotifyMsg(e.target.value)}
                placeholder={`e.g. Chapter ${(draft.chaptersReleased || 0) + 1} of "${draft.title}" is now live! Head to your library to read it.`}
                style={{ resize: 'vertical', marginBottom: 10 }}
              />
              <button className="btn btn-primary btn-sm"
                onClick={sendNewChapterNotification}
                disabled={sendingNotify || !notifyMsg.trim()}
              >
                {sendingNotify ? '⏳ Queuing…' : '📢 Queue Notification'}
              </button>
            </div>

            {/* ── User Chapter Access ── */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '0.88rem', color: 'var(--gold)', marginBottom: 12 }}>👥 Per-User Chapter Access</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 12 }}>
                Admin can manually override chapter access for individual readers — grant early access, unlock chapters without purchase, or restrict chapters.
              </p>
              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(201,168,76,0.2)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  💡 User access management coming in next update — use the Messages panel to contact readers in the meantime
                </span>
              </div>
            </div>

            {/* ── Save bar ── */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', position: 'sticky', bottom: 16 }}>
              <button className="btn btn-ghost" onClick={() => { setSelected(null); setDraft(null); }}>
                Close
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}
                style={{ minWidth: 140 }}>
                {saving ? '⏳ Saving…' : '💾 Save Series Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
