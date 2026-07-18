import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTrendingBooks } from '../utils/recommendationEngine';
import './TrendingWidget.css';

export default function TrendingWidget({ limit = 5, title = "🔥 Trending Now" }) {
  const [trendingBooks, setTrendingBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setLoading(true);
      const trending = getTrendingBooks(limit);
      setTrendingBooks(trending);
    } catch (error) {
      console.error('Error loading trending books:', error);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  if (loading) {
    return (
      <div className="trending-widget">
        <h3>{title}</h3>
        <div className="trending-list">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="trending-item-loading">
              <div className="trending-rank-placeholder"></div>
              <div className="trending-content-placeholder"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (trendingBooks.length === 0) {
    return null;
  }

  return (
    <div className="trending-widget">
      <h3>{title}</h3>
      <div className="trending-list">
        {trendingBooks.map((book, index) => (
          <Link
            key={book.id}
            to={`/book/${book.slug || book.id}`}
            className="trending-item"
          >
            <div className="trending-rank">
              <span className={`rank-number rank-${index + 1}`}>
                {index + 1}
              </span>
            </div>
            <div className="trending-cover">
              <img
                src={book.cover}
                alt={book.title}
                loading="lazy"
              />
            </div>
            <div className="trending-info">
              <h4 className="trending-title">{book.title}</h4>
              <p className="trending-author">{book.author}</p>
              <div className="trending-meta">
                {book.rating && (
                  <span className="trending-rating">
                    ⭐ {book.rating.toFixed(1)}
                  </span>
                )}
                {book.reviews && (
                  <span className="trending-reviews">
                    ({book.reviews})
                  </span>
                )}
              </div>
            </div>
            {book.trendingScore && (
              <div className="trending-score">
                {Math.round(book.trendingScore)}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
