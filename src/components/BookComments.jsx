import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';

/**
 * BOOK COMMENTS COMPONENT (Phase 3)
 * 
 * Displays and allows readers to post comments on books.
 * Features:
 * - View all approved comments
 * - Post new comments (with rating)
 * - Delete own comments
 * - Filter by rating
 */

export default function BookComments({ bookId, bookTitle }) {
  const { user } = useApp();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [filterRating, setFilterRating] = useState('all');

  useEffect(() => {
    loadComments();
  }, [bookId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'book_comments'),
        where('bookId', '==', bookId),
        where('status', '==', 'approved'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Error loading comments:', e);
      setComments([]);
    }
    setLoading(false);
  };

  const postComment = async () => {
    if (!user) {
      alert('Please log in to post a comment.');
      return;
    }

    if (!newComment.trim()) {
      alert('Please write a comment.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'book_comments'), {
        bookId,
        bookTitle,
        author: user.name || user.email.split('@')[0],
        authorEmail: user.email,
        text: newComment,
        rating: newRating,
        status: 'pending', // Requires moderation
        createdAt: serverTimestamp(),
      });
      setNewComment('');
      setNewRating(5);
      alert('✅ Comment posted! Admin will review it before it appears.');
    } catch (e) {
      console.error('Error posting comment:', e);
      alert('❌ Failed to post comment.');
    }
    setSubmitting(false);
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteDoc(doc(db, 'book_comments', commentId));
      loadComments();
    } catch (e) {
      console.error('Error deleting comment:', e);
      alert('❌ Failed to delete comment.');
    }
  };

  const filtered = filterRating === 'all'
    ? comments
    : comments.filter(c => c.rating === parseInt(filterRating));

  return (
    <div className="book-comments">
      <h2>💬 Reader Comments</h2>

      {/* Post Comment */}
      {user ? (
        <div className="book-comments-form card">
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem', fontWeight: 600 }}>
              Your Rating
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setNewRating(n)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    opacity: n <= newRating ? 1 : 0.4,
                    transition: 'opacity 0.15s',
                  }}
                >
                  ⭐
                </button>
              ))}
              <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: '0.85rem' }}>
                {newRating}/5
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Share your thoughts about this book..."
              style={{
                width: '100%',
                minHeight: 80,
                padding: 12,
                border: '1px solid rgba(201,168,76,0.3)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text)',
                borderRadius: 'var(--r-sm)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>

          <button
            onClick={postComment}
            disabled={submitting}
            className="btn btn-primary btn-sm"
            style={{ opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? '⏳ Posting…' : '📤 Post Comment'}
          </button>
          <small style={{ display: 'block', marginTop: 8, color: 'var(--muted)' }}>
            Comments are moderated before appearing.
          </small>
        </div>
      ) : (
        <div style={{
          padding: 16,
          background: 'rgba(201,168,76,0.1)',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 'var(--r)',
          marginBottom: 16,
          fontSize: '0.9rem',
          color: 'var(--text)',
        }}>
          <a href="/login" style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
            Log in
          </a>
          {' '}to post a comment.
        </div>
      )}

      {/* Filter */}
      {comments.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Filter:</label>
          <select
            value={filterRating}
            onChange={e => setFilterRating(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid rgba(201,168,76,0.3)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text)',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            <option value="all">All Ratings</option>
            <option value="5">⭐⭐⭐⭐⭐ 5 Stars</option>
            <option value="4">⭐⭐⭐⭐ 4 Stars</option>
            <option value="3">⭐⭐⭐ 3 Stars</option>
            <option value="2">⭐⭐ 2 Stars</option>
            <option value="1">⭐ 1 Star</option>
          </select>
        </div>
      )}

      {/* Comments List */}
      <div className="book-comments-list">
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
            Loading comments…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
            {comments.length === 0 ? 'No comments yet. Be the first!' : 'No comments with that rating.'}
          </div>
        ) : (
          filtered.map(comment => (
            <div
              key={comment.id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 'var(--r)',
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                    {comment.author}
                  </strong>
                  <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 2 }}>
                    {new Date(comment.createdAt?.seconds * 1000).toLocaleDateString()} · {'⭐'.repeat(comment.rating)}
                  </div>
                </div>
                {user && user.email === comment.authorEmail && (
                  <button
                    onClick={() => deleteComment(comment.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#e74c3c',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      padding: 0,
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
              <p style={{
                fontSize: '0.9rem',
                color: 'var(--text)',
                lineHeight: 1.5,
                margin: 0,
              }}>
                {comment.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
