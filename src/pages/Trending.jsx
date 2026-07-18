import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BookCard from '../components/BookCard';
import { useApp } from '../context/AppContext';
import { getTrendingBooks, getTrendingByCategory } from '../utils/recommendationEngine';
import { GENRES } from '../data/books';
import { usePageMeta } from '../hooks/usePageMeta';
import './Trending.css';

export default function Trending() {
  const { books } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'trending');

  const selectedGenre = searchParams.get('genre') || 'All';

  usePageMeta({
    title: 'Trending Books - Ellines Haven',
    description: 'Discover the most popular and trending books on Ellines Haven. Real stories from Kenya by Elijah Mwangi M.',
  });

  useEffect(() => {
    setLoading(true);

    let results = [];

    if (selectedGenre === 'All') {
      results = getTrendingBooks(50);
    } else {
      results = getTrendingByCategory(selectedGenre, 50);
    }

    // Sort by selected criteria
    if (sortBy === 'trending') {
      // Already sorted by getTrendingBooks
    } else if (sortBy === 'rating') {
      results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'newest') {
      results.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    } else if (sortBy === 'reviews') {
      results.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
    }

    setTrending(results);
    setLoading(false);
  }, [selectedGenre, sortBy]);

  const handleGenreChange = (genre) => {
    setSearchParams({ genre: genre === 'All' ? '' : genre, sort: sortBy }, { replace: true });
  };

  const handleSortChange = (sort) => {
    setSortBy(sort);
    setSearchParams({ genre: selectedGenre === 'All' ? '' : selectedGenre, sort }, { replace: true });
  };

  return (
    <main>
      {/* Page header */}
      <section className="page-header trending-header">
        <div className="container">
          <div className="trending-hero">
            <span className="badge badge-gold">🔥 What's Hot Right Now</span>
            <h1>
              <span className="gold-text">Trending</span> on Ellines Haven
            </h1>
            <p>Discover the books everyone is reading — real stories that resonate with thousands of readers across Kenya and beyond.</p>
          </div>
        </div>
      </section>

      {/* Filters section */}
      <section className="trending-filters-section">
        <div className="container">
          {/* Genre filter */}
          <div className="filter-group">
            <label className="filter-label">📚 Genre</label>
            <div className="genre-pills">
              <button
                className={`pill ${selectedGenre === 'All' ? 'active' : ''}`}
                onClick={() => handleGenreChange('All')}
              >
                All Genres
              </button>
              {GENRES.slice(0, 8).map(genre => (
                <button
                  key={genre}
                  className={`pill ${selectedGenre === genre ? 'active' : ''}`}
                  onClick={() => handleGenreChange(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          {/* Sort filter */}
          <div className="filter-group">
            <label className="filter-label">📊 Sort By</label>
            <div className="sort-options">
              <button
                className={`sort-btn ${sortBy === 'trending' ? 'active' : ''}`}
                onClick={() => handleSortChange('trending')}
              >
                Trending
              </button>
              <button
                className={`sort-btn ${sortBy === 'rating' ? 'active' : ''}`}
                onClick={() => handleSortChange('rating')}
              >
                ⭐ Top Rated
              </button>
              <button
                className={`sort-btn ${sortBy === 'reviews' ? 'active' : ''}`}
                onClick={() => handleSortChange('reviews')}
              >
                💬 Most Reviewed
              </button>
              <button
                className={`sort-btn ${sortBy === 'newest' ? 'active' : ''}`}
                onClick={() => handleSortChange('newest')}
              >
                📅 Newest
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Books grid */}
      <section className="section trending-results-section">
        <div className="container">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading trending books...</p>
            </div>
          ) : trending.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
              <h3>No books found</h3>
              <p>Try a different genre or sort option.</p>
              <Link to="/library" className="btn btn-outline btn-sm" style={{ marginTop: 16 }}>
                Browse All Books →
              </Link>
            </div>
          ) : (
            <>
              <div className="results-header">
                <h2>
                  {selectedGenre === 'All' ? 'All Trending Books' : `Trending in ${selectedGenre}`}
                  <span className="result-count">({trending.length})</span>
                </h2>
              </div>

              <div className="books-grid">
                {trending.map(book => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="section trending-cta">
        <div className="container">
          <div className="cta-card">
            <div className="cta-content">
              <h2>Found something you like?</h2>
              <p>Add books to your wishlist and get notified when new titles drop.</p>
            </div>
            <Link to="/library" className="btn btn-primary">
              Start Reading →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
