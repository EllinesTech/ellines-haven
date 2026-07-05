import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import BookCard, { BookStatusBadge } from '../components/BookCard';
import { useApp } from '../context/AppContext';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import EditableImage from '../components/EditableImage';
import NewsletterSignup from '../components/NewsletterSignup';
import { GENRES } from '../data/books';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getAllReadingStats } from '../hooks/useReadingProgress';
import './Home.css';

/* ── Firestore-backed site content (editable via Page Editor) ── */
const HOME_DEFAULTS = {
  eyebrow:             "Kenya's Premier Literary Platform",
  hero_sub:            'Original novels and short stories by Elijah Mwangi M — drawn from real lives, real heartbreaks, and the soul of East Africa. Buy once. Read forever.',
  hero_btn_primary:    'Browse Books →',
  hero_btn_secondary:  'Our Story',
  hero_poster:         '/poster4.png',
  author_bg_image:     '/cover-the-last-chapter.png',
  stat_books:          '50+',
  stat_readers:        '2k+',
  stat_rating:         '4.8★',
  coming_soon_heading: 'Coming Soon',
  coming_soon_sub:     'Upcoming novels & stories — get notified on launch day',
  new_releases_heading:'New Releases',
  new_releases_sub:    'The latest from Elijah Mwangi M',
  featured_heading:    'Featured Novels & Books',
  featured_sub:        'Original works inspired by true stories',
  author_badge:        'Author Spotlight',
  author_name:         'Elijah Mwangi M',
  author_bio:          'From the golden savannahs of the Maasai Mara to the misty highlands of Mount Kenya — his stories are drawn from the full breath of this country. Every novel is a window into lives lived and dreams chased across East Africa.',
  author_quote:        '"Stories that stay with you long after the last page."',
  genres_heading:      'Browse by Genre',
  genres_sub:          'Find the story that speaks to you',
  why_heading:         'Why Ellines Haven?',
  why_sub:             'More than a bookstore — a literary experience',
  testimonials_heading:'What Readers Say',
  testimonials_sub:    'Voices from our community',
  cta_heading:         'Ready to Start Reading?',
  cta_sub:             "Join thousands of readers discovering Kenya's finest stories.",
  cta_btn_primary:     'Create Free Account',
  cta_btn_secondary:   'Browse First',
};

