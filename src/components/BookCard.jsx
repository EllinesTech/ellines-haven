import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import WishlistButton from './WishlistButton';
import CoverImage from './CoverImage';
import { hasImageCover } from '../utils/bookCovers';
import { bookPath, readPath } from '../utils/slugify';
import { getLoginPromptConfig, hasFreeSampleChapter } from '../utils/purchaseHelpers';
import { getReadingTimeDisplay } from '../utils/readingTime';
import './BookCard.css';

// Statuses where buying is not applicable
const NO_PURCHASE_STATUSES = new Set(['coming-soon', 'draft']);
// Statuses where a "Notify Me" button makes sense
const NOTIFY_STATUSES = new Set(['coming-soon', 'ongoing', 'limited']);
const STATUS_META = {
  // ── Primary status badges ─────────────────────────────────────────────────
  complete:        { label:'Complete',        icon:'✅', color:'#2ecc71', bg:'rgba(46,204,113,0.15)'   },
  ongoing:         { label:'Ongoing',         icon:'📖', color:'#4a9eff', bg:'rgba(74,158,255,0.15)'   },
  premium:         { label:'Premium',         icon:'⭐', color:'#c9a84c', bg:'rgba(201,168,76,0.15)'   },
  'free-preview':  { label:'Free Preview',    icon:'👀', color:'#a855f7', bg:'rgba(168,85,247,0.15)'   },
  'coming-soon':   { label:'Coming Soon',     icon:'🔜', color:'#e8832a', bg:'rgba(232,131,42,0.15)'   },
  limited:         { label:'Limited',         icon:'⏳', color:'#e74c3c', bg:'rgba(231,76,60,0.15)'    },
  draft:           { label:'Draft',           icon:'📝', color:'#64748b', bg:'rgba(100,116,139,0.15)'  },
  // ── Extra/additional badges (can stack with status) ───────────────────────
  bestseller:      { label:'Bestseller',      icon:'🏆', color:'#f59e0b', bg:'rgba(245,158,11,0.15)'   },
  'award-winner':  { label:'Award Winner',    icon:'🥇', color:'#fbbf24', bg:'rgba(251,191,36,0.15)'   },
  'staff-pick':    { label:'Staff Pick',      icon:'❤️', color:'#ec4899', bg:'rgba(236,72,153,0.15)'   },
  'reader-fave':   { label:"Reader's Fave",   icon:'🌟', color:'#f97316', bg:'rgba(249,115,22,0.15)'   },
  'new-release':   { label:'New Release',     icon:'🆕', color:'#06b6d4', bg:'rgba(6,182,212,0.15)'    },
  'true-story':    { label:'True Story',      icon:'✦',  color:'#c9a84c', bg:'rgba(201,168,76,0.15)'   },
  exclusive:       { label:'Exclusive',       icon:'💎', color:'#818cf8', bg:'rgba(129,140,248,0.15)'  },
  'age-18':        { label:'18+',             icon:'🔞', color:'#ef4444', bg:'rgba(239,68,68,0.15)'    },
  'age-16':        { label:'16+',             icon:'🔒', color:'#f97316', bg:'rgba(249,115,22,0.12)'   },
  audiobook:       { label:'Audiobook',       icon:'🎧', color:'#22d3ee', bg:'rgba(34,211,238,0.15)'   },
  translated:      { label:'Translated',      icon:'🌍', color:'#34d399', bg:'rgba(52,211,153,0.15)'   },
  'short-read':    { label:'Short Read',      icon:'⚡', color:'#a3e635', bg:'rgba(163,230,53,0.15)'   },
  series:          { label:'Series',          icon:'📚', color:'#38bdf8', bg:'rgba(56,189,248,0.15)'   },
  'signed-copy':   { label:'Signed Copy',     icon:'✍️', color:'#e879f9', bg:'rgba(232,121,249,0.15)'  },
  'kenya-made':    { label:'Kenya Made',      icon:'🇰🇪', color:'#16a34a', bg:'rgba(22,163,74,0.15)'   },
  seasonal:        { label:'Seasonal',        icon:'🌸', color:'#f472b6', bg:'rgba(244,114,182,0.15)'  },
};

