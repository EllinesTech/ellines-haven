import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { findSimilarBooks } from '../utils/recommendationEngine';
import './SimilarBooksSlider.css';

export default function SimilarBooksSlider({ bookId, title = "📖 Readers Also Liked" }) {
  const [similarBooks, setSimilarBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSimilarBooks() {
      try {
        setLoading(true);
        setError(null);
        const books = await findSimilarBooks(bookId, 8);
        if (isMounted) {
          setSimilarBooks(books);
        }
      } catch (err) {
        console.error('Error loading similar books:', err);
        if (isMounted) {
          setError('Could not load similar books');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSimilarBooks();

    return () => {
      isMounted = false;
    };
  }, [bookId]);

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      const movement = direction === 'left' ? -scrollAmount : scrollAmount;
      scrollContainerRef.current.scrollBy({
        left: movement,
        behavior: 'smooth'
      });
    }
  };

  if (loading) {
    return (
      <div className="similar-slider">
        <h3>{title}</h3>
        <div className="similar-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="similar-card-loading">
              <div className="similar-cover-placeholder"></div>
              <div className="similar-text-placeholder"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || similarBooks.length === 0) {
    return null;
  }

  return (
    <div className="similar-slider">
      <div className="similar-header">
        <h3>{title}</h3>
        <div className="similar-controls">
          <button
            className="similar-scroll-btn"
            onClick={() => scroll('left')}
            title="Scroll left"
          >
            ←
          </button>
          <button
            className="similar-scroll-btn"
            onClick={() => scroll('right')}
            title="Scroll right"
          >
            →
          </button>
        </div>
      </div>

      <div className="similar-scroll-container" ref={scrollContainerRef}>
        {similarBooks.map(book => (
          <Link
            key={book.id}
            to={`/book/${book.slug || book.id}`}
            className="similar-card"
          >
            <div className="similar-cover">
              <img
                src={book.cover}
                alt={book.title}
                loading="lazy"
              />
              {book.rating && (
                <div className="similar-rating">
                  ⭐ {book.rating.toFixed(1)}
                </div>
              )}
              {book.similarityScore && (
                <div className="similar-score">
                  {book.similarityScore}% match
                </div>
              )}
            </div>
            <div className="similar-info">
              <h4 className="similar-title">{book.title}</h4>
              <p className="similar-author">{book.author}</p>
              {book.genres && (
                <p className="similar-genres">
                  {book.genres.slice(0, 2).join(', ')}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
