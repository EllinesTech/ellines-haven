/**
 * WishlistButton — reusable bookmark/heart button.
 * Shows filled state when book is wishlisted.
 */
import { useApp } from '../context/AppContext';
import './WishlistButton.css';

export default function WishlistButton({ book, size = 'md', showLabel = false }) {
  const { toggleWishlist, isWishlisted, user } = useApp();
  const active = isWishlisted(book?.id);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!book) return;
    toggleWishlist(book);
  };

  return (
    <button
      className={`wl-btn wl-btn--${size}${active ? ' wl-btn--active' : ''}`}
      onClick={handleClick}
      title={active ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-label={active ? `Remove ${book?.title} from wishlist` : `Add ${book?.title} to wishlist`}
      aria-pressed={active}
    >
      <span className="wl-btn-icon">{active ? '🔖' : '🔖'}</span>
      {showLabel && (
        <span className="wl-btn-label">
          {active ? 'Saved' : 'Save'}
        </span>
      )}
      {/* Filled indicator dot */}
      {active && <span className="wl-btn-dot" aria-hidden="true" />}
    </button>
  );
}