// Render one badge pill — supports both built-in STATUS_META badges and custom badges
export function BookStatusBadge({ status, customMeta, style = {} }) {
  if (!status) return null;
  const meta = STATUS_META[status] || customMeta;
  // For unknown badges not in STATUS_META and no customMeta provided, render a neutral pill
  const color  = meta?.color  || '#a78bfa';
  const bg     = meta?.bg     || 'rgba(167,139,250,0.12)';
  const icon   = meta?.icon   || '🏷️';
  const label  = meta?.label  || status;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:'0.65rem', fontWeight:800, letterSpacing:0.8,
      padding:'4px 10px', borderRadius:20,
      background: bg.replace(/[\d.]+\)$/, '0.55)'),
      color,
      border:`1px solid ${color}cc`,
      backdropFilter:'blur(4px)',
      WebkitBackdropFilter:'blur(4px)',
      textShadow:'0 1px 4px rgba(0,0,0,0.7)',
      boxShadow:`0 2px 8px rgba(0,0,0,0.4)`,
      whiteSpace:'nowrap',
      ...style,
    }}>
      {icon} {label.toUpperCase()}
    </span>
  );
}

// Build a lookup map from a book's _customBadges array
function buildCustomBadgeMap(book) {
  if (!Array.isArray(book?._customBadges)) return {};
  return Object.fromEntries(book._customBadges.map(cb => [cb.value, cb]));
}

// Render all badges for a book (status + extra badges array)
// cardMode: one pill only — never stack status + extras + true-story
export function BookBadges({ book, style = {}, cardMode = false, maxExtras = cardMode ? 0 : 99 }) {
  if (!book) return null;

  const STATUS_KEYS = new Set(
    ['complete', 'ongoing', 'premium', 'free-preview', 'coming-soon', 'limited', 'draft']
  );

  const showStatus = book.status && (!cardMode || book.status !== 'complete');
  const customMap = buildCustomBadgeMap(book);
  let extras = Array.isArray(book.badges) ? book.badges.filter(Boolean) : [];

  extras = extras.filter(b => {
    const key = String(b).toLowerCase().trim();
    if (STATUS_KEYS.has(key)) return false;
    if (key === String(book.status || '').toLowerCase()) return false;
    if (cardMode && book.inspired && (key === 'true-story' || key === 'inspired')) return false;
    return true;
  });

  if (cardMode) extras = extras.slice(0, maxExtras);

  if (!showStatus && extras.length === 0) return null;

  return (
    <span className={cardMode ? 'bcard__badges' : undefined} style={{ display:'inline-flex', flexWrap:'wrap', gap:4, alignItems:'center', ...style }}>
      {showStatus && book.status && <BookStatusBadge status={book.status} />}
      {extras.map(b => (
        <BookStatusBadge key={b} status={b} customMeta={customMap[b] || undefined} />
      ))}
    </span>
  );
}

