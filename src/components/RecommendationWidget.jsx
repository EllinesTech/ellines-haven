import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { calculateRecommendations, getCachedRecommendations, saveRecommendations, getTrendingBooks } from '../utils/recommendationEngine';
import { BOOKS } from '../data/books';
import { Link } from 'react-router-dom';
import './RecommendationWidget.css';

export default function RecommendationWidget({ limit = 8, title = "📚 Recommended For You", showViewMore = true }) {
  const { user } = useApp();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRecommendations() {
      try {
        setLoading(true);
        setError(null);

        if (!user) {
          // Show trending books for logged-out users
          const trending = getTrendingBooks(limit);
          if (isMounted) {
            setRecommendations(trending);
          }
          return;
        }

        // Try to get cached recommendations first
        let recs = await getCachedRecommendations(user.email);

        if (!recs || recs.length === 0) {
          // Calculate fresh recommendations
          recs = await calculateRecommendations(user.email, limit);
          
          // Save to cache for next time
          if (recs.length > 0) {
            await saveRecommendations(user.email, recs);
          }
        }

        if (isMounted) {
          // Map recommendations to full book objects
          const recBooks = recs
            .slice(0, limit)
            .map(rec => {
              const bookData = BOOKS.find(b => b.id === rec.bookId || b.id === rec.id);
              return bookData ? { ...bookData, reason: rec.reason, score: rec.score } : null;
            })
            .filter(Boolean);

          setRecommendations(recBooks);
        }
      } catch (err) {
        console.error('Error loading recommendations:', err);
        if (isMounted) {
          setError('Could not load recommendations');
          // Fallback to trending
          setRecommendations(getTrendingBooks(limit));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadRecommendations();

    return () => {
      isMounted = false;
    };
  }, [user, limit]);

  if (loading) {
    return (
      <div className="rec-widget">
        <h2>{title}</h2>
        <div className="rec-grid">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="rec-card rec-card-loading">
              <div className="rec-cover-placeholder"></div>
              <div className="rec-text-placeholder"></div>
              <div className="rec-text-placeholder" style={{ width: '70%', marginTop: '8px' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && recommendations.length === 0) {
    return (
      <div className="rec-widget rec-widget-empty">
        <p>Unable to load recommendations. Please try again later.</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="rec-widget rec-widget-empty">
        <p>Explore our library to get personalized recommendations!</p>
      </div>
    );
  }

  const subtitle = user 
    ? `Based on your reading history` 
    : `Popular books you might enjoy`;

  return (
    <div className="rec-widget">
      <div className="rec-header">
        <div>
          <h2>{title}</h2>
          <p className="rec-subtitle">{subtitle}</p>
        </div>
        {showViewMore && (
          <Link to="/recommendations" className="rec-view-all">
            View All →
          </Link>
        )}
      </div>

      <div className="rec-grid">
        {recommendations.map(book => (
          <div key={book.id} className="rec-card">
            <Link to={`/book/${book.slug || book.id}`} className="rec-card-link">
              <div className="rec-cover">
                <img 
                  src={book.cover} 
                  alt={book.title}
                  loading="lazy"
                />
                {book.rating && (
                  <div className="rec-rating">⭐ {book.rating.toFixed(1)}</div>
                )}
              </div>
              <div className="rec-info">
                <h3 className="rec-title">{book.title}</h3>
                <p className="rec-author">{book.author}</p>
                {book.reason && (
                  <p className="rec-reason">💡 {book.reason}</p>
                )}
              </div>
            </Link>
            <div className="rec-footer">
              <Link 
                to={`/book/${book.slug || book.id}`}
                className="rec-btn-small"
              >
                View
              </Link>
              <span className="rec-meta">
                {book.reviews ? `${book.reviews} reviews` : 'New'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
