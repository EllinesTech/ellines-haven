import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import BookCard, { waOrderLink, BookStatusBadge } from '../components/BookCard';
import BookReviews from '../components/BookReviews';
import WishlistButton from '../components/WishlistButton';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { findBookBySlugOrId, bookPath, readPath } from '../utils/slugify';
import { getReadingTimeDisplay } from '../utils/readingTime';
import './BookDetail.css';

// Statuses that block purchase entirely — only Notify Me
const NO_PURCHASE_STATUSES = new Set(['coming-soon', 'draft']);
// Statuses that show Notify Me alongside purchase
const NOTIFY_ALONGSIDE = new Set(['ongoing', 'limited']);

/* ── Notify Me button for Book Detail page ── */
function NotifyMeDetailBtn({ book }) {
  const { user } = useApp();
  const storageKey = 'eh_notify_' + book.id;
  const [state, setState] = useState(() =>
    localStorage.getItem(storageKey) ? 'done' : 'idle'
  );

  const handle = async () => {
    if (!user) { window.location.href = '/login'; return; }
    setState('loading');
    try {
      const key = `notify_${book.id}_${user.email.replace(/[^a-z0-9]/gi,'_').toLowerCase()}`;

      // Write to contact_messages FIRST — admin reads from here, rules are open
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
      // Best-effort write to notifications collection
      setDoc(doc(db, 'notifications', key), {
        bookId: book.id, bookTitle: book.title,
        email: user.email.toLowerCase(), name: user.name,
        status: book.status, createdAt: serverTimestamp(), notified: false,
      }).catch(() => {});

      localStorage.setItem(storageKey, 'true');
      setState('done');
    } catch { setState('idle'); }
  };

  if (state === 'done') return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', background:'rgba(46,204,113,0.08)', border:'1px solid rgba(46,204,113,0.3)', borderRadius:'var(--r-sm)' }}>
      <span style={{ fontSize:'1.4rem' }}>🔔</span>
      <div>
        <strong style={{ color:'var(--ok)', display:'block' }}>You're on the list!</strong>
        <span style={{ fontSize:'0.8rem', color:'var(--muted)' }}>
          {book.status === 'ongoing'
            ? `We'll notify you when all chapters of "${book.title}" are complete.`
            : `We'll notify you the moment "${book.title}" is available.`}
        </span>
      </div>
    </div>
  );

  const btnLabel = book.status === 'ongoing'
    ? '🔔 Notify Me When All Chapters Are Ready'
    : '🔔 Notify Me When Available';

  return (
    <div>
      <button className="btn btn-primary" style={{ width:'100%', marginBottom:10 }} onClick={handle} disabled={state === 'loading'}>
        {state === 'loading' ? '⏳ Saving…' : btnLabel}
      </button>
      <p style={{ fontSize:'0.76rem', color:'var(--muted)', textAlign:'center' }}>
        {!user ? 'Sign in to get notified' : 'Free — no spam. One email when it launches.'}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────
   CoverLightbox — full-screen zoom & pan
   • Scroll wheel / trackpad  → zoom
   • Click + drag             → pan
   • +/− buttons + reset
   • Esc or backdrop click    → close
───────────────────────────────────────── */
function CoverLightbox({ book, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos,   setPos]   = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastXY   = useRef({ x: 0, y: 0 });
  const stageRef = useRef(null);

  /* clamp pan so image doesn't drift fully off-screen */
  const clamp = useCallback((x, y, s) => {
    const el = stageRef.current;
    if (!el) return { x, y };
    const hw = el.clientWidth  / 2;
    const hh = el.clientHeight / 2;
    const maxX = Math.max(0, hw  * (s - 1));
    const maxY = Math.max(0, hh  * (s - 1));
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  /* scroll-wheel zoom */
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(s => {
      const next = Math.min(6, Math.max(0.5, s * factor));
      setPos(p => clamp(p.x, p.y, next));
      return next;
    });
  }, [clamp]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  /* drag to pan */
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastXY.current   = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastXY.current.x;
    const dy = e.clientY - lastXY.current.y;
    lastXY.current = { x: e.clientX, y: e.clientY };
    setPos(p => clamp(p.x + dx, p.y + dy, scale));
  };
  const stopDrag = () => { dragging.current = false; };

  /* button zoom */
  const zoomBy = (d) => setScale(s => {
    const next = Math.min(6, Math.max(0.5, parseFloat((s + d).toFixed(2))));
    setPos(p => clamp(p.x, p.y, next));
    return next;
  });
  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  /* keyboard */
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape')                   onClose();
      if (e.key === '+' || e.key === '=')        zoomBy(0.25);
      if (e.key === '-')                         zoomBy(-0.25);
      if (e.key === '0')                         reset();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  /* lock body scroll */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const pct = Math.round(scale * 100);
  const isDragging = dragging.current;

  return (
    <div className="lb-overlay" onClick={onClose} aria-modal="true" role="dialog" aria-label="Cover zoom">

      {/* floating toolbar */}
      <div className="lb-toolbar" onClick={e => e.stopPropagation()}>
        <button className="lb-btn" onClick={() => zoomBy(-0.25)} title="Zoom out (−)">−</button>
        <span className="lb-pct">{pct}%</span>
        <button className="lb-btn" onClick={() => zoomBy(0.25)}  title="Zoom in (+)">+</button>
        <button className="lb-btn lb-sep"   onClick={reset}   title="Reset (0)">↺</button>
        <button className="lb-btn lb-close" onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      {/* zoomable / pannable stage */}
      <div
        className="lb-stage"
        ref={stageRef}
        onClick={e => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <div
          className="lb-img-wrap"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        >
          {book.coverType === 'photo' && book.cover
            ? <picture>
                <source srcSet={book.cover.replace(/\.png$/i, '.webp')} type="image/webp" />
                <img src={book.cover} alt={book.title} className="lb-img" draggable="false" decoding="async" />
              </picture>
            : <div className="lb-styled-cover"
                style={{ background: book.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}>
                <div className="bd-cover-inner">
                  <img src="/logo-icon.png" alt="" className="bd-cover-logo" />
                  <span className="bd-cover-genre" style={{ color: book.coverAccent || '#c9a84c' }}>{book.genre}</span>
                  <h3 className="bd-cover-title" style={{ color: '#f0ece2' }}>{book.title}</h3>
                  <span className="bd-cover-author">Elijah Mwangi M</span>
                  <div className="bd-cover-rule" style={{ background: book.coverAccent || '#c9a84c' }} />
                </div>
              </div>
          }
        </div>
      </div>

      <div className="lb-hint" onClick={e => e.stopPropagation()}>
        Scroll to zoom · Drag to pan · Esc to close
      </div>
    </div>
  );
}

/* ── Share Book Button ── */
function ShareBookButton({ book }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${bookPath(book)}`;
  const text = `Check out "${book.title}" by ${book.author} on Ellines Haven!`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: book.title, text, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <button
      className="wl-btn wl-btn--md"
      onClick={handleShare}
      title="Share this book"
      aria-label="Share this book"
      style={{ gap: 7 }}
    >
      {copied ? (
        <>✅ <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Copied!</span></>
      ) : (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Share</span>
        </>
      )}
    </button>
  );
}

/* ── Free Sample Preview ── */
function FreeSample({ book }) {
  const [open, setOpen] = useState(false);
  const excerpt = book.excerpt || '';
  // Show ~300 chars as teaser, full excerpt when expanded
  const teaser  = excerpt.slice(0, 300);
  const hasMore = excerpt.length > 300;

  return (
    <div className="bd-sample">
      <div className="bd-sample-header">
        <div>
          <h3>📖 Free Sample</h3>
          <p>Read the opening passage before you buy.</p>
        </div>
        <button
          className={'btn btn-outline btn-sm bd-sample-toggle' + (open ? ' active' : '')}
          onClick={() => setOpen(o => !o)}
        >
          {open ? 'Hide Sample' : 'Read Sample'}
        </button>
      </div>
      {open && (
        <div className="bd-sample-body">
          <div className="bd-sample-text">
            {(hasMore && !open ? teaser + '…' : excerpt)
              .split('\n\n')
              .map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <div className="bd-sample-cta">
            <span>— End of free sample —</span>
            <Link to="/cart" className="btn btn-primary btn-sm">
              Get the full book — KSh {book.price}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   OngoingSeriesPurchase — series-style chapter buy panel
   Shows up when a book is 'ongoing' with > 2 chapters out.
   Lets readers buy all released chapters (whole book price)
   OR purchase individual chapters (price ÷ totalChapters).
─────────────────────────────────────────────────────────── */
function OngoingSeriesPurchase({ book, owned, libLoaded }) {
  const { addToCart, cart, user, myPerms, siteControls, isChapterOwned } = useApp();
  const navigate = useNavigate();

  // Derive chapter counts from available data
  const isPart = (s) => /^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(s);
  const realToc = (book.tableOfContents || []).filter(t => !isPart(t));
  const releasedCount = book.chaptersReleased > 0
    ? book.chaptersReleased
    : realToc.length > 0
      ? realToc.length
      : book.chapterCount > 0 ? book.chapterCount : 0;
  const totalPlanned = book.totalChapters > 0 ? book.totalChapters
    : book.chapterCount > 0 ? book.chapterCount : releasedCount;

  // Only render this component if ongoing & more than 2 chapters out
  if (book.status !== 'ongoing' || releasedCount <= 2) return null;

  const wholeBookInCart = cart.some(b => b.id === book.id && !b.isChapter);
  const siteReadOnly = siteControls?.readOnlyMode;

  // Per-chapter price: respect admin override, otherwise auto-calculate
  const chapterPrice = (book.chapterPriceOverride > 0)
    ? book.chapterPriceOverride
    : book.price > 0
      ? Math.ceil((book.price / totalPlanned) / 5) * 5
      : 50;

  const [mode, setMode] = useState('all');
  const [addedMsg, setAddedMsg] = useState('');
  const [grantedChapters, setGrantedChapters] = useState([]);

  // Load admin grants for this user's email if logged in
  useEffect(() => {
    if (!user?.email) {
      // Even without login, show first chapter as free if enabled
      if (book.freeFirstChapter) {
        setGrantedChapters([0]);
      }
      return;
    }
    const loadGrants = async () => {
      try {
        // Automatically grant first chapter if enabled
        const chapters = book.freeFirstChapter ? [0] : [];
        setGrantedChapters(chapters);
        // TODO: Could query user_chapter_grants collection here if needed
      } catch (e) {
        console.log('Could not load grants:', e);
      }
    };
    loadGrants();
  }, [user?.email, book.id, book.freeFirstChapter]);

  const flashMsg = (msg) => { setAddedMsg(msg); setTimeout(() => setAddedMsg(''), 2200); };

  // Redirect to login if not signed in; returns true when redirected
  const requireLogin = () => {
    if (!user) { navigate('/login', { state: { from: window.location.pathname } }); return true; }
    return false;
  };

  const addWholeBook = () => {
    if (requireLogin()) return;
    addToCart(book);
    flashMsg('📚 All chapters added to cart!');
  };

  const addChapter = (idx) => {
    if (requireLogin()) return;
    const tocTitle = realToc[idx] || `Chapter ${idx + 1}`;
    const chapterId = `${book.id}_ch_${idx + 1}`;
    if (cart.some(b => b.chapterId === chapterId)) return;
    addToCart({
      id: chapterId, bookId: book.id, chapterId, chapterNum: idx + 1, isChapter: true,
      title: `${book.title} — Chapter ${idx + 1}`,
      chapterTitle: tocTitle.replace(/^(Chapter \d+|Day \d+) — /, ''),
      cover: book.cover, coverType: book.coverType, price: chapterPrice, genre: book.genre,
    });
    flashMsg(`Ch. ${idx + 1} added to cart`);
  };

  if (owned) return null;

  return (
    <div id="bd-series-purchase" style={{
      marginTop: 24,
      border: '1px solid rgba(74,158,255,0.3)',
      borderRadius: 'var(--r)',
      overflow: 'hidden',
      background: 'rgba(74,158,255,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 18px',
        background: 'rgba(74,158,255,0.08)',
        borderBottom: '1px solid rgba(74,158,255,0.2)',
      }}>
        <span style={{ fontSize: '1.3rem' }}>📖</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#4a9eff', fontSize: '0.92rem', display: 'block' }}>
            Ongoing Series — {releasedCount} of {totalPlanned} Chapters Released
          </strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            New chapters added regularly · Buy all or start with one
          </span>
        </div>
        <div style={{
          background: 'rgba(74,158,255,0.15)', border: '1px solid rgba(74,158,255,0.35)',
          borderRadius: 20, padding: '3px 12px', fontSize: '0.7rem',
          fontWeight: 800, color: '#4a9eff', letterSpacing: 0.5, whiteSpace: 'nowrap',
        }}>
          {releasedCount}/{totalPlanned} out
        </div>
      </div>

      {/* Free first chapter banner — show if enabled and not owned */}
      {book.freeFirstChapter && !owned && (
        <div style={{ padding: '12px 18px', background: 'rgba(74,158,255,0.08)', borderBottom: '1px solid rgba(74,158,255,0.2)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#4a9eff', fontWeight: 600 }}>🎁 Read the first chapter free — no login or purchase required</span>
        </div>
      )}

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 0, padding: '12px 18px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setMode('all')}
          style={{
            flex: 1, padding: '9px 14px', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.15s',
            background: mode === 'all' ? '#4a9eff' : 'transparent',
            color: mode === 'all' ? '#000' : 'var(--muted)',
            borderRadius: book.allowIndividualPurchase === false ? '8px 8px 0 0' : '8px 0 0 0',
            borderBottom: mode === 'all' ? '2px solid #4a9eff' : '2px solid transparent',
          }}
        >
          📦 Buy All ({releasedCount} Chapters)
        </button>
        {book.allowIndividualPurchase !== false && (
          <button
            onClick={() => setMode('individual')}
            style={{
              flex: 1, padding: '9px 14px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.15s',
              background: mode === 'individual' ? 'rgba(201,168,76,0.12)' : 'transparent',
              color: mode === 'individual' ? 'var(--gold)' : 'var(--muted)',
              borderRadius: '0 8px 0 0', borderBottom: mode === 'individual' ? '2px solid var(--gold)' : '2px solid transparent',
            }}
          >
            🎯 Buy Individual Chapters
          </button>
        )}
      </div>

      <div style={{ padding: '16px 18px' }}>

        {/* ── Buy All mode ── */}
        {mode === 'all' && (
          <div>
            {/* Free first chapter offer */}
            {book.freeFirstChapter && !owned && !(cart.some(b => b.id === book.id && !b.isChapter)) && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.25)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.82rem', color: '#4a9eff', fontWeight: 600, marginBottom: 8 }}>🎁 Start with Chapter 1 — Free</div>
                <Link to={readPath(book)} state={{ chapter: 0 }} className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }}>
                  Read Chapter 1 Free (No Purchase)
                </Link>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 2 }}>Full access price</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>
                  <small style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--muted)', marginRight: 2 }}>KSh</small>
                  {book.price}
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', flex: 1 }}>
                Includes all {releasedCount} chapters now + every new chapter as it releases. Best value.
              </div>
            </div>
            {siteReadOnly ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                Orders are temporarily paused. Check back soon.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {wholeBookInCart
                  ? <Link to="/cart" className="btn btn-primary" style={{ background: '#4a9eff', color: '#000' }}>
                      Go to Cart →
                    </Link>
                  : <button
                      className="btn btn-primary"
                      style={{ background: '#4a9eff', color: '#000' }}
                      onClick={addWholeBook}
                    >
                      {user ? `Add All Chapters — KSh ${book.price}` : '🔒 Sign In to Buy'}
                    </button>
                }
              <a
                href={waOrderLink(book.title, book.price)}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-wa"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Order via WhatsApp
              </a>
            </div>
            )}
            {addedMsg && (
              <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#4a9eff', fontWeight: 600 }}>
                {addedMsg}
              </div>
            )}
          </div>
        )}

        {/* ── Individual chapters mode ── */}
        {mode === 'individual' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Each chapter: <strong style={{ color: 'var(--gold)' }}>KSh {chapterPrice}</strong>
              {' '}· {releasedCount} available now
              {' '}· <span style={{ color: '#4a9eff' }}>Buying all individually costs KSh {chapterPrice * releasedCount} — save KSh {chapterPrice * releasedCount - book.price} with the full bundle</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {realToc.slice(0, releasedCount).map((tocItem, idx) => {
                const chapterId = `${book.id}_ch_${idx + 1}`;
                const inCart2 = cart.some(b => b.chapterId === chapterId);
                const alreadyOwned = isChapterOwned ? isChapterOwned(book.id, idx + 1) : false;
                const isGranted = grantedChapters.includes(idx); // admin grant
                const chapTitle = tocItem.replace(/^(Chapter \d+|Day \d+) — /, '');
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: (alreadyOwned || isGranted) ? 'rgba(46,204,113,0.06)' : 'var(--card)',
                    border: (alreadyOwned || isGranted) ? '1px solid rgba(46,204,113,0.25)' : '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: '0.7rem', color: (alreadyOwned || isGranted) ? 'var(--ok)' : 'var(--muted)', fontWeight: 700, minWidth: 28 }}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text)' }}>{chapTitle}</span>
                    {alreadyOwned || isGranted ? (
                      <span style={{ fontSize: '0.72rem', color: 'var(--ok)', fontWeight: 600, padding: '3px 10px' }}>
                        ✓ {isGranted && !alreadyOwned ? (idx === 0 ? '🎁 Free' : 'Granted') : 'Owned'}
                      </span>
                    ) : siteReadOnly ? null : (
                      <>
                        <span style={{ fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 600, marginRight: 6 }}>
                          KSh {chapterPrice}
                        </span>
                        {inCart2
                          ? <Link to="/cart" className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', padding: '4px 10px' }}>
                              In Cart
                            </Link>
                          : <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.72rem', padding: '4px 12px' }}
                              onClick={() => addChapter(idx)}
                            >
                              {user ? '+ Add' : '🔒 Sign In'}
                            </button>
                        }
                      </>
                    )}
                  </div>
                );
              })}
              {/* Upcoming chapters (locked) */}
              {Array.from({ length: Math.max(0, totalPlanned - releasedCount) }).map((_, idx) => (
                <div key={`upcoming-${idx}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  opacity: 0.45,
                }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700, minWidth: 28 }}>
                    {String(releasedCount + idx + 1).padStart(2, '0')}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                    Coming soon…
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>🔒</span>
                </div>
              ))}
            </div>
            {addedMsg && (
              <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--gold)', fontWeight: 600 }}>
                ✓ {addedMsg}
              </div>
            )}
            {cart.some(b => b.isChapter && b.bookId === book.id) && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Link to="/cart" className="btn btn-outline btn-sm">
                  View Cart ({cart.filter(b => b.isChapter && b.bookId === book.id).length} ch)
                </Link>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Or switch to "Buy All" for the best deal
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Table of Contents section — with admin inline editor ── */
function TocSection({ book, owned, libLoaded, user }) {
  const { setBooks, books } = useApp();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const toc = book.tableOfContents || [];

  const startEdit = () => {
    setDraft(toc.join('\n'));
    setEditing(true);
    setSaveMsg('');
  };
  const cancel = () => { setEditing(false); setSaveMsg(''); };

  const save = async () => {
    setSaving(true);
    const updated = draft.split('\n').map(l => l.trim()).filter(Boolean);

    // Update via AppContext.setBooks — this handles stripping large fields,
    // saving to localStorage AND persisting to Firestore for ALL users
    const newBooks = books.map(b => b.id === book.id ? { ...b, tableOfContents: updated } : b);
    setBooks(newBooks); // ← AppContext writes to Firestore automatically

    setSaveMsg('✅ Saved — all users will see the updated TOC');
    setSaving(false);
    setEditing(false);
  };

  return (
    <section className="section bd-toc-section">
      <div className="container">
        <div className="bd-toc">
          <div className="bd-toc-header">
            <h2>Table of Contents</h2>
            <span className="bd-toc-count">
              {toc.filter(item => !/^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(item)).length}{' '}
              {book.type === 'short-story' ? 'stories' : 'chapters'}
            </span>
          </div>

          {/* Admin edit bar */}
          {isAdmin && (
            <div className="bd-toc-admin-bar">
              {!editing ? (
                <button className="bd-toc-edit-btn" onClick={startEdit}>
                  ✏️ Edit TOC
                </button>
              ) : null}
              {saveMsg && !editing && (
                <span style={{ fontSize:'0.78rem', color: saveMsg.startsWith('✅') ? 'var(--ok)' : '#e8832a', marginLeft:8 }}>{saveMsg}</span>
              )}
            </div>
          )}

          {/* Inline editor */}
          {editing && (
            <div className="bd-toc-editor">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={Math.max(10, draft.split('\n').length + 2)}
                placeholder={'PART ONE — BEFORE LOVE\nChapter 1 — The First Meeting\nChapter 2 — Something Like Love\nPART TWO — FINDING EACH OTHER\nChapter 3 — Years Later'}
              />
              <span className="bd-toc-editor-hint">
                One entry per line. Part dividers: start with <strong>PART</strong>, <strong>ACT</strong>, <strong>BOOK</strong>, or <strong>SECTION</strong> (e.g. <em>PART ONE — BEFORE LOVE</em>) — they appear as roman-numeral section headers, not numbered chapters. Everything else is treated as a chapter.
              </span>
              <div className="bd-toc-editor-actions">
                <button className="bd-toc-editor-save" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : '💾 Save Changes'}
                </button>
                <button className="bd-toc-editor-cancel" onClick={cancel}>Cancel</button>
              </div>
            </div>
          )}

          {!owned && libLoaded && !NO_PURCHASE_STATUSES.has(book.status) && (
            <div className="bd-toc-gate-note">
              🔒 Purchase this book to unlock all chapters and read online
            </div>
          )}

          {/* Chapter list — flows top-to-bottom per column */}
          <ol className="bd-toc-list">
            {(() => {
              // Detect whether an entry is a "part" divider
              const isPart = (s) => /^PART\s/i.test(s) || /^ACT\s/i.test(s) || /^BOOK\s/i.test(s) || /^SECTION\s/i.test(s) || /^VOLUME\s/i.test(s);
              // Roman numeral helper (up to 20)
              const ROMANS = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
              let chapterNum  = 0; // counts only real chapters
              let partNum     = 0; // counts part dividers

              return toc.map((item, i) => {
                if (isPart(item)) {
                  partNum++;
                  const roman = ROMANS[partNum] || String(partNum);
                  return (
                    <li key={i} className="bd-toc-item bd-toc-part-row">
                      <span className="bd-toc-part-divider">
                        <span className="bd-toc-part-num">{roman}</span>
                        <span className="bd-toc-part-label">{item}</span>
                      </span>
                    </li>
                  );
                }

                chapterNum++;
                const title = item.replace(/^(Chapter \d+|Story \d+|Day \d+) — /, '');
                const numStr = String(chapterNum).padStart(2, '0');

                if (owned) {
                  return (
                    <li key={i} className="bd-toc-item bd-toc-item--link">
                      <Link to={readPath(book)} state={{ chapter: i }} className="bd-toc-row">
                        <span className="bd-toc-num">{numStr}</span>
                        <span className="bd-toc-title">{title}</span>
                        <span className="bd-toc-arrow">→</span>
                      </Link>
                    </li>
                  );
                }
                if (user && !libLoaded) {
                  return (
                    <li key={i} className="bd-toc-item">
                      <span className="bd-toc-row">
                        <span className="bd-toc-num">{numStr}</span>
                        <span className="bd-toc-title">{title}</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={i} className="bd-toc-item bd-toc-item--locked">
                    <span className="bd-toc-row" onClick={() => {
                      if (!NO_PURCHASE_STATUSES.has(book.status)) {
                        document.getElementById('bd-purchase-section')?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}>
                      <span className="bd-toc-num">{numStr}</span>
                      <span className="bd-toc-title">{title}</span>
                      <span className="bd-toc-lock">🔒</span>
                    </span>
                  </li>
                );
              });
            })()}
          </ol>

          {!owned && libLoaded && !NO_PURCHASE_STATUSES.has(book.status) && (
            <div className="bd-toc-cta">
              <Link to={bookPath(book)} className="btn btn-primary" onClick={() => {
                document.getElementById('bd-purchase-section')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                Buy to Unlock All Chapters — KSh {book.price}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function BookDetail() {
  const { id } = useParams();
  const { addToCart, cart, books, user, isOwned, myPerms, siteControls, libLoaded } = useApp();
  const [lightbox, setLightbox] = useState(false);

  const book = findBookBySlugOrId(books, id);

  // ── Dynamic page title & OG meta for sharing ──────────────────────────────
  useEffect(() => {
    if (!book) return;
    // Page title
    document.title = `${book.title} by ${book.author} — Ellines Haven`;

    // OG meta tags (create or update)
    const setMeta = (property, content) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
      el.setAttribute('content', content);
    };
    const setMetaName = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
      el.setAttribute('content', content);
    };

    setMeta('og:title',       `${book.title} by ${book.author}`);
    setMeta('og:description', book.description?.slice(0, 160) || `A ${book.genre} story by ${book.author} — available on Ellines Haven`);
    setMeta('og:type',        'book');
    setMeta('og:url',         `${window.location.origin}${bookPath(book)}`);
    if (book.coverType === 'photo' && book.cover) {
      setMeta('og:image', book.cover);
    }
    setMeta('og:site_name',   'Ellines Haven');
    setMetaName('twitter:card',        'summary_large_image');
    setMetaName('twitter:title',       `${book.title} by ${book.author}`);
    setMetaName('twitter:description', book.description?.slice(0, 160) || '');

    // ── Book JSON-LD structured data (no price — may change) ──────────────
    const schemaId = 'eh-book-schema';
    let schemaEl = document.getElementById(schemaId);
    if (!schemaEl) {
      schemaEl = document.createElement('script');
      schemaEl.type = 'application/ld+json';
      schemaEl.id   = schemaId;
      document.head.appendChild(schemaEl);
    }

    const schema = {
      '@context':    'https://schema.org',
      '@type':       'Book',
      name:          book.title,
      author: {
        '@type': 'Person',
        name:    book.author,
      },
      url:           `${window.location.origin}${bookPath(book)}`,
      description:   book.description?.slice(0, 300) || '',
      genre:         book.genres ? book.genres.join(', ') : book.genre,
      inLanguage:    'en',
      ...(book.pages > 0 && { numberOfPages: book.pages }),
      ...(book.coverType === 'photo' && book.cover && {
        image: `${window.location.origin}${book.cover}`,
      }),
      ...(book.date && { datePublished: book.date }),
      ...(book.reviews > 0 && {
        aggregateRating: {
          '@type':       'AggregateRating',
          ratingValue:   book.rating,
          reviewCount:   book.reviews,
          bestRating:    5,
          worstRating:   1,
        },
      }),
      publisher: {
        '@type': 'Organization',
        name:    'Ellines Haven',
        url:     window.location.origin,
      },
    };

    schemaEl.textContent = JSON.stringify(schema);

    return () => {
      document.title = 'Ellines Haven';
      const s = document.getElementById(schemaId);
      if (s) s.remove();
    };
  }, [book]);

  if (!book) return <div className="bd-missing"><h2>Book not found</h2><Link to="/library" className="btn btn-primary">Back to Library</Link></div>;

  // Permission: canViewBookDetails
  if (user && myPerms?.canViewBookDetails === false) {
    return (
      <div className="bd-missing">
        <div style={{ fontSize:'2.5rem', marginBottom:12 }}>🔒</div>
        <h2>Access Restricted</h2>
        <p style={{ color:'var(--muted)', marginBottom:16 }}>You don't have permission to view book details.</p>
        <Link to="/library" className="btn btn-primary">Back to Library</Link>
      </div>
    );
  }

  const inCart  = cart.some(b => b.id === book.id);
  const owned   = isOwned(book?.id ?? id);
  // readOnlyMode and permissions gate purchase.
  // libLoaded only blocks for logged-in users (guest always gets buy buttons).
  const canAdd  = (!user || libLoaded)            // guests pass immediately; logged-in users wait for lib
    && !siteControls?.readOnlyMode
    && myPerms?.canPurchase !== false
    && !NO_PURCHASE_STATUSES.has(book.status);

  // Smart recommendations: same genre first, then overlapping themes, then anything not owned
  const related = (() => {
    const others = books.filter(b => b.id !== book.id);
    const scored = others.map(b => {
      let score = 0;
      if (b.genre === book.genre)  score += 3;
      const bookThemes = new Set(book.themes || []);
      (b.themes || []).forEach(t => { if (bookThemes.has(t)) score += 1; });
      if ((b.genres || []).some(g => (book.genres || []).includes(g))) score += 1;
      // Slight boost for same audience rating
      if (b.audienceRating === book.audienceRating) score += 0.5;
      return { b, score };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(x => x.b);
  })();

  return (
    <main>
      <div className="bd-wrap">
        <div className="container">
          <Link to="/library" className="bd-back">← Back to Library</Link>
          <div className="bd-grid">
            <div className="bd-left">
              {book.coverType === 'photo' && book.cover
                ? <picture>
                    <source srcSet={book.cover.replace(/\.png$/i, '.webp')} type="image/webp" />
                    <img
                      src={book.cover}
                      alt={book.title}
                      className="bd-cover bd-cover--zoomable"
                      loading="eager"
                      decoding="async"
                      onClick={() => setLightbox(true)}
                      title="Click to zoom cover"
                    />
                  </picture>
                : <div
                    className="bd-cover bd-cover-styled bd-cover--zoomable"
                    style={{ background: book.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}
                    onClick={() => setLightbox(true)}
                    title="Click to zoom cover"
                  >
                    <div className="bd-cover-inner">
                      <img src="/logo-icon.png" alt="" className="bd-cover-logo" />
                      <span className="bd-cover-genre" style={{ color: book.coverAccent || '#c9a84c' }}>{book.genre}</span>
                      <h3 className="bd-cover-title" style={{ color: '#f0ece2' }}>{book.title}</h3>
                      <span className="bd-cover-author">Elijah Mwangi M</span>
                      <div className="bd-cover-rule" style={{ background: book.coverAccent || '#c9a84c' }} />
                    </div>
                  </div>
              }
              <div className="bd-badges">
                {book.isNew && <span className="badge badge-gold">New Release</span>}
                <span className="badge badge-blue">{book.type === 'novel' ? 'Novel' : 'Short Story'}</span>
                {book.status && (
                  <BookStatusBadge status={book.status} />
                )}
              </div>
            </div>
            <div className="bd-right">
              <span className="bd-genre">{book.genre}</span>
              <h1 className="bd-title">{book.title}</h1>
              <p className="bd-author">by <strong>{book.author}</strong></p>

              {/* ── Genre tags ── */}
              {book.genres && book.genres.length > 0 && (
                <div className="bd-genre-tags">
                  {book.genres.map(g => (
                    <span key={g} className="bd-genre-tag">{g}</span>
                  ))}
                </div>
              )}

              {/* ── Setting ── */}
              {book.setting && (
                <div className="bd-setting">
                  <span className="bd-setting-icon">📍</span>
                  <span>{book.setting}</span>
                </div>
              )}

              {/* ── Status notice ── */}
              {book.status && (() => {
                const meta = {
                  complete:     { msg:'This book is fully published — all chapters available immediately after purchase.', color:'#2ecc71' },
                  ongoing:      { msg:'This book is being released in chapters. New chapters added regularly.', color:'#4a9eff' },
                  premium:      { msg:'Premium title — full access requires purchase. No free preview available.', color:'#c9a84c' },
                  'free-preview':{ msg:'First chapters are free. Purchase to unlock the full book.', color:'#a855f7' },
                  'coming-soon':{ msg:'This title is coming soon — not yet available for purchase.', color:'#e8832a' },
                  limited:      { msg:'Limited edition — available for a limited time only.', color:'#e74c3c' },
                  draft:        { msg:'This book is a work in progress.', color:'#64748b' },
                }[book.status];
                if (!meta) return null;
                return (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:'var(--r-sm)', background:`${meta.color}14`, border:`1px solid ${meta.color}40`, marginBottom:8, fontSize:'0.82rem' }}>
                    <BookStatusBadge status={book.status} />
                    <span style={{ color:'var(--muted)' }}>{meta.msg}</span>
                  </div>
                );
              })()}
              <div className="bd-stars">
                <span style={{color:'var(--gold)'}}>{'★'.repeat(Math.floor(book.rating))}</span>
                <strong>{book.rating}</strong>
                <span className="bd-muted">({book.reviews} reviews)</span>
                {book.audienceRating && (
                  <span className="bd-audience-tag">{book.audienceRating}</span>
                )}
              </div>
              {book.ratingQuote && (
                <blockquote className="bd-rating-quote">{book.ratingQuote}</blockquote>
              )}
              <div className="bd-meta">
                {book.status === 'ongoing'
                  ? <>
                      <div>
                        <small>Chapters Out</small>
                        <strong style={{ color:'#4a9eff' }}>
                          {book.chaptersReleased > 0
                            ? book.chaptersReleased
                            : book.chapterCount > 0
                              ? book.chapterCount
                              : (book.tableOfContents?.length || book.chapters?.length || '—')}
                        </strong>
                      </div>
                      <div>
                        <small>Total Planned</small>
                        <strong>{book.totalChapters > 0 ? book.totalChapters : book.chapterCount > 0 ? book.chapterCount : 'TBA'}</strong>
                      </div>
                      <div>
                        <small>Status</small>
                        <strong style={{ color:'#4a9eff' }}>Releasing</strong>
                      </div>
                      <div><small>Read Time</small><strong>{getReadingTimeDisplay(book)}</strong></div>
                    </>
                  : <>
                      <div><small>Pages</small><strong>{book.pages > 0 ? book.pages : '—'}</strong></div>
                      <div><small>Read Time</small><strong>{getReadingTimeDisplay(book)}</strong></div>
                      {(book.chapterCount > 0 || book.tableOfContents?.length > 0) && (
                        <div>
                          <small>Chapters</small>
                          <strong>{book.chapterCount > 0 ? book.chapterCount : book.tableOfContents.length}</strong>
                        </div>
                      )}
                      <div><small>Released</small><strong>{new Date(book.date).toLocaleDateString('en-KE',{year:'numeric',month:'short'})}</strong></div>
                    </>
                }
              </div>
              {/* ── Excerpt (short teaser) ── */}
              {book.excerpt && (
                <div className="bd-excerpt-block">
                  <p className="bd-excerpt-text">{book.excerpt}</p>
                </div>
              )}

              {/* ── Themes ── */}
              {book.themes && book.themes.length > 0 && (
                <div className="bd-themes">
                  <span className="bd-themes-label">Themes:</span>
                  <div className="bd-themes-list">
                    {book.themes.map(t => (
                      <span key={t} className="bd-theme-tag">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Full Description ── */}
              <div className="bd-full-desc">
                {(book.description || '').split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              {/* Coming Soon / Draft — no purchase, just notify */}
              {(book.status === 'coming-soon' || book.status === 'draft') ? (
                <div style={{ padding:'20px 0' }}>
                  <div style={{ padding:'16px 20px', background:'rgba(232,131,42,0.08)', border:'1px solid rgba(232,131,42,0.25)', borderRadius:'var(--r-sm)', marginBottom:16 }}>
                    <strong style={{ color:'#e8832a', display:'block', marginBottom:6 }}>
                      {book.status === 'coming-soon' ? '🔜 Coming Soon' : '📝 In Development'}
                    </strong>
                    <p style={{ fontSize:'0.85rem', color:'var(--muted)', margin:0 }}>
                      {book.status === 'coming-soon'
                        ? 'This title is not yet available for purchase. Get notified the moment it launches.'
                        : 'This book is still being written. Check back soon.'}
                    </p>
                  </div>
                  <NotifyMeDetailBtn book={book} />
                </div>
              ) : (() => {
                // Determine if this is an ongoing series with > 2 chapters
                const isPart = (s) => /^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(s);
                const realToc = (book.tableOfContents || []).filter(t => !isPart(t));
                const releasedCount = book.chaptersReleased > 0
                  ? book.chaptersReleased
                  : realToc.length > 0 ? realToc.length
                  : book.chapterCount > 0 ? book.chapterCount : 0;
                const isOngoingSeries = book.status === 'ongoing' && releasedCount > 2;

                if (isOngoingSeries) {
                  return (
                    <div id="bd-purchase-section">
                      {/* If already owned, show Read button prominently */}
                      {owned && libLoaded && (
                        <div className="bd-purchase" style={{ marginBottom: 8 }}>
                          <div className="bd-price">
                            <small>Status</small>
                            <div style={{ color: 'var(--ok)', fontWeight: 700, fontSize: '1rem' }}>✓ Owned</div>
                          </div>
                          <div className="bd-actions">
                            <Link to={readPath(book)} className="btn btn-primary">📖 Read Here</Link>
                          </div>
                        </div>
                      )}
                      {(!owned || !libLoaded) && (
                        <OngoingSeriesPurchase book={book} owned={owned} libLoaded={libLoaded} />
                      )}
                    </div>
                  );
                }

                return (
                  <div className="bd-purchase" id="bd-purchase-section">
                    <div className="bd-price">
                      <small>Price</small>
                      <div><span className="bd-curr">KSh</span><span className="bd-amt">{book.price}</span></div>
                    </div>
                    <div className="bd-actions">
                      {owned
                        ? <Link to={readPath(book)} className="btn btn-primary">Read Now</Link>
                        : user && !libLoaded
                          ? <button className="btn btn-primary" disabled style={{opacity:0.6}}>⏳ Verifying access…</button>
                          : inCart
                            ? <Link to="/cart" className="btn btn-primary">Go to Cart →</Link>
                            : siteControls?.readOnlyMode
                              ? <span className="btn btn-primary" style={{opacity:0.5,cursor:'not-allowed',pointerEvents:'none'}}>Site in Read-Only Mode</span>
                              : user && myPerms?.canPurchase === false
                                ? <span className="btn btn-primary" style={{opacity:0.5,cursor:'not-allowed',pointerEvents:'none'}}>Purchasing Restricted</span>
                                : !user
                                  ? /* Guest — show login CTA (with free chapter link for free-preview) */
                                    book.status === 'free-preview'
                                      ? <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                          <Link
                                            to={readPath(book)}
                                            className="btn btn-outline"
                                            style={{ color:'#d4b5ff', borderColor:'rgba(168,85,247,0.5)', textAlign:'center' }}
                                          >
                                            👀 Read Free Chapter — No Login Needed
                                          </Link>
                                          <Link
                                            to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
                                            className="btn btn-primary"
                                          >
                                            🔐 Login or Register to Get Full Book
                                          </Link>
                                        </div>
                                      : <Link
                                          to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
                                          className="btn btn-primary"
                                          style={{ display:'flex', alignItems:'center', gap:8 }}
                                        >
                                          🔐 Login or Register to Get This Book
                                        </Link>
                                  : /* Logged-in, can purchase */
                                    <>
                                      {book.status === 'ongoing'
                                        ? <Link to={readPath(book)} className="btn btn-primary">Buy Chapters — KSh {book.price}</Link>
                                        : <button className="btn btn-primary" onClick={() => addToCart(book)}>Add to Cart — KSh {book.price}</button>
                                      }
                                      <a href={waOrderLink(book.title, book.price)} target="_blank" rel="noopener noreferrer" className="btn btn-wa">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                        Order via WhatsApp
                                      </a>
                                    </>
                      }
                    </div>
                  </div>
                );
              })()}
              {/* Notify Me alongside purchase for ongoing/limited */}
              {NOTIFY_ALONGSIDE.has(book.status) && !owned && (
                <div style={{ marginTop:12 }}>
                  <NotifyMeDetailBtn book={book} />
                </div>
              )}
              <div className="bd-trust">
                {!owned && <span>✓ Instant access after payment</span>}
                {!owned && <span>✓ M-Pesa · Card · PayPal accepted</span>}
                {!owned && <span>✓ Download or read online</span>}
                {owned && <span>✓ You own this book — read anytime</span>}
              </div>
              {/* Wishlist button */}
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <WishlistButton book={book} size="md" showLabel />
                <ShareBookButton book={book} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Author's Note ── */}
      {book.authorNote && (
        <section className="section bd-authornote-section">
          <div className="container">
            <div className="bd-authornote">
              <div className="bd-authornote-header">
                <span className="bd-authornote-icon">✍️</span>
                <h2>Author's Note</h2>
              </div>
              <div className="bd-authornote-body">
                {book.authorNote.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
              <div className="bd-authornote-sig">— {book.author}</div>
            </div>
          </div>
        </section>
      )}

      {/* ── Table of Contents ── */}
      {book.tableOfContents && book.tableOfContents.length > 0 && (
        <TocSection book={book} owned={owned} libLoaded={libLoaded} user={user} />
      )}
      {related.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="bd-related-title">Readers Like You Also <span className="gold-text">Love</span></h2>
            <p style={{ color:'var(--muted)', fontSize:'0.85rem', marginBottom:24, marginTop:4 }}>
              {related.length} recommendations based on genre, themes, and your reading style
            </p>
            <div className="bd-related-grid" style={{ marginTop:'8px', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))' }}>
              {related.map(b => <BookCard key={b.id} book={b} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── Free Sample Preview ── */}
      {!owned && book.excerpt && book.status !== 'coming-soon' && book.status !== 'draft' && (
        <section className="section bd-sample-section">
          <div className="container">
            <FreeSample book={book} />
          </div>
        </section>
      )}

      {/* ── Reader Reviews ── */}
      <section className="section">
        <div className="container">
          <BookReviews book={book} />
        </div>
      </section>

      {/* ── Cover zoom lightbox ── */}
      {lightbox && <CoverLightbox book={book} onClose={() => setLightbox(false)} />}
    </main>
  );
}
