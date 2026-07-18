import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { calculateRecommendations, getTrendingBooks } from '../utils/recommendationEngine';
import { BOOKS } from '../data/books';
import { Link } from 'react-router-dom';
import BookCard from '../components/BookCard';
import { usePageMeta } from '../hooks/usePageMeta';
import './Recommendations.css';

export default function Recommendations() {
  usePageMeta({
    title: 'Personalized Book Recommendations | Ellines Haven',
    description: 'Discover books recommended based on your reading history and preferences.',
  });

  const { user } = useApp();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('relevance');

  useEffect(() => {
    let isMounted = true;

    async function loadRecommendations() {
      try {
        setLoading(true);
        setError(null);

        let recs = [];
        if (user) {
          recs = await calculateRecommendations(user.email, 30);
        } else {
          recs = getTrendingBooks(30);
        }

        if (isMounted) {
          // Map recommendations to full book objects
          const recBooks = recs
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
  }, [user]);

  const sortedRecommendations = [...recommendations].sort((a, b) => {
    switch (sortBy) {
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      case 'newest':
        return (b.reviews || 0) - (a.reviews || 0);
      case 'title':
        return a.title.localeCompare(b.title);
      case 'relevance':
      default:
        return (b.score || 0) - (a.score || 0);
    }
  });

  if (loading) {
    return (
      <main className="recommendations-page">
        <section className="section">
          <div className="container">
            <h1>Loading recommendations...</h1>
            <div className="books-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="book-card-loading">
                  <div className="book-cover-placeholder"></div>
                  <div className="book-text-placeholder"></div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="recommendations-page">
      {/* Hero */}
      <section className="rec-hero">
        <div className="container">
          <div className="rec-hero__content">
            <h1>📚 Personalized Recommendations</h1>
            <p className="rec-hero__subtitle">
              {user
                ? `Discover books tailored to your reading style and preferences`
                : `Popular and trending books handpicked for you`}
            </p>
            {!user && (
              <p className="rec-hero__note">
                📝 <Link to="/login">Sign in</Link> to get personalized recommendations based on your reading history.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="section">
        <div className="container">
          <div className="rec-controls">
            <div className="rec-count">
              Found <strong>{sortedRecommendations.length}</strong> books for you
            </div>
            <div className="rec-sort">
              <label htmlFor="sort">Sort by:</label>
              <select
                id="sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rec-select"
              >
                <option value="relevance">Relevance</option>
                <option value="rating">Highest Rated</option>
                <option value="newest">Most Popular</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Error */}
      {error && !loading && (
        <section className="section">
          <div className="container">
            <div className="rec-error">
              <p>⚠️ {error}</p>
              <p>Please try again later or <Link to="/library">browse all books</Link>.</p>
            </div>
          </div>
        </section>
      )}

      {/* Results */}
      <section className="section">
        <div className="container">
          {sortedRecommendations.length > 0 ? (
            <div className="books-grid">
              {sortedRecommendations.map(book => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <div className="rec-empty">
              <p>📖 No recommendations found. Check back soon!</p>
              <Link to="/library" className="btn btn-primary">Browse All Books</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
