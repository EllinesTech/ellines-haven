import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, getDocs, collection, query, where, orderBy, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * COMMENT THREADS PANEL (Phase 3)
 * 
 * Admin panel to:
 * - Moderate comments on books
 * - View comment statistics
 * - Flag/approve comments
 * - Manage spam and inappropriate content
 */

export default function CommentThreadsPanel({ showToast, books, isSuper }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, approved, flagged
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, flagged: 0 });
  const [actionInProgress, setActionInProgress] = useState(null);

  useEffect(() => {
    loadComments();
  }, [filter]);

  const loadComments = async () => {
    setLoading(true);
    try {
      // Fetch ALL comments without composite index requirement
      // (orderBy alone doesn't need an index, only orderBy + where does)
      const q = query(collection(db, 'book_comments'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const allComments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filter on client side to avoid composite index requirement
      const filtered = filter === 'all' 
        ? allComments 
        : allComments.filter(c => c.status === filter);
      
      setComments(filtered);

      // Calculate stats
      setStats({
        total: allComments.length,
        pending: allComments.filter(c => c.status === 'pending').length,
        approved: allComments.filter(c => c.status === 'approved').length,
        flagged: allComments.filter(c => c.status === 'flagged').length,
      });
    } catch (e) {
      showToast?.('❌ Failed to load comments: ' + e.message);
    }
    setLoading(false);
  };

  const updateStats = async () => {
    try {
      const allSnap = await getDocs(collection(db, 'book_comments'));
      const allDocs = allSnap.docs.map(d => d.data());
      setStats({
        total: allDocs.length,
        pending: allDocs.filter(c => c.status === 'pending').length,
        approved: allDocs.filter(c => c.status === 'approved').length,
        flagged: allDocs.filter(c => c.status === 'flagged').length,
      });
    } catch (e) {
      console.error('Failed to update stats:', e);
    }
  };

  const approveComment = async (commentId) => {
    setActionInProgress(commentId);
    try {
      // Optimistic update: remove from current view if filtering by status
      setComments(prev => prev.filter(c => c.id !== commentId));
      
      await updateDoc(doc(db, 'book_comments', commentId), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });
      showToast?.('✅ Comment approved');
      await updateStats();
    } catch (e) {
      showToast?.('❌ Failed: ' + e.message);
      // Reload on error to restore UI
      await loadComments();
    } finally {
      setActionInProgress(null);
    }
  };

  const flagComment = async (commentId, reason) => {
    setActionInProgress(commentId);
    try {
      // Optimistic update: remove from current view if filtering by status
      setComments(prev => prev.filter(c => c.id !== commentId));
      
      await updateDoc(doc(db, 'book_comments', commentId), {
        status: 'flagged',
        flagReason: reason,
        updatedAt: serverTimestamp(),
      });
      showToast?.('✅ Comment flagged for review');
      await updateStats();
    } catch (e) {
      showToast?.('❌ Failed: ' + e.message);
      // Reload on error to restore UI
      await loadComments();
    } finally {
      setActionInProgress(null);
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    setActionInProgress(commentId);
    try {
      // Optimistic update: remove from current view
      setComments(prev => prev.filter(c => c.id !== commentId));
      
      await deleteDoc(doc(db, 'book_comments', commentId));
      showToast?.('✅ Comment deleted');
      await updateStats();
    } catch (e) {
      showToast?.('❌ Failed: ' + e.message);
      // Reload on error to restore UI
      await loadComments();
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>💬</div>
        <p>Loading comments…</p>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>💬 Comment Moderation</h1>
          <span className="adm-page-sub">
            Review and moderate reader comments on books.
          </span>
        </div>
      </div>

      {/* Statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 'var(--r)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>💬</div>
          <strong style={{ display: 'block', marginBottom: 4 }}>{stats.total}</strong>
          <small style={{ color: 'var(--muted)' }}>Total Comments</small>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 'var(--r)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⏳</div>
          <strong style={{ display: 'block', marginBottom: 4, color: '#e8832a' }}>{stats.pending}</strong>
          <small style={{ color: 'var(--muted)' }}>Pending</small>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 'var(--r)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>✅</div>
          <strong style={{ display: 'block', marginBottom: 4, color: '#2ecc71' }}>{stats.approved}</strong>
          <small style={{ color: 'var(--muted)' }}>Approved</small>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 'var(--r)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🚩</div>
          <strong style={{ display: 'block', marginBottom: 4, color: '#e74c3c' }}>{stats.flagged}</strong>
          <small style={{ color: 'var(--muted)' }}>Flagged</small>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {['all', 'pending', 'approved', 'flagged'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              border: filter === f ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,0.2)',
              background: filter === f ? 'rgba(201,168,76,0.1)' : 'transparent',
              color: filter === f ? 'var(--gold)' : 'var(--muted)',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Comments List */}
      {comments.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
          <p>No comments in this filter.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {comments.map(comment => {
            const book = books.find(b => b.id === comment.bookId);
            return (
              <div
                key={comment.id}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 'var(--r)',
                  padding: 16,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 4 }}>
                      {comment.author} on "{book?.title || 'Unknown'}"
                    </strong>
                    <small style={{ color: 'var(--muted)' }}>
                      {new Date(comment.createdAt?.seconds * 1000).toLocaleDateString()} •{' '}
                      <span style={{
                        background: comment.status === 'approved' ? 'rgba(46,204,113,0.2)' : 
                                   comment.status === 'pending' ? 'rgba(232,131,42,0.2)' :
                                   'rgba(231,76,60,0.2)',
                        color: comment.status === 'approved' ? '#2ecc71' :
                               comment.status === 'pending' ? '#e8832a' :
                               '#e74c3c',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}>
                        {comment.status.toUpperCase()}
                      </span>
                    </small>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    ⭐ {comment.rating}
                  </div>
                </div>

                {/* Comment Text */}
                <p style={{ fontSize: '0.85rem', color: 'var(--text)', marginBottom: 12, lineHeight: 1.5 }}>
                  "{comment.text}"
                </p>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {comment.status !== 'approved' && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ 
                        color: '#2ecc71', 
                        borderColor: 'rgba(46,204,113,0.3)',
                        opacity: actionInProgress === comment.id ? 0.5 : 1,
                        cursor: actionInProgress === comment.id ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => approveComment(comment.id)}
                      disabled={actionInProgress === comment.id}
                    >
                      {actionInProgress === comment.id ? '⏳ Approving…' : '✅ Approve'}
                    </button>
                  )}
                  {comment.status !== 'flagged' && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ 
                        color: '#e8832a', 
                        borderColor: 'rgba(232,131,42,0.3)',
                        opacity: actionInProgress === comment.id ? 0.5 : 1,
                        cursor: actionInProgress === comment.id ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => flagComment(comment.id, 'inappropriate')}
                      disabled={actionInProgress === comment.id}
                    >
                      {actionInProgress === comment.id ? '⏳ Flagging…' : '🚩 Flag'}
                    </button>
                  )}
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ 
                      color: '#e74c3c', 
                      borderColor: 'rgba(231,76,60,0.3)',
                      opacity: actionInProgress === comment.id ? 0.5 : 1,
                      cursor: actionInProgress === comment.id ? 'not-allowed' : 'pointer'
                    }}
                    onClick={() => deleteComment(comment.id)}
                    disabled={actionInProgress === comment.id}
                  >
                    {actionInProgress === comment.id ? '⏳ Deleting…' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '40px 20px', marginTop: 40, color: 'var(--muted)', fontSize: '0.82rem' }}>
        💡 Comments are automatically hidden until approved. Flagged comments are reviewed by moderation team.
      </div>
    </div>
  );
}
