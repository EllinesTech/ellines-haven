import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTrendingBooks } from '../utils/recommendationEngine';
import { bookPath } from '../utils/slugify';
import './TrendingWidget.css';

/* ── Styled cover (mirrors RecommendationWidget) ── */
function BookCover({ book }) {
  if (book.cover) {
    return (
      <img
        src={book.cover}
        alt={book.title}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        loading="lazy"
      />
    );
  }
  const bg = book.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)';
  const accent = book.coverAccent || '#c9a84c';
  const initials = book.title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div style={{
      width: '100%', height: '100%',
      background: bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 4,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 6, left: 6, right: 6, height: 1, background: accent, opacity: 0.3 }} />
      <div style={{ position: 'absolute', bottom: 6, left: 6, right: 6, height: 1, background: accent, opacity: 0.3 }} />
      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: accent }}>{initials}</div>
      <div style={{ fontSize: '0.36rem', color: accent, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, textAlign: 'center', padding: '0 4px', lineHeight: 1.4 }}>
        {book.title.slice(0, 18)}
      </div>
    </div>
  );
}

const RANK_COLORS = ['#f1c40f', '#bdc3c7', '#cd7f32', 'var(--muted)', 'var(--muted)'];

export default function TrendingWidget({ limit = 6, title = "Trending Now" }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setLoading(true);
      setBooks(getTrendingBooks(limit));
    } catch (e) {
      console.error('TrendingWidget:', e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  return (
    <div className="tw">
      {/* Header */}
      <div className="tw__head">
        <div>
          <h2 className="tw__title">🔥 {title}</h2>
          <p className="tw__sub">Most read this week</p>
        </div>
        <Link to="/trending" className="tw__more">See All →</Link>
      </div>

      {/* Horizontal strip */}
      <div className="tw__strip">
        {loading
          ? Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="tw__card tw__card--skeleton">
                <div className="tw__skeleton-cover" />
                <div className="tw__skeleton-line" />
                <div className="tw__skeleton-line tw__skeleton-line--short" />
              </div>
            ))
          : books.map((book, i) => (
              <Link key={book.id} to={bookPath(book)} className="tw__card">
                {/* Cover with rank badge */}
                <div className="tw__cover-wrap">
                  <BookCover book={book} />
                  {/* Rank number */}
                  <div className="tw__rank" style={{ color: RANK_COLORS[i] || 'var(--muted)' }}>
                    #{i + 1}
                  </div>
                  {/* Rating */}
                  {book.rating && (
                    <span className="tw__rating">⭐ {book.rating.toFixed(1)}</span>
                  )}
                </div>
                {/* Info */}
                <div className="tw__info">
                  <p className="tw__book-title">{book.title}</p>
                  <p className="tw__genre">{book.genre}</p>
                  {book.reviews > 0 && (
                    <p className="tw__reviews">{book.reviews} reviews</p>
                  )}
                  <p className="tw__price">KSh {book.price}</p>
                </div>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
