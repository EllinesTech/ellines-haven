import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import WishlistButton from './WishlistButton';
import { bookPath, readPath } from '../utils/slugify';
import './BookCard.css';

// Statuses where buying is not applicable
const NO_PURCHASE_STATUSES = new Set(['coming-soon', 'draft']);
// Statuses where a "Notify Me" button makes sense
const NOTIFY_STATUSES = new Set(['coming-soon', 'ongoing', 'limited']);
const STATUS_META = {
  complete:     { label:'Complete',       icon:'✅', color:'#2ecc71', bg:'rgba(46,204,113,0.15)'  },
  ongoing:      { label:'Ongoing',        icon:'📖', color:'#4a9eff', bg:'rgba(74,158,255,0.15)'  },
  premium:      { label:'Premium',        icon:'⭐', color:'#c9a84c', bg:'rgba(201,168,76,0.15)'  },
  'free-preview':{ label:'Free Preview',  icon:'👀', color:'#a855f7', bg:'rgba(168,85,247,0.15)'  },
  'coming-soon':{ label:'Coming Soon',    icon:'🔜', color:'#e8832a', bg:'rgba(232,131,42,0.15)'  },
  limited:      { label:'Limited',        icon:'⏳', color:'#e74c3c', bg:'rgba(231,76,60,0.15)'   },
  draft:        { label:'Draft',          icon:'📝', color:'#64748b', bg:'rgba(100,116,139,0.15)' },
};

export function BookStatusBadge({ status, style = {} }) {
  if (!status || status === 'complete') return null; // don't clutter card with default
  const meta = STATUS_META[status];
  if (!meta) return null;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:'0.65rem', fontWeight:800, letterSpacing:0.8,
      padding:'4px 10px', borderRadius:20,
      background: meta.bg.replace(/[\d.]+\)$/, '0.55)'),
      color: meta.color,
      border:`1px solid ${meta.color}cc`,
      backdropFilter:'blur(4px)',
      WebkitBackdropFilter:'blur(4px)',
      textShadow:'0 1px 4px rgba(0,0,0,0.7)',
      boxShadow:`0 2px 8px rgba(0,0,0,0.4)`,
      ...style,
    }}>
      {meta.icon} {meta.label.toUpperCase()}
    </span>
  );
}

// Derive WebP path from a PNG cover path (e.g. /cover-pain.png → /cover-pain.webp)
function webpSrc(src) {
  if (!src) return null;
  return src.replace(/\.png$/i, '.webp');
}

