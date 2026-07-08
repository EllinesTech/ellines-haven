/**
 * BookReviews — user-facing star ratings + written reviews.
 * Reviews are stored in Firestore: reviews/{bookId}/entries/{userEmail_bookId}
 * Pending reviews are shown immediately (optimistic) then confirmed on snapshot.
 */
import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  collection, doc, setDoc, onSnapshot,
  serverTimestamp, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import './BookReviews.css';

const STARS = [1, 2, 3, 4, 5];

function StarPicker({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="br-star-picker" aria-label="Star rating">
      {STARS.map(s => (
        <button
          key={s}
          type="button"
          className={'br-star' + (s <= (hover || value) ? ' filled' : '')}
          onClick={() => !readonly && onChange(s)}
          onMouseEnter={() => !readonly && setHover(s)}
          onMouseLeave={() => !readonly && setHover(0)}
          disabled={readonly}
          aria-label={`${s} star${s !== 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (ts?.toMillis ? ts.toMillis() : ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts?.toMillis ? ts.toMillis() : ts).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BookReviews({ book }) {
  const { user, myPerms, isOwned } = useApp();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ rating: 0, text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const colRef = collection(db, 'reviews', String(book.id), 'entries');

  // Real-time reviews listener
  useEffect(() => {
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(30));
    const unsub = onSnapshot(q, snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Has user already reviewed?
  const myReview = user
    ? reviews.find(r => r.userEmail === user.email.toLowerCase())
    : null;

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : book.rating || '0';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!user) { window.location.href = '/login'; return; }
    if (myPerms?.canReview === false) { setError('Review permission is currently disabled on your account.'); return; }
    if (form.rating === 0) { setError('Please select a star rating.'); return; }
    if (form.text.trim().length < 10) { setError('Please write at least 10 characters.'); return; }

    setSubmitting(true);
    try {
      const entryId = `${user.email.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${book.id}`;
      await setDoc(doc(db, 'reviews', String(book.id), 'entries', entryId), {
        userEmail: user.email.toLowerCase(),
        userName: user.name,
        bookId: book.id,
        bookTitle: book.title,
        rating: form.rating,
        text: form.text.trim(),
        owned: isOwned(book.id),
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
      setForm({ rating: 0, text: '' });
      setShowForm(false);

      // Track review submission in admin activity feed
      try {
        const { trackActivity, NOTIFICATION_CATEGORIES } = await import('../utils/adminActivityTracker');
        trackActivity({
          category: NOTIFICATION_CATEGORIES.REVIEW_SUBMITTED,
          title: 'Review Submitted',
          message: `${user.name} reviewed "${book.title}" — ${form.rating}★`,
          userEmail: user.email,
          userName: user.name,
          metadata: { bookId: book.id, bookTitle: book.title, rating: form.rating },
          priority: 'low',
        }).catch(() => {});
      } catch {}
    } catch (err) {
      setError('Could not submit review. Please try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const ratingCounts = STARS.map(s => ({
    star: s,
    count: reviews.filter(r => r.rating === s).length,
  })).reverse();
  const maxCount = Math.max(...ratingCounts.map(r => r.count), 1);

  return (
    <section className="br-section">
      <h2 className="br-heading">
        Reader Reviews
        <span className="br-count">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
      </h2>

      {/* ── Summary row ── */}
      <div className="br-summary">
        <div className="br-avg-block">
          <span className="br-avg-number">{avgRating}</span>
          <StarPicker value={Math.round(Number(avgRating))} readonly />
          <span className="br-avg-label">{reviews.length} rating{reviews.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="br-bars">
          {ratingCounts.map(({ star, count }) => (
            <div key={star} className="br-bar-row">
              <span className="br-bar-label">{star}★</span>
              <div className="br-bar-track">
                <div
                  className="br-bar-fill"
                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                />
              </div>
              <span className="br-bar-count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Write a review ── */}
      {user && !myReview && myPerms?.canReview !== false && (
        <div className="br-write">
          {!showForm ? (
            <button className="btn btn-outline btn-sm" onClick={() => setShowForm(true)}>
              ✍️ Write a Review
            </button>
          ) : (
            <form className="br-form" onSubmit={handleSubmit}>
              <h4>Your Review</h4>
              <StarPicker value={form.rating} onChange={r => setForm(f => ({ ...f, rating: r }))} />
              <textarea
                className="br-textarea"
                placeholder="Share your thoughts about this book… (min 10 characters)"
                value={form.text}
                onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                rows={4}
                maxLength={1000}
              />
              <div className="br-form-footer">
                <span className="br-char-count">{form.text.length}/1000</span>
                {error && <span className="br-error">{error}</span>}
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {submitted && (
        <div className="br-success">
          ✅ Thank you! Your review has been submitted.
        </div>
      )}

      {myReview && (
        <div className="br-my-review">
          <strong>Your review:</strong>
          <StarPicker value={myReview.rating} readonly />
          <p>"{myReview.text}"</p>
        </div>
      )}

      {!user && (
        <p className="br-login-prompt">
          <a href="/login">Sign in</a> to leave a review.
        </p>
      )}

      {/* ── Reviews list ── */}
      {loading ? (
        <div className="br-loading">Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <p className="br-empty">No reviews yet. Be the first to share your thoughts!</p>
      ) : (
        <div className="br-list">
          {reviews.map(r => (
            <div key={r.id} className={'br-card' + (r.userEmail === user?.email?.toLowerCase() ? ' br-card--mine' : '')}>
              <div className="br-card-header">
                <div className="br-avatar">{(r.userName || 'R').charAt(0).toUpperCase()}</div>
                <div className="br-card-meta">
                  <strong className="br-card-name">
                    {r.userName || 'Reader'}
                    {r.owned && <span className="br-verified-badge">✓ Verified Reader</span>}
                    {r.userEmail === user?.email?.toLowerCase() && <span className="br-mine-badge">You</span>}
                  </strong>
                  <span className="br-card-date">{timeAgo(r.createdAt)}</span>
                </div>
                <StarPicker value={r.rating} readonly />
              </div>
              <p className="br-card-text">"{r.text}"</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