function useHomeContent() {
  const [c, setC] = useState(HOME_DEFAULTS);
  const editCtx = useEditMode();

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'home_content')).then(snap => {
      const fsData = snap.exists() ? snap.data() : {};
      const merged = { ...HOME_DEFAULTS, ...fsData };
      setC(merged);
      // If edit mode is active for this page, seed the context with current values
      if (editCtx?.editMode && editCtx?.pageKey === 'home_content') {
        // Already seeded by enterEdit — don't overwrite
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  // When in edit mode, live-merge the edit context values on top
  if (editCtx?.editMode && editCtx?.pageKey === 'home_content') {
    return { ...c, ...editCtx.pageData };
  }
  return c;
}

/* ── Notify Me button — writes to Firestore so admin sees it ── */
function NotifyBtn({ book, e }) {
  e?.stopPropagation?.();
  const { user } = useApp();
  const key = 'eh_notify_' + book.id;
  const [done, setDone] = useState(!!localStorage.getItem(key));
  const [busy, setBusy] = useState(false);

  const handle = async ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (done) return;
    if (!user) { window.location.href = '/login'; return; }
    setBusy(true);
    try {
      const docKey = `notify_${book.id}_${user.email.replace(/[^a-z0-9]/gi,'_').toLowerCase()}`;

      // Write to contact_messages FIRST — admin reads from here, rules are open
      await setDoc(doc(db, 'contact_messages', 'notif_' + docKey), {
        name: user.name, email: user.email.toLowerCase(),
        subject: '🔔 Book Notification Request',
        message: `${user.name} (${user.email}) requested to be notified when "${book.title}" is available.`,
        type: 'notification', bookId: book.id, bookTitle: book.title,
        status: 'new', notified: false, createdAt: serverTimestamp(),
      });
      // Best-effort write to notifications collection
      setDoc(doc(db, 'notifications', docKey), {
        bookId: book.id, bookTitle: book.title,
        email: user.email.toLowerCase(), name: user.name,
        status: book.status, createdAt: serverTimestamp(), notified: false,
      }).catch(() => {});

      localStorage.setItem(key, '1');
      setDone(true);
    } catch {}
    setBusy(false);
  };

  return (
    <button
      onClick={handle}
      disabled={busy || done}
      style={{
        display:'inline-flex', alignItems:'center', gap:6,
        padding:'6px 14px', border:'1px solid rgba(201,168,76,0.35)',
        borderRadius:20, background: done ? 'rgba(46,204,113,0.1)' : 'rgba(201,168,76,0.08)',
        color: done ? 'var(--ok)' : 'var(--gold)',
        fontSize:'0.76rem', fontWeight:600, cursor: done ? 'default' : 'pointer',
        fontFamily:'inherit', transition:'all 0.15s',
      }}>
      {done ? '✅ Saved' : busy ? '⏳' : '🔔 Notify Me'}
    </button>
  );
}

/* ─── Rotating hero sub-phrases ─── */
const TAGLINES = [
  'Where Stories Find Their Home',
  'From the Heart of Kenya',
  'Real Lives. Real Drama. Real Stories.',
  'Original Fiction by Elijah Mwangi M',
];

/* ─── Animated book covers carousel (right side of author banner) ─── */
function BookStack({ books }) {
  const pool = books.filter(b => b.coverType === 'photo' && b.cover);
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (pool.length < 2) return;
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => { setIdx(i => (i + 1) % pool.length); setFade(true); }, 500);
    }, 4000);
    return () => clearInterval(id);
  }, [pool.length]);

  if (!pool.length) return null;
  const a = pool[idx % pool.length];
  const b = pool[(idx + 1) % pool.length];
  const c = pool[(idx + 2) % pool.length];

  return (
    <div className="promo-stack" style={{ opacity: fade ? 1 : 0, transition: 'opacity .5s ease' }}>
      <div className="promo-stack__book promo-stack__book--back">
        <img src={c?.cover} alt={c?.title} draggable="false" />
      </div>
      <div className="promo-stack__book promo-stack__book--mid">
        <img src={b?.cover} alt={b?.title} draggable="false" />
      </div>
      <div className="promo-stack__book promo-stack__book--front">
        <img src={a.cover} alt={a.title} draggable="false" />
      </div>
    </div>
  );
}

