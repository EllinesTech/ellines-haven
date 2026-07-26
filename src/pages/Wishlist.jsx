/**
 * Wishlist page — /wishlist
 * Shows all books the user has marked "Want to Read".
 */
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BookCard from '../components/BookCard';
import './Wishlist.css';

const IconHeart = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

export default function Wishlist() {
  const { user, wishlist, toggleWishlist, books: catalog } = useApp();

  if (!user) {
    return (
      <main className="wl-page">
        <div className="container wl-gate">
          <div className="wl-gate-icon"><IconHeart size={36} /></div>
          <h2>Your <span className="gold-text">Wishlist</span></h2>
          <p>Sign in to save books you want to read later.</p>
          <div className="wl-gate-actions">
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
      <header className="wl-hero">
        <div className="wl-hero__glow" aria-hidden="true" />
        <div className="wl-hero__orb wl-hero__orb--1" aria-hidden="true" />
        <div className="wl-hero__orb wl-hero__orb--2" aria-hidden="true" />
        <div className="container wl-hero__inner">
          <div>
            <p className="wl-hero__brand">Ellines Haven</p>
            <h1>My <span className="gold-text">Wishlist</span></h1>
            <p>
              {enriched.length > 0
                ? `${enriched.length} book${enriched.length !== 1 ? 's' : ''} saved for later`
                : 'Save titles you want to read next'}
            </p>
          </div>
          <Link to="/library" className="btn btn-outline btn-sm wl-hero__cta">
            Browse Library
          </Link>
        </div>
      </header>

      <div className="container wl-body">
        {enriched.length === 0 ? (
          <div className="wl-empty">
            <div className="wl-empty-icon"><IconHeart size={40} /></div>
            <h3>Your wishlist is empty</h3>
            <p>
              Browse the library and tap the heart on any book to save it here.
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
                    <IconTrash /> Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="wl-footer-cta">
              <div>
                <strong>Ready to start reading?</strong>
                <span>Purchase any book for instant digital access.</span>
              </div>
              <Link to="/library" className="btn btn-primary btn-sm">Browse All Books</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