function BookCover({ book, priority = false }) {
  if (book.coverType === 'photo' && book.cover) {
    return (
      <picture>
        <source srcSet={webpSrc(book.cover)} type="image/webp" />
        <img
          src={book.cover}
          alt={book.title}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="bcard__cover-photo"
        />
      </picture>
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
      // Not logged in — redirect hint
      window.location.href = '/login';
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

  if (state === 'done') {
    return (
      <span className="btn btn-sm" style={{ background:'rgba(46,204,113,0.1)', color:'var(--ok)', border:'1px solid rgba(46,204,113,0.3)', cursor:'default', fontSize:'0.72rem' }}>
        🔔 Notifying you
      </span>
    );
  }

  return (
    <button className="btn btn-sm" onClick={handleNotify} disabled={state === 'loading'}
      title="Get an email when this book is available"
      style={{ background:'rgba(201,168,76,0.1)', color:'var(--gold)', border:'1px solid rgba(201,168,76,0.3)', fontSize:'0.72rem' }}>
      {state === 'loading' ? '⏳' : '🔔 Notify Me'}
    </button>
  );
}

export default function BookCard({ book }) {
  const { addToCart, cart, isOwned, myPerms, user } = useApp();
  const inCart = cart.some(b => b.id === book.id);
  const owned = isOwned(book.id);

  return (
    <article className="bcard card">
      <div className="bcard__img-wrap">
        <BookCover book={book} />
        <div className="bcard__overlay">
          <Link to={bookPath(book)} className="btn btn-primary btn-sm">View Book</Link>
        </div>
        {/* Wishlist button — top right corner, always visible */}
        <div className="bcard__wishlist-btn" onClick={e => e.stopPropagation()}>
          <WishlistButton book={book} size="sm" />
        </div>
        {/* Coming Soon / Draft overlay */}
        {NO_PURCHASE_STATUSES.has(book.status) && (
          <div style={{ position:'absolute', inset:0, background:'rgba(10,10,20,0.55)', backdropFilter:'blur(2px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:4, gap:8 }}>
            <BookStatusBadge status={book.status} />
            <Link to={bookPath(book)} className="btn btn-sm" style={{ background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid rgba(255,255,255,0.2)', fontSize:'0.72rem' }}>
              Preview →
            </Link>
          </div>
        )}
        {book.isNew && <span className="badge badge-gold bcard__new">New</span>}
        {book.inspired && <span className="bcard__inspired-badge">✦ True Story</span>}
        {book.status && book.status !== 'complete' && !NO_PURCHASE_STATUSES.has(book.status) && (
          <BookStatusBadge status={book.status} style={{ position:'absolute', bottom: book.inspired ? 36 : 10, left:10, zIndex:5 }} />
        )}
      </div>
      <div className="bcard__body">
        <span className="bcard__genre">{book.genre}</span>
        {book.genres && book.genres.length > 0 && (
          <div className="bcard__genre-tags">
            {book.genres.slice(0, 2).map(g => (
              <span key={g} className="bcard__genre-tag">{g}</span>
            ))}
            {book.genres.length > 2 && (
              <span className="bcard__genre-tag bcard__genre-tag--more">+{book.genres.length - 2}</span>
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
          <span className="bcard__stars">{'★'.repeat(Math.floor(book.rating))}<span className="bcard__rating"> {book.rating}</span></span>
          {book.status === 'ongoing'
            ? (() => {
                // Auto-compute chapter count from available data sources
                const released = book.chaptersReleased > 0
                  ? book.chaptersReleased
                  : (book.tableOfContents?.filter(t => !/^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(t)).length || 0);
                const total = book.totalChapters > 0 ? book.totalChapters
                  : book.chapterCount > 0 ? book.chapterCount : 0;
                if (released > 2) {
                  return (
                    <span className="bcard__time bcard__chapters-badge" style={{ color:'#4a9eff' }}>
                      📖 {released} ch{total > 0 ? ` / ${total}` : ' + ongoing'}
                    </span>
                  );
                }
                return (
                  <span className="bcard__time" style={{ color:'#4a9eff' }}>
                    {released > 0 ? `${released} ch${total > 0 ? ` / ${total}` : ' ongoing'}` : 'Ongoing'}
                  </span>
                );
              })()
            : <span className="bcard__time">{book.readTime}</span>
          }
        </div>
        <div className="bcard__footer">
          {NO_PURCHASE_STATUSES.has(book.status)
            ? <span style={{ fontSize:'0.78rem', color:'var(--muted)', fontStyle:'italic' }}>
                {book.status === 'coming-soon' ? '🔜 Not available yet' : '📝 In development'}
              </span>
            : <div className="bcard__price"><small>KSh</small><strong>{book.price}</strong></div>
          }
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {owned
              ? <Link to={readPath(book)} className="btn btn-outline btn-sm">Read</Link>
              : NO_PURCHASE_STATUSES.has(book.status)
                ? <NotifyMeBtn book={book} user={user} />
                : book.status === 'ongoing' && (() => {
                    const released = book.chaptersReleased > 0
                      ? book.chaptersReleased
                      : (book.tableOfContents?.filter(t => !/^(PART|ACT|BOOK|SECTION|SECTION|VOLUME)\s/i.test(t)).length || 0);
                    return released > 2;
                  })()
                  ? inCart
                    ? <Link to="/cart" className="btn btn-ghost btn-sm">In Cart</Link>
                    : !myPerms || myPerms.canPurchase !== false
                      ? <Link to={bookPath(book)} className="btn btn-primary btn-sm">Buy Chapters</Link>
                      : <span className="btn btn-ghost btn-sm" style={{opacity:0.5,cursor:'default'}}>Restricted</span>
                : NOTIFY_STATUSES.has(book.status)
                  ? <NotifyMeBtn book={book} user={user} />
                  : inCart
                    ? <Link to="/cart" className="btn btn-ghost btn-sm">In Cart</Link>
                    : !myPerms || myPerms.canPurchase !== false
                      ? <button className="btn btn-primary btn-sm" onClick={() => addToCart(book)}>Add to Cart</button>
                      : <span className="btn btn-ghost btn-sm" style={{opacity:0.5,cursor:'default'}}>Restricted</span>
            }
            {!owned && !NO_PURCHASE_STATUSES.has(book.status) && (
              <a href={waOrderLink(book.title, book.price)} target="_blank" rel="noopener noreferrer"
                className="btn bcard__wa-btn btn-sm" title="Order via WhatsApp" aria-label="Order via WhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
