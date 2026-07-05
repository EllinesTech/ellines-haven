/**
 * Wishlist page — /wishlist
 * Shows all books the user has marked "Want to Read".
 */
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BookCard from '../components/BookCard';
import './Wishlist.css';

export default function Wishlist() {
  const { user, wishlist, toggleWishlist, books: catalog } = useApp();

  if (!user) {
    return (
      <main className="wl-page">
        <div className="container wl-gate">
          <div className="wl-gate-icon">♡</div>
          <h2>Your Wishlist</h2>
          <p>Sign in to save books you want to read later.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login" className="btn btn-primary">Sign In</Link>
            <Link to="/register" className="btn btn-outline">Create Account</Link>
          </div>
        </div>
      </main>
    );
  }

  // Enrich wishlist entries with latest catalog data
  const enriched = wishlist.map(w => {
    const live = catalog.find(b => b.id === w.id);
    return live ? { ...w, ...live } : w;
  });

  return (
    <main className="wl-page">
      {/* Hero */}
      <div className="wl-hero">
        <div className="wl-hero-glow" />
        <div className="container wl-hero-inner">
          <div>
            <h1>♥ My Wishlist</h1>
            <p>
              {enriched.length > 0
                ? `${enriched.length} book${enriched.length !== 1 ? 's' : ''} on your wishlist`
                : 'Add books you want to read later'}
            </p>
          </div>
          <Link to="/library" className="btn btn-outline btn-sm">
            Browse More Books →
          </Link>
        </div>
      </div>

      <div className="container wl-body">
        {enriched.length === 0 ? (
          <div className="wl-empty">
            <div className="wl-empty-icon">♡</div>
            <h3>Your wishlist is empty</h3>
            <p>
              Browse the library and tap the heart icon on any book to add it here.
            </p>
            <Link to="/library" className="btn btn-primary">Browse Library</Link>
          </div>
        ) : (
          <>
            <div className="wl-grid">
              {enriched.map(book => (
                <div key={book.id} className="wl-item">
                  <BookCard book={book} />
                  <button
                    className="wl-remove-btn"
                    onClick={() => toggleWishlist(book)}
                    title="Remove from wishlist"
                    aria-label={`Remove ${book.title} from wishlist`}
                  >
                    🗑 Remove
                  </button>
                </div>
              ))}
            </div>

            {/* CTA footer */}
            <div className="wl-footer-cta">
              <div>
                <strong>Ready to start reading?</strong>
                <span>Purchase any book to unlock instant access.</span>
              </div>
              <Link to="/library" className="btn btn-primary btn-sm">Browse All Books</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
