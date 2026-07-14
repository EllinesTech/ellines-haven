import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  grantChaptersToUser,
  disableBookForUser,
  removeBookGrant,
  bulkGrantChapters,
  setFirstChapterFree,
  scheduleChapterRelease,
  getGrantedChapters,
} from '../../hooks/useChapterGrants';
import { doc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import './ChapterGrantsPanel.css';

export default function ChapterGrantsPanel({ showToast, books, isSuper }) {
  const { user } = useApp();
  const [tab, setTab] = useState('grant-user');
  const [loading, setLoading] = useState(false);

  // ── Grant to Single User ─────────────────────────────────────────────────
  const [targetEmail, setTargetEmail] = useState('');
  const [selectedBook, setSelectedBook] = useState('');
  const [grantType, setGrantType] = useState('all'); // 'all' | 'specific' | 'disable'
  const [specificChapters, setSpecificChapters] = useState('');
  const [granting, setGranting] = useState(false);

  // ── Bulk Grant ───────────────────────────────────────────────────────────
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkBook, setBulkBook] = useState('');
  const [bulkGrantType, setBulkGrantType] = useState('all');
  const [bulkChapters, setBulkChapters] = useState('');
  const [bulkGranting, setBulkGranting] = useState(false);

  // ── Free First Chapter ───────────────────────────────────────────────────
  const [freeFirstChapters, setFreeFirstChapters] = useState({});
  const [updatingFree, setUpdatingFree] = useState(null);

  // ── Schedule Release ─────────────────────────────────────────────────────
  const [scheduleBook, setScheduleBook] = useState('');
  const [scheduleChapter, setScheduleChapter] = useState(0);
  const [releaseDate, setReleaseDate] = useState('');
  const [scheduling, setScheduling] = useState(false);

  // Load existing free first chapter settings
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'site_data', 'book_settings'));
        // This would need proper implementation
      } catch (err) {
        console.error('[ChapterGrants] Load free chapters failed:', err);
      }
    };
    load();
  }, []);

  const handleGrantToUser = async () => {
    if (!targetEmail || !selectedBook) {
      showToast('Please enter user email and select a book', 'error');
      return;
    }

    setGranting(true);
    try {
      const chapters =
        grantType === 'all'
          ? 'all'
          : grantType === 'disable'
          ? []
          : specificChapters
              .split(',')
              .map((c) => parseInt(c.trim()))
              .filter((n) => !isNaN(n));

      if (grantType === 'specific' && chapters.length === 0) {
        showToast('Please enter chapter numbers (comma-separated)', 'error');
        setGranting(false);
        return;
      }

      if (grantType === 'disable') {
        await disableBookForUser(targetEmail, selectedBook, user?.email);
        showToast(`Book disabled for ${targetEmail}`, 'success');
      } else {
        await grantChaptersToUser(targetEmail, selectedBook, chapters, user?.email);
        const label = chapters === 'all' ? 'all chapters' : `${chapters.length} chapter(s)`;
        showToast(`Granted ${label} to ${targetEmail}`, 'success');
      }

      // Clear form
      setTargetEmail('');
      setSelectedBook('');
      setGrantType('all');
      setSpecificChapters('');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setGranting(false);
    }
  };

  const handleBulkGrant = async () => {
    if (!bulkEmails || !bulkBook) {
      showToast('Please enter emails and select a book', 'error');
      return;
    }

    setBulkGranting(true);
    try {
      const emails = bulkEmails
        .split('\n')
        .map((e) => e.trim())
        .filter((e) => e && e.includes('@'));

      if (emails.length === 0) {
        showToast('No valid emails found', 'error');
        setBulkGranting(false);
        return;
      }

      const chapters =
        bulkGrantType === 'all'
          ? 'all'
          : bulkChapters
              .split(',')
              .map((c) => parseInt(c.trim()))
              .filter((n) => !isNaN(n));

      if (bulkGrantType === 'specific' && chapters.length === 0) {
        showToast('Please enter chapter numbers', 'error');
        setBulkGranting(false);
        return;
      }

      const result = await bulkGrantChapters(emails, bulkBook, chapters, user?.email);
      showToast(
        `Granted to ${result.success.length} users${result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}`,
        result.failed.length === 0 ? 'success' : 'warning'
      );

      if (result.failed.length > 0) {
        console.warn('[ChapterGrants] Failed grants:', result.failed);
      }

      // Clear form
      setBulkEmails('');
      setBulkBook('');
      setBulkGrantType('all');
      setBulkChapters('');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setBulkGranting(false);
    }
  };

  const handleSetFirstFree = async (bookId, isFree) => {
    setUpdatingFree(bookId);
    try {
      await setFirstChapterFree(bookId, isFree, user?.email);
      setFreeFirstChapters((prev) => ({
        ...prev,
        [bookId]: isFree,
      }));
      showToast(
        `First chapter ${isFree ? 'enabled' : 'disabled'} for ${books.find((b) => b.id === bookId)?.title}`,
        'success'
      );
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setUpdatingFree(null);
    }
  };

  const handleScheduleRelease = async () => {
    if (!scheduleBook || releaseDate === '') {
      showToast('Please select book and release date', 'error');
      return;
    }

    setScheduling(true);
    try {
      await scheduleChapterRelease(scheduleBook, scheduleChapter, releaseDate, user?.email);
      const book = books.find((b) => b.id === scheduleBook);
      showToast(
        `Release scheduled for ${book?.title} Chapter ${scheduleChapter + 1} on ${new Date(releaseDate).toLocaleDateString()}`,
        'success'
      );

      // Clear form
      setScheduleBook('');
      setScheduleChapter(0);
      setReleaseDate('');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="admin-panel">
      <div className="ap-header">
        <h2>📚 Chapter Grants Manager</h2>
        <p>Grant or restrict chapter access to users, set free chapters, and schedule releases</p>
      </div>

      <div className="ap-tabs">
        <button
          className={`ap-tab ${tab === 'grant-user' ? 'active' : ''}`}
          onClick={() => setTab('grant-user')}
        >
          Grant to User
        </button>
        <button className={`ap-tab ${tab === 'bulk-grant' ? 'active' : ''}`} onClick={() => setTab('bulk-grant')}>
          Bulk Grant
        </button>
        <button className={`ap-tab ${tab === 'free-chapters' ? 'active' : ''}`} onClick={() => setTab('free-chapters')}>
          Free Chapters
        </button>
        <button
          className={`ap-tab ${tab === 'schedule-release' ? 'active' : ''}`}
          onClick={() => setTab('schedule-release')}
        >
          Schedule Releases
        </button>
      </div>

      {/* ── Grant to Single User ────────────────────────────────────────────── */}
      {tab === 'grant-user' && (
        <div className="ap-content">
          <div className="form-group">
            <label>User Email</label>
            <input
              type="email"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>

          <div className="form-group">
            <label>Book</label>
            <select value={selectedBook} onChange={(e) => setSelectedBook(e.target.value)}>
              <option value="">Select a book...</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Grant Type</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="all"
                  checked={grantType === 'all'}
                  onChange={(e) => setGrantType(e.target.value)}
                />
                All Chapters
              </label>
              <label>
                <input
                  type="radio"
                  value="specific"
                  checked={grantType === 'specific'}
                  onChange={(e) => setGrantType(e.target.value)}
                />
                Specific Chapters
              </label>
              <label>
                <input
                  type="radio"
                  value="disable"
                  checked={grantType === 'disable'}
                  onChange={(e) => setGrantType(e.target.value)}
                />
                Disable Book
              </label>
            </div>
          </div>

          {grantType === 'specific' && (
            <div className="form-group">
              <label>Chapter Numbers (comma-separated, 0-indexed)</label>
              <input
                type="text"
                value={specificChapters}
                onChange={(e) => setSpecificChapters(e.target.value)}
                placeholder="0, 1, 2"
              />
            </div>
          )}

          <button className="btn btn-primary" onClick={handleGrantToUser} disabled={granting}>
            {granting ? '⏳ Granting...' : '✓ Grant Access'}
          </button>
        </div>
      )}

      {/* ── Bulk Grant ──────────────────────────────────────────────────────── */}
      {tab === 'bulk-grant' && (
        <div className="ap-content">
          <div className="form-group">
            <label>User Emails (one per line)</label>
            <textarea
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
              rows={8}
            />
          </div>

          <div className="form-group">
            <label>Book</label>
            <select value={bulkBook} onChange={(e) => setBulkBook(e.target.value)}>
              <option value="">Select a book...</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Grant Type</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="all"
                  checked={bulkGrantType === 'all'}
                  onChange={(e) => setBulkGrantType(e.target.value)}
                />
                All Chapters
              </label>
              <label>
                <input
                  type="radio"
                  value="specific"
                  checked={bulkGrantType === 'specific'}
                  onChange={(e) => setBulkGrantType(e.target.value)}
                />
                Specific Chapters
              </label>
            </div>
          </div>

          {bulkGrantType === 'specific' && (
            <div className="form-group">
              <label>Chapter Numbers (comma-separated, 0-indexed)</label>
              <input
                type="text"
                value={bulkChapters}
                onChange={(e) => setBulkChapters(e.target.value)}
                placeholder="0, 1, 2"
              />
            </div>
          )}

          <button className="btn btn-primary" onClick={handleBulkGrant} disabled={bulkGranting}>
            {bulkGranting ? '⏳ Processing...' : '✓ Bulk Grant Access'}
          </button>
        </div>
      )}

      {/* ── Free Chapters ───────────────────────────────────────────────────── */}
      {tab === 'free-chapters' && (
        <div className="ap-content">
          <p>Set the first chapter as free for all users to read:</p>
          <div style={{ display: 'grid', gap: '10px', marginTop: '20px' }}>
            {books.map((book) => (
              <div
                key={book.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  background: 'var(--subtle-bg)',
                  borderRadius: '4px',
                }}
              >
                <div>
                  <strong>{book.title}</strong>
                  {book.chapters?.length > 0 && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>First chapter</p>}
                </div>
                <button
                  className={`btn ${freeFirstChapters[book.id] ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => handleSetFirstFree(book.id, !freeFirstChapters[book.id])}
                  disabled={updatingFree === book.id}
                >
                  {updatingFree === book.id
                    ? '⏳'
                    : freeFirstChapters[book.id]
                      ? '✓ Free'
                      : 'Enable Free'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Schedule Release ────────────────────────────────────────────────── */}
      {tab === 'schedule-release' && (
        <div className="ap-content">
          <p>Schedule automatic chapter releases on specific dates:</p>

          <div className="form-group">
            <label>Book</label>
            <select value={scheduleBook} onChange={(e) => setScheduleBook(e.target.value)}>
              <option value="">Select a book...</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.chapters?.length || 0} chapters)
                </option>
              ))}
            </select>
          </div>

          {scheduleBook && (
            <div className="form-group">
              <label>Chapter</label>
              <select value={scheduleChapter} onChange={(e) => setScheduleChapter(parseInt(e.target.value))}>
                {books
                  .find((b) => b.id === scheduleBook)
                  ?.chapters?.map((ch, i) => (
                    <option key={i} value={i}>
                      Chapter {i + 1}: {ch.title || 'Untitled'}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Release Date & Time</label>
            <input
              type="datetime-local"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" onClick={handleScheduleRelease} disabled={scheduling}>
            {scheduling ? '⏳ Scheduling...' : '📅 Schedule Release'}
          </button>
        </div>
      )}
    </div>
  );
}