/* ── Personalised section — shown only to logged-in users with books ─────── */
function PersonalisedSection({ user, library, books }) {
  const stats = getAllReadingStats(user.email);

  // Find in-progress books (chapter > 0)
  const inProgress = library
    .map(lb => {
      const cat      = books.find(b => b.id === lb.id);
      const progress = stats[lb.id] || null;
      return cat ? { ...lb, ...cat, progress } : null;
    })
    .filter(b => b && b.progress && b.progress.chapter > 0)
    .sort((a, b) => (b.progress.lastRead || 0) - (a.progress.lastRead || 0))
    .slice(0, 3);

  // Books in library not yet started
  const notStarted = library
    .filter(lb => !stats[lb.id])
    .map(lb => books.find(b => b.id === lb.id))
    .filter(Boolean)
    .slice(0, 3);

  // Books user doesn't own yet — recommended by genre of owned books
  const ownedIds    = new Set(library.map(b => b.id));
  const ownedGenres = [...new Set(
    library.map(lb => books.find(b => b.id === lb.id)?.genre).filter(Boolean)
  )];
  const recommended = books
    .filter(b => !ownedIds.has(b.id) && ownedGenres.includes(b.genre) && b.active !== false && b.status !== 'coming-soon')
    .slice(0, 4);

  const firstName = user.name?.split(' ')[0] || 'Reader';

  return (
    <section className="section" style={{ paddingTop:32, paddingBottom:0 }}>
      <div className="container">
        {/* Welcome banner */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexWrap:'wrap', gap:12, marginBottom:24,
          padding:'18px 24px',
          background:'linear-gradient(135deg,rgba(201,168,76,0.1),rgba(201,168,76,0.04))',
          border:'1px solid rgba(201,168,76,0.2)', borderRadius:'var(--r)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{
              width:44, height:44, borderRadius:'50%', flexShrink:0,
              background:'rgba(201,168,76,0.18)', border:'2px solid rgba(201,168,76,0.4)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1.1rem', fontWeight:700, color:'var(--gold)',
            }}>
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p style={{ margin:0, fontSize:'0.78rem', color:'var(--muted)', letterSpacing:0.5 }}>WELCOME BACK</p>
              <h3 style={{ margin:0, fontSize:'1.05rem', color:'var(--text)' }}>
                {firstName} · <span style={{ color:'var(--gold)' }}>{library.length} book{library.length !== 1 ? 's' : ''}</span> in your library
              </h3>
            </div>
          </div>
          <Link to="/my-library" className="btn btn-outline btn-sm">My Library →</Link>
        </div>

        {/* Continue reading */}
        {inProgress.length > 0 && (
          <div style={{ marginBottom:28 }}>
            <h3 style={{ fontSize:'0.92rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1.2, marginBottom:14 }}>
              📖 Continue Reading
            </h3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
              {inProgress.map(b => (
                <Link key={b.id} to={`/read/${b.id}`} style={{
                  display:'flex', alignItems:'center', gap:14, flex:'1 1 260px', maxWidth:400,
                  padding:'12px 16px', borderRadius:'var(--r-sm)',
                  background:'rgba(255,255,255,0.03)', border:'1px solid rgba(201,168,76,0.2)',
                  textDecoration:'none', transition:'border-color 0.15s, background 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.2)'}
                >
                  {/* Cover */}
                  {b.coverType === 'photo' && b.cover
                    ? <img src={b.cover} alt={b.title} style={{ width:44, height:60, objectFit:'cover', borderRadius:4, flexShrink:0 }} />
                    : <div style={{ width:44, height:60, borderRadius:4, flexShrink:0, background: b.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem' }}>📖</div>
                  }
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:'0 0 4px', fontWeight:700, fontSize:'0.85rem', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.title}</p>
                    <p style={{ margin:'0 0 6px', fontSize:'0.75rem', color:'var(--muted)' }}>{b.genre}</p>
                    {/* Progress bar */}
                    {b.chapters && b.chapters.length > 1 && (
                      <div style={{ height:3, background:'rgba(255,255,255,0.1)', borderRadius:2 }}>
                        <div style={{
                          height:'100%', borderRadius:2, background:'var(--gold)',
                          width:`${Math.min(100, Math.round(((b.progress.chapter + 1) / b.chapters.length) * 100))}%`,
                        }} />
                      </div>
                    )}
                    <p style={{ margin:'4px 0 0', fontSize:'0.7rem', color:'var(--gold)', fontWeight:600 }}>
                      {b.chapters && b.chapters.length > 1
                        ? `Ch ${b.progress.chapter + 1} / ${b.chapters.length}`
                        : '📖 In progress'
                      } · Resume →
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Unread owned books */}
        {notStarted.length > 0 && (
          <div style={{ marginBottom:28 }}>
            <h3 style={{ fontSize:'0.92rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1.2, marginBottom:14 }}>
              📚 Ready to Read
            </h3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              {notStarted.map(b => (
                <Link key={b.id} to={`/read/${b.id}`} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'10px 14px', borderRadius:'var(--r-sm)',
                  background:'rgba(255,255,255,0.02)', border:'1px solid var(--dim)',
                  textDecoration:'none', flex:'1 1 220px', maxWidth:340,
                  transition:'border-color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.35)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dim)'}
                >
                  {b.coverType === 'photo' && b.cover
                    ? <img src={b.cover} alt={b.title} style={{ width:36, height:50, objectFit:'cover', borderRadius:3, flexShrink:0 }} />
                    : <div style={{ width:36, height:50, borderRadius:3, flexShrink:0, background: b.coverColor || '#1a1a3a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem' }}>📖</div>
                  }
                  <div style={{ minWidth:0 }}>
                    <p style={{ margin:0, fontWeight:600, fontSize:'0.83rem', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.title}</p>
                    <p style={{ margin:'2px 0 0', fontSize:'0.72rem', color:'var(--gold)' }}>Start Reading →</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recommended based on genres */}
        {recommended.length > 0 && (
          <div style={{ marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <h3 style={{ fontSize:'0.92rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1.2, margin:0 }}>
                ✨ Recommended For You
              </h3>
              <Link to="/library" style={{ fontSize:'0.78rem', color:'var(--gold)', textDecoration:'none' }}>See all →</Link>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12 }}>
              {recommended.map(b => <BookCard key={b.id} book={b} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const { books, user, library } = useApp();
  const editCtx = useEditMode();
  const c = useHomeContent();

  // When edit toolbar triggers edit mode for this page, seed with current values
  useEffect(() => {
    if (editCtx?.editMode && editCtx?.pageKey === 'home_content' && Object.keys(editCtx.pageData).length === 0) {
      // Seed with current content so existing values show up in editor
      getDoc(doc(db, 'site_data', 'home_content')).then(snap => {
        const fsData = snap.exists() ? snap.data() : {};
        editCtx.enterEdit('home_content', { ...HOME_DEFAULTS, ...fsData });
      }).catch(() => editCtx.enterEdit('home_content', { ...HOME_DEFAULTS }));
    }
  }, [editCtx?.editMode, editCtx?.pageKey]); // eslint-disable-line
  // Only show active books on the front page
  const activeBooks = books.filter(b => b.active !== false);
  const featured    = activeBooks.filter(b => b.featured);
  const comingSoon  = activeBooks.filter(b => b.status === 'coming-soon' || b.status === 'ongoing');

  const newReleases = activeBooks
    .filter(b => b.isNew)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Hero spotlight = most recently dated new release WITH a real photo cover
  const spotlight = newReleases.find(b => b.coverType === 'photo' && b.cover) || null;

  const [tagIdx, setTagIdx] = useState(0);
  const [fade,   setFade]   = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => { setTagIdx(i => (i + 1) % 4); setFade(true); }, 350);
    }, 3600);
    return () => clearInterval(t);
  }, []);

  const taglines = [
    c.hero_tagline_1 || 'Where Stories Find Their Home',
    c.hero_tagline_2 || 'From the Heart of Kenya',
    c.hero_tagline_3 || 'Real Lives. Real Drama. Real Stories.',
    c.hero_tagline_4 || 'Original Fiction by Elijah Mwangi M',
  ];

  return (
    <main>

      {/* ══════════════════════════════════════
          HERO
      ══════════════════════════════════════ */}
      <section className="hero">
        <div className="hero__glow hero__glow--a" />
        <div className="hero__glow hero__glow--b" />
        <div className="hero__glow hero__glow--c" />

        <div className="container hero__inner">
          {/* LEFT — copy */}
          <div className="hero__copy">
            <span className="badge badge-gold hero__eyebrow">
              <EditableField field="eyebrow">{c.eyebrow}</EditableField>
            </span>

            <h1 className="hero__h1">
              <span className={`hero__tagline${fade ? ' hero__tagline--in' : ' hero__tagline--out'}`}>
                {taglines[tagIdx]}
              </span>
            </h1>

            <p className="hero__sub">
              <EditableField field="hero_sub" multiline>{c.hero_sub}</EditableField>
            </p>

            <div className="hero__btns">
              <Link to="/library" className="btn btn-primary">
                <EditableField field="hero_btn_primary">{c.hero_btn_primary}</EditableField>
              </Link>
              <Link to="/about" className="btn btn-outline">
                <EditableField field="hero_btn_secondary">{c.hero_btn_secondary}</EditableField>
              </Link>
            </div>

            <div className="hero__stats">
              <div><strong><EditableField field="stat_books">{c.stat_books}</EditableField></strong><span>Books</span></div>
              <div className="hero__stat-bar" />
              <div><strong><EditableField field="stat_readers">{c.stat_readers}</EditableField></strong><span>Readers</span></div>
              <div className="hero__stat-bar" />
              <div><strong><EditableField field="stat_rating">{c.stat_rating}</EditableField></strong><span>Rating</span></div>
            </div>
          </div>

          {/* RIGHT — poster + floating badge */}
          <div className="hero__visual">
            <div className="hero__poster-frame">
              <EditableImage
                field="hero_poster"
                src={c.hero_poster || '/poster4.png'}
                alt="Ellines Haven"
                className="hero__poster"
                storageFolder="site-images"
              />
              <div className="hero__poster-shine" />
            </div>
            {spotlight && (
              <Link to={`/book/${spotlight.id}`} className="hero__float-card">
                <img src={spotlight.cover} alt={spotlight.title} className="hero__float-cover" />
                <div className="hero__float-info">
                  <span className="badge badge-gold" style={{fontSize:'.6rem'}}>New Release</span>
                  <strong>{spotlight.title}</strong>
                  <span>by {spotlight.author}</span>
                </div>
              </Link>
            )}
          </div>
        </div>

        <div className="hero__scroll-cue">
          <span>Scroll to explore</span>
          <div className="hero__scroll-arrow" />
        </div>
      </section>

      {/* ══════════════════════════════════════
          TRUST BAR
      ══════════════════════════════════════ */}
      <div className="trust-bar">
        <div className="container trust-bar__inner">
          {[
            { icon:'📱', title:'M-Pesa, Airtel & PayPal', desc:'Instant secure payments'    },
            { icon:'⬇️', title:'Download Forever',        desc:'Buy once, keep forever'     },
            { icon:'📖', title:'Read Online',              desc:'Beautiful built-in reader'  },
            { icon:'🔒', title:'Secure & Safe',            desc:'Protected transactions'     },
          ].map(f => (
            <div key={f.title} className="trust-bar__item">
              <span className="trust-bar__icon">{f.icon}</span>
              <div><strong>{f.title}</strong><span>{f.desc}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          PERSONALISED FEED — logged-in users only
      ══════════════════════════════════════ */}
      {user && library.length > 0 && (
        <PersonalisedSection user={user} library={library} books={activeBooks} />
      )}

      {/* ══════════════════════════════════════
          COMING SOON & IN PROGRESS
      ══════════════════════════════════════ */}
      {comingSoon.length > 0 && (
        <section className="section coming-soon-sec">
          <div className="container">
            <div className="sec-head">
              <div>
                <h2>Coming <span className="gold-text">Soon</span></h2>
                <p>{c.coming_soon_sub}</p>
              </div>
              <Link to="/library?status=coming-soon" className="btn btn-outline btn-sm">See All →</Link>
            </div>
            <div className="cs-grid">
              {comingSoon.map((b, i) => (
                <Link key={b.id} to={`/book/${b.id}`} className={`cs-card${i === 0 ? ' cs-card--hero' : ''}`}>
                  {/* cover / art */}
                  <div className="cs-card__art">
                    {b.coverType === 'photo' && b.cover
                      ? <img src={b.cover} alt={b.title} className="cs-card__cover-img" />
                      : <div className="cs-card__cover-styled" style={{ background: b.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}>
                          <div className="cs-card__cover-deco" style={{ borderColor: b.coverAccent || '#c9a84c' }} />
                          <img src="/logo-icon.png" alt="" className="cs-card__cover-logo" />
                          <span className="cs-card__cover-title-art" style={{ color: b.coverAccent || '#c9a84c' }}>{b.title}</span>
                        </div>
                    }
                    <div className="cs-card__art-overlay" />
                    {/* countdown / status badge */}
                    <div className="cs-card__top-row">
                      <BookStatusBadge status={b.status} />
                      {b.expectedDate && (
                        <span className="cs-card__eta">📅 {b.expectedDate}</span>
                      )}
                    </div>
                  </div>
                  {/* info */}
                  <div className="cs-card__body">
                    <span className="cs-card__genre">{b.genre}</span>
                    <h3 className="cs-card__title">{b.title}</h3>
                    <p className="cs-card__excerpt">{b.excerpt}</p>
                    {b.inspired && b.inspiredNote && (
                      <p className="cs-card__inspired">✦ {b.inspiredNote}</p>
                    )}
                    <div className="cs-card__footer">
                      <NotifyBtn book={b} />
                      <span className="cs-card__arrow">→</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════
          NEW RELEASES SPOTLIGHT
      ══════════════════════════════════════ */}
      {newReleases.length > 0 && (
        <section className="section new-releases-sec">
          <div className="container">
            <div className="sec-head">
              <div>
                <h2>New <span className="gold-text">Releases</span></h2>
                <p>{c.new_releases_sub}</p>
              </div>
              <Link to="/library" className="btn btn-outline btn-sm">All Books →</Link>
            </div>
            <div className="new-releases-row">
              {newReleases.map(b => (
                <Link key={b.id} to={`/book/${b.id}`} className="new-release-card card">
                  <div className="new-release-card__img-wrap">
                    {b.coverType === 'photo' && b.cover
                      ? <img src={b.cover} alt={b.title} className="new-release-card__img" />
                      : <div className="new-release-card__img new-release-card__img--styled"
                             style={{ background: b.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}>
                          <img src="/logo-icon.png" alt="" style={{width:40,opacity:0.3}} />
                        </div>
                    }
                    <span className="badge badge-gold nr-badge">New</span>
                  </div>
                  <div className="new-release-card__body">
                    <span className="new-release-card__genre">{b.genre}</span>
                    <h3>{b.title}</h3>
                    <p>{b.excerpt}</p>
                    <div className="new-release-card__footer">
                      <span className="new-release-card__price">KSh {b.price}</span>
                      <span className="new-release-card__cta">View →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════
          FEATURED BOOKS
      ══════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="sec-head">
            <div>
              <h2><EditableField field="featured_heading">{c.featured_heading}</EditableField></h2>
              <p><EditableField field="featured_sub">{c.featured_sub}</EditableField></p>
            </div>
            <Link to="/library" className="btn btn-outline btn-sm">View All →</Link>
          </div>
          <div className="books-grid">
            {featured.map(b => <BookCard key={b.id} book={b} />)}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          AUTHOR SPOTLIGHT BANNER
      ══════════════════════════════════════ */}
      <section className="promo-banner">
        <div className="promo-banner__bg">
          <EditableImage
            field="author_bg_image"
            src={c.author_bg_image || '/cover-the-last-chapter.png'}
            alt=""
            className="promo-banner__bg-img"
            storageFolder="site-images"
          />
          <div className="promo-banner__bg-mask" />
        </div>
        <div className="container promo-banner__content">
          <div className="promo-banner__copy">
            <span className="badge badge-gold">{c.author_badge}</span>
            <h2><EditableField field="author_name">{c.author_name}</EditableField></h2>
            <p><EditableField field="author_bio" multiline>{c.author_bio}</EditableField></p>
            <div className="promo-banner__btns">
              <Link to="/founder" className="btn btn-primary">Meet the Author</Link>
              <Link to="/library" className="btn btn-ghost">Explore All Books</Link>
            </div>
            <div className="promo-banner__quotes">
              <blockquote>{c.author_quote}</blockquote>
            </div>
          </div>
          <BookStack books={featured} />
        </div>
      </section>

      {/* ══════════════════════════════════════
          GENRES
      ══════════════════════════════════════ */}
      <section className="section genres-sec">
        <div className="container">
          <h2 className="text-c">Browse by <span className="gold-text">Genre</span></h2>
          <p className="text-c muted" style={{ marginBottom:'36px' }}>{c.genres_sub}</p>
          <div className="genres-row">
            {GENRES.map(g => (
              <Link key={g} to={`/library?genre=${g}`} className="genre-pill">{g}</Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          WHY ELLINES HAVEN
      ══════════════════════════════════════ */}
      <section className="section why-sec">
        <div className="container">
          <h2 className="text-c">Why <span className="gold-text">Ellines Haven</span>?</h2>
          <p className="text-c muted" style={{ marginBottom:'48px' }}>{c.why_sub}</p>
          <div className="why-grid">
            {[
              { icon:'✍️', title:'Authentic Stories',  desc:'Every book draws from real events, real people, and the streets of Kenya.'        },
              { icon:'💰', title:'Affordable Prices',  desc:'Quality literature for everyone — starting from KSh 120.'                        },
              { icon:'📲', title:'Read Anywhere',      desc:'Works on any device — phone, tablet, or desktop. No app needed.'                 },
              { icon:'♾️', title:'Own It Forever',     desc:'Purchase once and keep your copy forever — no subscriptions, no expiry.'         },
              { icon:'🤝', title:'Support Local Art',  desc:'Every purchase directly supports an independent Kenyan author.'                  },
              { icon:'⭐', title:'Curated Quality',    desc:'Every title is carefully crafted and reviewed before it reaches your hands.'     },
            ].map(w => (
              <div key={w.title} className="why-card">
                <div className="why-card__icon">{w.icon}</div>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════ */}
      <section className="section testimonials-sec">
        <div className="container">
          <h2 className="text-c">What <span className="gold-text">Readers Say</span></h2>
          <p className="text-c muted" style={{ marginBottom:'44px' }}>{c.testimonials_sub}</p>
          <div className="testimonials-grid">
            {[
              { name:'Amina K.', loc:'Nairobi', stars:5, text:'"Chasing Ghosts and Supercars had me hooked from the first chapter. Finally, stories that feel like home."' },
              { name:'David O.', loc:'Mombasa', stars:5, text:'"The writing is raw and honest. You can tell these stories come from a real place. Absolutely brilliant."'  },
              { name:'Grace W.', loc:'Kisumu',  stars:5, text:'"I read Marriage is a Scam in one sitting. Every page felt like it was written about someone I know."'       },
              { name:'Brian M.', loc:'Eldoret', stars:5, text:'"The reader app is incredible — smooth, beautiful, and works perfectly on my phone. 10/10."'                 },
            ].map(t => (
              <div key={t.name} className="testimonial-card">
                <div className="testimonial-card__stars">{'★'.repeat(t.stars)}</div>
                <p className="testimonial-card__text">{t.text}</p>
                <div className="testimonial-card__author">
                  <div className="testimonial-card__avatar">{t.name[0]}</div>
                  <div><strong>{t.name}</strong><span>{t.loc}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          NEWSLETTER
      ══════════════════════════════════════ */}
      <NewsletterSignup />

      {/* ══════════════════════════════════════
          CTA
      ══════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="cta-box">
            <div className="cta-box__glow" />
            <img src="/logo-icon.png" alt="" className="cta-box__logo" />
            <h2><EditableField field="cta_heading">{c.cta_heading}</EditableField></h2>
            <p><EditableField field="cta_sub" multiline>{c.cta_sub}</EditableField></p>
            <div className="cta-box__btns">
              <Link to="/register" className="btn btn-primary">
                <EditableField field="cta_btn_primary">{c.cta_btn_primary}</EditableField>
              </Link>
              <Link to="/library" className="btn btn-ghost">
                <EditableField field="cta_btn_secondary">{c.cta_btn_secondary}</EditableField>
              </Link>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
