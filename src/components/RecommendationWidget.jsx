import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { calculateRecommendations, getCachedRecommendations, saveRecommendations, getTrendingBooks } from '../utils/recommendationEngine';
import { BOOKS } from '../data/books';
import { Link } from 'react-router-dom';
import { bookPath } from '../utils/slugify';
import './RecommendationWidget.css';

/* ── Styled cover fallback (for books without photo covers) ── */
function BookCover({ book, size = 'md' }) {
  const w = size === 'lg' ? 120 : 90;
  const h = size === 'lg' ? 168 : 126;

  if (book.cover) {
    return (
      <img
        src={book.cover}
        alt={book.title}
        style={{ width: w, height: h, objectFit: 'cover', borderRadius: 6, flexShrink: 0, display: 'block' }}
        loading="lazy"
      />
    );
  }

  // Styled gradient cover
  const bg = book.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)';
  const accent = book.coverAccent || '#c9a84c';
  const initials = book.title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div style={{
      width: w, height: h, borderRadius: 6, flexShrink: 0,
      background: bg,
      border: `1px solid ${accent}40`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 6,
      overflow: 'hidden', position: 'relative',
    }}>
      {/* decorative lines */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.15 }}>
        <div style={{ position: 'absolute', top: 8, left: 8, right: 8, height: 1, background: accent }} />
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, height: 1, background: accent }} />
      </div>
      <div style={{ fontSize: size === 'lg' ? '1.5rem' : '1.1rem', fontWeight: 900, color: accent, letterSpacing: 1 }}>{initials}</div>
      <div style={{ fontSize: size === 'lg' ? '0.45rem' : '0.38rem', color: accent, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, textAlign: 'center', padding: '0 6px', lineHeight: 1.4 }}>
        {book.title.slice(0, 20)}
      </div>
    </div>
  );
}

export default function RecommendationWidget({ limit = 8, title = "Recommended For You", showViewMore = true }) {
  const { user } = useApp();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        if (!user) {
          const trending = getTrendingBooks(limit);
          if (isMounted) setRecommendations(trending);
          return;
        }
        let recs = await getCachedRecommendations(user.email);
        if (!recs || recs.length === 0) {
          recs = await calculateRecommendations(user.email, limit);
          if (recs.length > 0) await saveRecommendations(user.email, recs);
        }
        if (isMounted) {
          const books = recs.slice(0, limit)
            .map(rec => {
              const b = BOOKS.find(b => b.id === rec.bookId || b.id === rec.id);
              return b ? { ...b, reason: rec.reason, score: rec.score } : null;
            })
            .filter(Boolean);
          setRecommendations(books);
        }
      } catch {
        if (isMounted) setRecommendations(getTrendingBooks(limit));
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [user, limit]);

  const subtitle = user ? 'Based on your reading history' : 'Popular books you might enjoy';

  return (
    <div className="rw">
      {/* Header */}
      <div className="rw__head">
        <div>
          <h2 className="rw__title">📚 {title}</h2>
          <p className="rw__sub">{subtitle}</p>
        </div>
        {showViewMore && (
          <Link to="/recommendations" className="rw__more">View All →</Link>
        )}
      </div>

      {/* Scroll strip */}
      <div className="rw__strip">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rw__card rw__card--skeleton">
                <div className="rw__skeleton-cover" />
                <div className="rw__skeleton-line" />
                <div className="rw__skeleton-line rw__skeleton-line--short" />
              </div>
            ))
          : recommendations.length === 0
            ? (
              <div className="rw__empty">
                <span>📖</span>
                <p>Explore our library to get personalized recommendations!</p>
                <Link to="/library" className="btn btn-outline btn-sm">Browse Library →</Link>
              </div>
            )
            : recommendations.map((book, i) => (
              <Link key={book.id} to={bookPath(book)} className="rw__card">
                {/* Cover */}
                <div className="rw__cover-wrap">
                  <BookCover book={book} />
                  {book.rating && (
                    <span className="rw__rating">⭐ {book.rating.toFixed(1)}</span>
                  )}
                  {i < 3 && (
                    <span className="rw__badge">{i === 0 ? '🔥 Top Pick' : i === 1 ? '💡 For You' : '✨ New'}</span>
                  )}
                </div>
                {/* Info */}
                <div className="rw__info">
                  <p className="rw__book-title">{book.title}</p>
                  <p className="rw__genre">{book.genre}</p>
                  {book.reason && <p className="rw__reason">{book.reason}</p>}
                  <p className="rw__price">KSh {book.price}</p>
                </div>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
