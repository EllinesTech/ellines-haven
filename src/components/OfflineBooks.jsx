/**
 * Offline Books Component
 * Shows downloaded/saved books that can be read offline
 * Displays storage usage and allows deletion
 */

import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  getOfflineBooks,
  deleteOfflineBook,
  getOfflineStorageStats,
  isBookSavedOffline,
} from '../utils/offlineStorage';
import '../styles/OfflineBooks.css';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default function OfflineBooks() {
  const { user } = useApp();
  const [offlineBooks, setOfflineBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Load offline books on mount
  useEffect(() => {
    if (!user?.email) return;

    const load = async () => {
      try {
        const books = await getOfflineBooks(user.email);
        setOfflineBooks(books);

        const s = await getOfflineStorageStats(user.email);
        setStats(s);
      } catch (err) {
        console.error('[OfflineBooks] Load failed:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.email]);

  const handleDelete = async (bookId) => {
    if (!user?.email) return;
    setDeleting(bookId);

    try {
      await deleteOfflineBook(user.email, bookId);
      setOfflineBooks(prev => prev.filter(b => b.bookId !== bookId));
      
      // Refresh stats
      const s = await getOfflineStorageStats(user.email);
      setStats(s);
    } catch (err) {
      console.error('[OfflineBooks] Delete failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="offline-books">
        <div className="ob-header">
          <h3>📱 Offline / Downloaded Books</h3>
        </div>
        <div className="ob-loading">Loading your offline books...</div>
      </div>
    );
  }

  if (!offlineBooks || offlineBooks.length === 0) {
    return (
      <div className="offline-books">
        <div className="ob-header">
          <h3>📱 Offline / Downloaded Books</h3>
        </div>
        <div className="ob-empty">
          <p>No books saved for offline reading yet.</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
            Download books from your library to read them even without internet connection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="offline-books">
      <div className="ob-header">
        <h3>📱 Offline / Downloaded Books</h3>
        {stats && (
          <div className="ob-stats">
            <span className="stat">
              📚 {stats.books.length} book{stats.books.length !== 1 ? 's' : ''}
            </span>
            <span className="stat">
              💾 {stats.estimatedMB} MB
            </span>
          </div>
        )}
      </div>

      <div className="ob-list">
        {offlineBooks.map(book => (
          <div key={book.id} className="ob-item">
            <div className="ob-item-cover">
              {book.cover && (
                <img src={book.cover} alt={book.title} />
              )}
              {!book.cover && (
                <div className="ob-item-cover-placeholder">
                  📖
                </div>
              )}
            </div>

            <div className="ob-item-content">
              <h4 className="ob-item-title">{book.title}</h4>
              {book.author && (
                <p className="ob-item-author">by {book.author}</p>
              )}
              
              <div className="ob-item-meta">
                {book.chapters && (
                  <span className="meta-badge">
                    {Array.isArray(book.chapters) ? book.chapters.length : 0} chapters
                  </span>
                )}
                {book.savedAt && (
                  <span className="meta-badge">
                    Downloaded {new Date(book.savedAt).toLocaleDateString()}
                  </span>
                )}
                {book.fileSize && (
                  <span className="meta-badge">
                    {formatBytes(book.fileSize)}
                  </span>
                )}
              </div>

              {book.readProgress && (
                <div className="ob-item-progress">
                  <small>
                    Last read: {book.readProgress.chapter > 0 ? `Chapter ${book.readProgress.chapter + 1}` : 'Not started'}
                  </small>
                </div>
              )}
            </div>

            <div className="ob-item-actions">
              <button
                className="btn btn-icon btn-secondary"
                title="Delete from offline storage"
                onClick={() => handleDelete(book.bookId)}
                disabled={deleting === book.bookId}
              >
                {deleting === book.bookId ? '⏳' : '🗑️'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {stats && (
        <div className="ob-storage-info">
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            📦 Storage: {stats.estimatedMB} MB used (browser storage is shared across sites and may be cleared)
          </p>
        </div>
      )}
    </div>
  );
}
