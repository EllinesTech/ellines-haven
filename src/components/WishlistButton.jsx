/**
 * WishlistButton — heart button to add/remove a book from the wishlist.
 * Uses a heart icon (♡/♥) consistent with industry-standard book stores.
 */
import { useApp } from '../context/AppContext';
import './WishlistButton.css';

export default function WishlistButton({ book, size = 'md', showLabel = false }) {
  const { toggleWishlist, isWishlisted } = useApp();
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
      {/* Heart SVG — outline when idle, filled when active */}
      <svg
        className="wl-btn-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {showLabel && (
        <span className="wl-btn-label">
          {active ? 'Wishlisted' : 'Wishlist'}
        </span>
      )}
    </button>
  );
}