/** Shared cover used by BookCard, RecommendationWidget, TrendingWidget, etc. */
export function BookCover({ book, priority = false }) {
  if (hasImageCover(book)) {
    return (
      <CoverImage
        src={book.cover}
        alt={book.title}
        className="bcard__cover-photo"
        priority={priority}
      />
    );
  }

  // Styled CSS cover for books without a photo
  const accent = book.coverAccent || '#c9a84c';
  return (
    <div
      className="bcard__cover-styled"
      style={{ background: book.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}
    >
      {/* decorative lines */}
      <div className="bcard__cover-line" style={{ borderColor: accent }} />
      <div className="bcard__cover-line bcard__cover-line--2" style={{ borderColor: accent }} />

      {/* logo watermark */}
      <img src="/logo-icon.png" alt="" className="bcard__cover-logo" aria-hidden="true" loading="lazy" decoding="async" />

      {/* title */}
      <div className="bcard__cover-text">
        <span className="bcard__cover-genre" style={{ color: accent }}>{book.genre}</span>
        <h4 className="bcard__cover-title" style={{ color: '#f0ece2' }}>{book.title}</h4>
        <span className="bcard__cover-author">Elijah Mwangi M</span>
        <div className="bcard__cover-rule" style={{ background: accent }} />
      </div>
    </div>
  );
}

// WhatsApp order link helper
export function waOrderLink(bookTitle, bookPrice) {
  const msg = encodeURIComponent(
    `Hi Ellines Haven! I'd like to order *${bookTitle}* (KSh ${bookPrice}).\nPlease assist me with payment.`
  );
  return `https://wa.me/254748255466?text=${msg}`;
}

// ── Notify Me button — saves notification request to Firestore ──────────────
function NotifyMeBtn({ book, user }) {
  const [state, setState] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('eh_notify_' + book.id) || 'null');
    return saved ? 'done' : 'idle';
  });

  const handleNotify = async () => {
    if (!user) {
      window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setState('loading');
    try {
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const key = `notify_${book.id}_${user.email.replace(/[^a-z0-9]/gi,'_').toLowerCase()}`;

      // Write to contact_messages FIRST — this is what admin reads, and rules allow it
      await setDoc(doc(db, 'contact_messages', 'notif_' + key), {
        name:      user.name,
        email:     user.email.toLowerCase(),
        subject:   '🔔 Book Notification Request',
        message:   `${user.name} (${user.email}) wants to be notified when "${book.title}" is available.`,
        type:      'notification',
        bookId:    book.id,
        bookTitle: book.title,
        status:    'new',
        notified:  false,
        createdAt: serverTimestamp(),
      });
      // Best-effort write to notifications collection (may fail if rules block reads)
      setDoc(doc(db, 'notifications', key), {
        bookId:    book.id,
        bookTitle: book.title,
        email:     user.email.toLowerCase(),
        name:      user.name,
        status:    book.status,
        createdAt: serverTimestamp(),
        notified:  false,
      }).catch(() => {});

      localStorage.setItem('eh_notify_' + book.id, 'true');
      setState('done');
    } catch {
      setState('idle');
    }
  };

  if (!user) {
    return (
      <Link
        to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
        className="btn btn-sm bcard__notify-btn"
        title="Login to get notified when this book is available"
      >
        Notify Me
      </Link>
    );
  }

  if (state === 'done') {
    return (
      <span className="btn btn-sm bcard__notify-done">
        Notifying
      </span>
    );
  }

  const label = book.status === 'ongoing' ? 'Notify Me' : 'Notify Me';

  return (
    <button
      className="btn btn-sm bcard__notify-btn"
      onClick={handleNotify}
      disabled={state === 'loading'}
      title={book.status === 'ongoing' ? 'Get notified when all chapters are ready' : 'Get an email when this book is available'}
    >
      {state === 'loading' ? '…' : label}
    </button>
  );
}

