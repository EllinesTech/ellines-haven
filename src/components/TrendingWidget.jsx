import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getTrendingBooks } from '../utils/recommendationEngine';
import { bookPath } from '../utils/slugify';
import { BookCover } from './BookCard';
import './BookCard.css';
import './TrendingWidget.css';

export default function TrendingWidget({ limit = 5, title = "Trending Now" }) {
  const { books } = useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setLoading(true);
      setList(getTrendingBooks(limit, books));
    } catch (e) {
      console.error('TrendingWidget:', e);
    } finally {
      setLoading(false);
    }
  }, [limit, books]);

  return (
    <div className="tw">
      <div className="tw__head">
        <div>
          <h2 className="tw__title">{title}</h2>
          <p className="tw__sub">Most read this week</p>
        </div>
        <Link to="/trending" className="tw__more">See All →</Link>
      </div>

      <div className="tw__list">
        {loading
          ? Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="tw__row tw__row--skeleton">
                <div className="tw__row-cover tw__skeleton-cover" />
                <div className="tw__row-info">
                  <div className="tw__skeleton-line" />
                  <div className="tw__skeleton-line tw__skeleton-line--short" />
                </div>
              </div>
            ))
          : list.map((book, i) => (
              <Link key={book.id} to={bookPath(book)} className="tw__row">
                <span className={`tw__rank tw__rank--${Math.min(i + 1, 4)}`}>
                  #{i + 1}
                </span>
                <div className="tw__row-cover">
                  <BookCover book={book} />
                </div>
                <div className="tw__row-info">
                  <p className="tw__genre">{book.genre}</p>
                  <p className="tw__book-title">{book.title}</p>
                  <div className="tw__row-meta">
                    {book.rating > 0 && (
                      <span className="tw__rating-inline">
                        <span aria-hidden="true">★</span> {book.rating.toFixed(1)}
                      </span>
                    )}
                    {book.reviews > 0 && (
                      <span className="tw__reviews">{book.reviews} reviews</span>
                    )}
                  </div>
                  <p className="tw__price"><small>KSh</small> {book.price}</p>
                </div>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
