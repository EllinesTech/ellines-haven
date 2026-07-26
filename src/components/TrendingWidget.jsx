import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getTrendingBooks } from '../utils/recommendationEngine';
import { bookPath } from '../utils/slugify';
import { BookCover } from './BookCard';
import './BookCard.css';
import './TrendingWidget.css';

export default function TrendingWidget({ limit = 6, title = "Trending Now" }) {
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

      <div className="tw__strip">
        {loading
          ? Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="tw__card tw__card--skeleton">
                <div className="tw__skeleton-cover" />
                <div className="tw__skeleton-line" />
                <div className="tw__skeleton-line tw__skeleton-line--short" />
              </div>
            ))
          : list.map((book, i) => (
              <Link key={book.id} to={bookPath(book)} className="tw__card">
                <div className="tw__cover-wrap">
                  <BookCover book={book} />
                  <div className={`tw__rank tw__rank--${Math.min(i + 1, 4)}`}>
                    #{i + 1}
                  </div>
                  {book.rating > 0 && (
                    <span className="tw__rating">
                      <span className="tw__rating-star" aria-hidden="true">★</span>
                      {book.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="tw__info">
                  <p className="tw__genre">{book.genre}</p>
                  <p className="tw__book-title">{book.title}</p>
                  {book.reviews > 0 && (
                    <p className="tw__reviews">{book.reviews} reviews</p>
                  )}
                  <p className="tw__price"><small>KSh</small> {book.price}</p>
                </div>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
