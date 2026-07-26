import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { calculateRecommendations, getCachedRecommendations, saveRecommendations, getTrendingBooks } from '../utils/recommendationEngine';
import { Link } from 'react-router-dom';
import { bookPath } from '../utils/slugify';
import { BookCover } from './BookCard';
import './BookCard.css';
import './RecommendationWidget.css';

const PICK_LABELS = ['Top Pick', 'For You', 'New'];
/** Fill the row evenly when few titles; scroll strip when the shelf is full. */
const FILL_MAX = 4;

export default function RecommendationWidget({ limit = 8, title = "Recommended For You", showViewMore = true }) {
  const { user, books } = useApp();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        if (!user) {
          const trending = getTrendingBooks(limit, books);
          if (isMounted) setRecommendations(trending);
          return;
        }
        let recs = await getCachedRecommendations(user.email);
        if (!recs || recs.length === 0) {
          recs = await calculateRecommendations(user.email, limit, books);
          if (recs.length > 0) await saveRecommendations(user.email, recs);
        }
        if (isMounted) {
          const resolved = recs.slice(0, limit)
            .map(rec => {
              const b = books.find(b => b.id === rec.bookId || b.id === rec.id);
              return b ? { ...b, reason: rec.reason, score: rec.score } : null;
            })
            .filter(Boolean);
          setRecommendations(resolved.length ? resolved : getTrendingBooks(limit, books));
        }
      } catch {
        if (isMounted) setRecommendations(getTrendingBooks(limit, books));
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [user, limit, books]);

  const subtitle = user ? 'Based on your reading history' : 'Popular books you might enjoy';
  const count = loading ? Math.min(limit, FILL_MAX) : recommendations.length;
  const fillRow = count > 0 && count <= FILL_MAX;

  return (
    <div className="rw">
      <div className="rw__head">
        <div>
          <h2 className="rw__title">{title}</h2>
          <p className="rw__sub">{subtitle}</p>
        </div>
        {showViewMore && (
          <Link to="/recommendations" className="rw__more">View All →</Link>
        )}
      </div>

      <div
        className={`rw__strip${fillRow ? ' rw__strip--fill' : ''}`}
        style={fillRow ? { '--rw-cols': count } : undefined}
      >
        {loading
          ? Array.from({ length: count }).map((_, i) => (
              <div key={i} className="rw__card rw__card--skeleton">
                <div className="rw__skeleton-cover" />
                <div className="rw__skeleton-line" />
                <div className="rw__skeleton-line rw__skeleton-line--short" />
              </div>
            ))
          : recommendations.length === 0
            ? (
              <div className="rw__empty">
                <p>Explore our library to get personalized recommendations!</p>
                <Link to="/library" className="btn btn-outline btn-sm">Browse Library →</Link>
              </div>
            )
            : recommendations.map((book, i) => (
              <Link key={book.id} to={bookPath(book)} className="rw__card">
                <div className="rw__cover-wrap">
                  <BookCover book={book} />
                  {i < 3 && (
                    <span className={`rw__badge rw__badge--${i}`}>{PICK_LABELS[i]}</span>
                  )}
                  {book.rating > 0 && (
                    <span className="rw__rating">
                      <span className="rw__rating-star" aria-hidden="true">★</span>
                      {book.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="rw__info">
                  <p className="rw__genre">{book.genre}</p>
                  <p className="rw__book-title">{book.title}</p>
                  {book.reason && <p className="rw__reason">{book.reason}</p>}
                  <p className="rw__price"><small>KSh</small> {book.price}</p>
                </div>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
