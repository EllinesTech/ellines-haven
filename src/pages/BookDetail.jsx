import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import BookCard, { waOrderLink, BookStatusBadge } from '../components/BookCard';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
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
        <span style={{ fontSize:'0.8rem', color:'var(--muted)' }}>We'll notify you the moment "{book.title}" is available.</span>
      </div>
    </div>
  );

  return (
    <div>
      <button className="btn btn-primary" style={{ width:'100%', marginBottom:10 }} onClick={handle} disabled={state === 'loading'}>
        {state === 'loading' ? '⏳ Saving…' : '🔔 Notify Me When Available'}
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
            ? <img src={book.cover} alt={book.title} className="lb-img" draggable="false" />
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

export default function BookDetail() {
  const { id } = useParams();
  const { addToCart, cart, books, user, isOwned, myPerms, siteControls } = useApp();
  const [lightbox, setLightbox] = useState(false);

  const book = books.find(b => b.id === id);
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
  const owned   = isOwned(id);
  // readOnlyMode, permissions, and status all gate purchase
  const canAdd  = !siteControls?.readOnlyMode
    && myPerms?.canPurchase !== false
    && !NO_PURCHASE_STATUSES.has(book.status);
  const related = books.filter(b => b.id !== book.id && b.genre === book.genre).slice(0, 3);

  return (
    <main>
      <div className="bd-wrap">
        <div className="container">
          <Link to="/library" className="bd-back">← Back to Library</Link>
          <div className="bd-grid">
            <div className="bd-left">
              {book.coverType === 'photo' && book.cover
                ? <img
                    src={book.cover}
                    alt={book.title}
                    className="bd-cover bd-cover--zoomable"
                    onClick={() => setLightbox(true)}
                    title="Click to zoom cover"
                  />
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
                {book.status && book.status !== 'complete' && (
                  <BookStatusBadge status={book.status} />
                )}
              </div>
            </div>
            <div className="bd-right">
              <span className="bd-genre">{book.genre}</span>
              <h1 className="bd-title">{book.title}</h1>
              <p className="bd-author">by <strong>{book.author}</strong></p>
              {book.status && book.status !== 'complete' && (() => {
                const meta = {
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
              </div>
              <div className="bd-meta">
                {book.status === 'ongoing'
                  ? <>
                      <div>
                        <small>Chapters Out</small>
                        <strong style={{ color:'#4a9eff' }}>{book.chaptersReleased > 0 ? book.chaptersReleased : (book.chapters?.length || '—')}</strong>
                      </div>
                      <div>
                        <small>Total Planned</small>
                        <strong>{book.totalChapters > 0 ? book.totalChapters : 'TBA'}</strong>
                      </div>
                      <div>
                        <small>Status</small>
                        <strong style={{ color:'#4a9eff' }}>Releasing</strong>
                      </div>
                      <div><small>Read Time</small><strong>{book.readTime}</strong></div>
                    </>
                  : <>
                      <div><small>Pages</small><strong>{book.pages > 0 ? book.pages : '—'}</strong></div>
                      <div><small>Read Time</small><strong>{book.readTime}</strong></div>
                      <div><small>Published</small><strong>{new Date(book.date).toLocaleDateString('en-KE',{year:'numeric',month:'short'})}</strong></div>
                    </>
                }
              </div>
              <p className="bd-desc">{book.description}</p>

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
              ) : (
              <div className="bd-purchase">
                <div className="bd-price">
                  <small>Price</small>
                  <div><span className="bd-curr">KSh</span><span className="bd-amt">{book.price}</span></div>
                </div>
                <div className="bd-actions">
                  {owned
                    ? <>
                        <Link to={`/read/${book.id}`} className="btn btn-primary">Read Now</Link>
                        {book.driveUrl
                          ? <a href={book.driveUrl.replace('/view', '/export?format=pdf').replace('/preview', '/export?format=pdf')} target="_blank" rel="noopener noreferrer" className="btn btn-outline">Download PDF</a>
                          : <button className="btn btn-outline" disabled title="PDF not yet uploaded">PDF Coming Soon</button>
                        }
                      </>
                    : inCart
                      ? <Link to="/cart" className="btn btn-primary">Go to Cart →</Link>
                      : canAdd ? <>
                          <button className="btn btn-primary" onClick={() => addToCart(book)}>Add to Cart — KSh {book.price}</button>
                          <a href={waOrderLink(book.title, book.price)} target="_blank" rel="noopener noreferrer" className="btn btn-wa">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            Order via WhatsApp
                          </a>
                        </>
                      : <span className="btn btn-primary" style={{opacity:0.5,cursor:'not-allowed',pointerEvents:'none'}}>
                          {siteControls?.readOnlyMode ? 'Site in Read-Only Mode' : 'Purchasing Restricted'}
                        </span>
                  }
                </div>
              </div>
              )}
              {/* Notify Me alongside purchase for ongoing/limited */}
              {NOTIFY_ALONGSIDE.has(book.status) && !owned && (
                <div style={{ marginTop:12 }}>
                  <NotifyMeDetailBtn book={book} />
                </div>
              )}
              <div className="bd-trust">
                <span>✓ Instant access after payment</span>
                <span>✓ M-Pesa &amp; Card accepted</span>
                <span>✓ Download or read online</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {related.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="bd-related-title">You Might Also <span className="gold-text">Like</span></h2>
            <div className="books-grid" style={{marginTop:'28px'}}>{related.map(b => <BookCard key={b.id} book={b} />)}</div>
          </div>
        </section>
      )}

      {/* ── Cover zoom lightbox ── */}
      {lightbox && <CoverLightbox book={book} onClose={() => setLightbox(false)} />}
    </main>
  );
}