// ── Login Required Message Card ──────────────────────────────────────────────
function LoginRequiredCard({ bookStatus, isPremium = false, compact = false }) {
  const config = getLoginPromptConfig(bookStatus, isPremium);
  
  if (compact) {
    // Compact inline version for card footer
    return (
      <div style={{
        display:'flex', flexDirection:'column', gap:6,
        background:'rgba(168,85,247,0.08)',
        border:'1px solid rgba(168,85,247,0.25)',
        borderRadius:'6px',
        padding:'10px 12px',
        fontSize:'0.7rem',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.9rem' }}>
          <span>{config.icon}</span>
          <strong style={{ color:'#d4b5ff' }}>{config.title}</strong>
        </div>
        <p style={{ margin:'0 0 8px 0', fontSize:'0.65rem', color:'rgba(212,181,255,0.8)', lineHeight:1.4 }}>
          {config.message}
        </p>
        <Link 
          to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
          className="btn btn-primary btn-sm"
          style={{ fontSize:'0.65rem', padding:'6px 10px', textAlign:'center' }}
        >
          {config.ctaText}
        </Link>
      </div>
    );
  }
  
  return (
    <div style={{
      display:'flex', flexDirection:'column', gap:8,
      background:'rgba(100,116,139,0.08)',
      border:'1px solid rgba(100,116,139,0.25)',
      borderRadius:'8px',
      padding:'12px 14px',
      fontSize:'0.72rem',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ fontSize:'1.2rem' }}>{config.icon}</span>
        <strong style={{ color:'var(--muted)' }}>{config.title}</strong>
      </div>
      <p style={{ margin:'0 0 8px 0', fontSize:'0.7rem', color:'var(--muted)', lineHeight:1.4 }}>
        {config.message}
      </p>
      <Link 
        to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
        className="btn btn-primary btn-sm"
        style={{ fontSize:'0.7rem', textAlign:'center' }}
      >
        {config.ctaText}
      </Link>
      <small style={{ textAlign:'center', color:'var(--muted)', fontSize:'0.65rem', opacity:0.7 }}>
        {config.subtext}
      </small>
    </div>
  );
}

// ── Purchase UI for Complete & Free Preview books ──────────────────────────
function PurchaseUiComplete({ book, owned, inCart, user, myPerms, addToCart }) {
  if (owned) {
    return <Link to={readPath(book)} className="btn btn-outline btn-sm">Read</Link>;
  }

  const freeSample = hasFreeSampleChapter(book);

  if (user && myPerms?.canPurchase === false && !freeSample) {
    return <span className="btn btn-ghost btn-sm" style={{opacity:0.5,cursor:'default'}}>Restricted</span>;
  }

  if (inCart && !freeSample) {
    return <Link to="/cart" className="btn btn-ghost btn-sm">In Cart</Link>;
  }

  // Guests and logged-in users can both open the free first chapter
  if (freeSample) {
    return (
      <Link
        to={readPath(book)}
        className="btn btn-outline btn-sm"
        style={{ color:'#d4b5ff', borderColor:'rgba(168,85,247,0.5)' }}
        title="Read the first chapter free"
      >
        Read Free
      </Link>
    );
  }

  if (!user) {
    return (
      <Link
        to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
        className="btn btn-primary btn-sm"
        title="Login or register to get this book"
      >
        Get Book
      </Link>
    );
  }

  return (
    <button className="btn btn-primary btn-sm" onClick={() => addToCart(book)} title="Add to cart">
      Add to Cart
    </button>
  );
}

// ── Purchase UI for Premium books ────────────────────────────────────────────
function PurchaseUiPremium({ book, owned, inCart, user, myPerms, addToCart }) {
  if (owned) {
    return <Link to={readPath(book)} className="btn btn-outline btn-sm">Read</Link>;
  }

  if (user && myPerms?.canPurchase === false) {
    return <span className="btn btn-ghost btn-sm" style={{opacity:0.5,cursor:'default'}}>Restricted</span>;
  }

  if (inCart) {
    return <Link to="/cart" className="btn btn-ghost btn-sm">In Cart</Link>;
  }

  if (!user) {
    return (
      <Link
        to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
        className="btn btn-primary btn-sm"
        style={{ background:'rgba(201,168,76,0.25)', borderColor:'rgba(201,168,76,0.6)' }}
        title="Login or register to access premium content"
      >
        Get Book
      </Link>
    );
  }

  return (
    <button
      className="btn btn-primary btn-sm"
      onClick={() => addToCart(book)}
      title="Premium content — add to cart"
      style={{ background:'rgba(201,168,76,0.25)', borderColor:'rgba(201,168,76,0.6)' }}
    >
      Add to Cart
    </button>
  );
}

export default function BookCard({ book }) {
  const { addToCart, cart, isOwned, myPerms, user } = useApp();
  const inCart = cart.some(b => b.id === book.id);
  const owned = isOwned(book.id);

  const secondaryGenres = (book.genres || [])
    .filter(g => g && g !== book.genre)
    .slice(0, 2);
  const extraGenreCount = Math.max(0, (book.genres || []).filter(g => g && g !== book.genre).length - 2);

  const ongoingReleased = book.status === 'ongoing'
    ? (book.chaptersReleased > 0
        ? book.chaptersReleased
        : (book.tableOfContents?.filter(t => !/^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(t)).length || 0))
    : 0;
  const ongoingTotal = book.status === 'ongoing'
    ? (book.totalChapters > 0 ? book.totalChapters : book.chapterCount > 0 ? book.chapterCount : 0)
    : 0;

  let action = null;
  if (owned) {
    action = <Link to={readPath(book)} className="btn btn-outline btn-sm">Read</Link>;
  } else if (NO_PURCHASE_STATUSES.has(book.status)) {
    action = <NotifyMeBtn book={book} user={user} />;
  } else if (book.status === 'complete' || book.status === 'free-preview') {
    action = <PurchaseUiComplete book={book} owned={owned} inCart={inCart} user={user} myPerms={myPerms} addToCart={addToCart} />;
  } else if (book.status === 'premium') {
    action = <PurchaseUiPremium book={book} owned={owned} inCart={inCart} user={user} myPerms={myPerms} addToCart={addToCart} />;
  } else if (book.status === 'ongoing' && ongoingReleased > 2) {
    if (inCart) action = <Link to="/cart" className="btn btn-ghost btn-sm">In Cart</Link>;
    else if (user && myPerms?.canPurchase === false) action = <span className="btn btn-ghost btn-sm" style={{ opacity: 0.5, cursor: 'default' }}>Restricted</span>;
    else if (!user) action = <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`} className="btn btn-primary btn-sm">Get Book</Link>;
    else action = <Link to={bookPath(book)} className="btn btn-primary btn-sm">Buy Chapters</Link>;
  } else if (NOTIFY_STATUSES.has(book.status)) {
    action = <NotifyMeBtn book={book} user={user} />;
  } else if (inCart) {
    action = <Link to="/cart" className="btn btn-ghost btn-sm">In Cart</Link>;
  } else if (user && myPerms?.canPurchase === false) {
    action = <span className="btn btn-ghost btn-sm" style={{ opacity: 0.5, cursor: 'default' }}>Restricted</span>;
  } else if (!user) {
    action = <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`} className="btn btn-primary btn-sm">Get Book</Link>;
  } else {
    action = <button type="button" className="btn btn-primary btn-sm" onClick={() => addToCart(book)}>Add to Cart</button>;
  }

  return (
    <article className="bcard card">
      <div className="bcard__img-wrap">
        <BookCover book={book} />
        <div className="bcard__overlay">
          <Link to={bookPath(book)} className="btn btn-primary btn-sm">View Book</Link>
        </div>
        <div className="bcard__wishlist-btn" onClick={e => e.stopPropagation()}>
          <WishlistButton book={book} size="sm" />
        </div>
        {NO_PURCHASE_STATUSES.has(book.status) && (
          <div className="bcard__veil">
            <BookBadges book={book} cardMode maxExtras={0} />
            <Link to={bookPath(book)} className="btn btn-sm bcard__veil-btn">
              Preview →
            </Link>
          </div>
        )}
        {book.isNew && !NO_PURCHASE_STATUSES.has(book.status) && (
          <span className="badge badge-gold bcard__new">New</span>
        )}
        {/* One cover mark only: status if noteworthy, else True Story, else one highlight */}
        {!NO_PURCHASE_STATUSES.has(book.status) && (
          book.status && book.status !== 'complete' ? (
            <BookBadges
              book={book}
              cardMode
              maxExtras={0}
              style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 5 }}
            />
          ) : book.inspired ? (
            <span className="bcard__inspired-badge">✦ True Story</span>
          ) : (
            Array.isArray(book.badges) && book.badges.length > 0 && (
              <BookBadges
                book={{ ...book, status: null }}
                cardMode
                maxExtras={1}
                style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 5 }}
              />
            )
          )
        )}
      </div>
      <div className="bcard__body">
        <span className="bcard__genre">{book.genre}</span>
        {secondaryGenres.length > 0 && (
          <div className="bcard__genre-tags">
            {secondaryGenres.map(g => (
              <span key={g} className="bcard__genre-tag">{g}</span>
            ))}
            {extraGenreCount > 0 && (
              <span className="bcard__genre-tag bcard__genre-tag--more">+{extraGenreCount}</span>
            )}
          </div>
        )}
        <h3 className="bcard__title"><Link to={bookPath(book)}>{book.title}</Link></h3>
        <p className="bcard__author">by {book.author}</p>
        <p className="bcard__excerpt">{book.excerpt}</p>
        {book.inspired && book.inspiredNote && (
          <p className="bcard__inspired-note">✦ {book.inspiredNote}</p>
        )}

        <div className="bcard__meta">
          <span className="bcard__stars">
            {'★'.repeat(Math.floor(book.rating || 0))}
            <span className="bcard__rating"> {book.rating}</span>
          </span>
          {book.status === 'ongoing' ? (
            ongoingReleased > 2 ? (
              <span className="bcard__time" style={{ color: '#4a9eff' }}>
                {ongoingReleased} ch{ongoingTotal > 0 ? ` / ${ongoingTotal}` : '+'}
              </span>
            ) : (
              <span className="bcard__time" style={{ color: '#4a9eff' }}>
                {ongoingReleased > 0
                  ? `${ongoingReleased} ch${ongoingTotal > 0 ? ` / ${ongoingTotal}` : ''}`
                  : 'Ongoing'}
              </span>
            )
          ) : (
            <span className="bcard__time">{getReadingTimeDisplay(book)}</span>
          )}
        </div>

        <div className="bcard__footer">
          {NO_PURCHASE_STATUSES.has(book.status) ? (
            <span className="bcard__status-note">
              {book.status === 'coming-soon' ? 'Coming soon' : 'In development'}
            </span>
          ) : (
            <div className="bcard__price"><small>KSh</small><strong>{book.price}</strong></div>
          )}
          <div className="bcard__actions">
            {action}
            {!owned && !NO_PURCHASE_STATUSES.has(book.status) && (
              <a
                href={waOrderLink(book.title, book.price)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn bcard__wa-btn btn-sm"
                title="Order via WhatsApp"
                aria-label="Order via WhatsApp"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
