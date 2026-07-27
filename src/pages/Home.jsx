import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import BookCard, { BookStatusBadge } from '../components/BookCard';
import RecommendationWidget from '../components/RecommendationWidget';
import TrendingWidget from '../components/TrendingWidget';
import { useApp } from '../context/AppContext';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import EditableImage from '../components/EditableImage';
import NewsletterSignup from '../components/NewsletterSignup';
import CoverImage from '../components/CoverImage';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getAllReadingStats } from '../hooks/useReadingProgress';
import { bookPath, readPath } from '../utils/slugify';
import { hasImageCover } from '../utils/bookCovers';
import { usePageMeta } from '../hooks/usePageMeta';
import './Home.css';

/* ── Firestore-backed site content (editable via Page Editor) ── */
const HOME_DEFAULTS = {
  eyebrow:             "Kenya's Home for Original Stories",
  hero_sub:            'Novels drawn from real Kenyan lives — love, betrayal, ambition, and the quiet courage it takes to keep going. Open a chapter. Stay for the story.',
  hero_btn_primary:    'Start Reading →',
  hero_btn_secondary:  'Meet the Author',
  hero_poster:         '/poster4.png',
  author_bg_image:     '/cover-the-last-chapter.png?v=front', // decorative only — not tied to a catalogue book id
  stat_books:          '50+',
  stat_readers:        '2k+',
  stat_rating:         '4.8★',
  coming_soon_heading: 'Coming Soon',
  coming_soon_sub:     'Upcoming novels & stories — get notified on launch day',
  new_releases_heading:'New Releases',
  new_releases_sub:    'The latest from Elijah Mwangi M',
  featured_heading:    'Stories Worth Opening',
  featured_sub:        'Start with any title — many include a free first chapter',
  author_badge:        'Author Spotlight',
  author_name:         'Elijah Mwangi M',
  author_bio:          'From the golden savannahs of the Maasai Mara to the misty highlands of Mount Kenya — his stories are drawn from the full breath of this country. Every novel is a window into lives lived and dreams chased across East Africa.',
  author_quote:        '"Stories that stay with you long after the last page."',
  genres_heading:      'Browse by Genre',
  genres_sub:          'Find the story that speaks to you',
  why_heading:         'Why Ellines Haven?',
  why_sub:             'Built for readers who want stories that feel like home',
  testimonials_heading:'What Readers Say',
  testimonials_sub:    'Readers across Kenya — and beyond — who opened one page and kept going',
  cta_heading:         'Your next chapter starts here',
  cta_sub:             'Create a free account, pick a book, and read on any phone — no app required.',
  cta_btn_primary:     'Create Free Account',
  cta_btn_secondary:   'Browse the Library',
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

/* ─── Rotating hero headlines — written to stop the scroll ─── */
const TAGLINES = [
  'Open one page. Stay for the story.',
  'Kenyan stories that feel like home.',
  'Real lives. Real heartbreak. Real hope.',
  'Buy once. Read forever.',
];

/* ─── Animated book covers carousel (right side of author banner) ─── */
function BookStack({ books }) {
  const pool = books.filter(b => b.cover);
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

/* ── Personalised section — logged-in readers ─────────────────────────────── */
function PersonalisedSection({ user, library, books }) {
  const stats = getAllReadingStats(user.email);

  const inProgress = library
    .map(lb => {
      const cat      = books.find(b => b.id === lb.id);
      const progress = stats[lb.id] || null;
      return cat ? { ...lb, ...cat, progress } : null;
    })
    .filter(b => b && b.progress && b.progress.chapter > 0)
    .sort((a, b) => (b.progress.lastRead || 0) - (a.progress.lastRead || 0))
    .slice(0, 4);

  const notStarted = library
    .filter(lb => !stats[lb.id])
    .map(lb => books.find(b => b.id === lb.id))
    .filter(Boolean)
    .slice(0, 4);

  const ownedIds = new Set(library.map(b => b.id));
  const ownedGenres = [...new Set(
    library.map(lb => books.find(b => b.id === lb.id)?.genre).filter(Boolean)
  )];

  let recommended = books
    .filter(b => !ownedIds.has(b.id) && ownedGenres.includes(b.genre) && b.active !== false && b.status !== 'coming-soon' && b.status !== 'draft')
    .slice(0, 6);

  // Fallback so the strip never looks empty/sparse with 0–1 genre matches
  if (recommended.length < 3) {
    const extras = books
      .filter(b => !ownedIds.has(b.id) && b.active !== false && b.status !== 'coming-soon' && b.status !== 'draft' && !recommended.some(r => r.id === b.id))
      .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.rating || 0) - (a.rating || 0))
      .slice(0, 6 - recommended.length);
    recommended = [...recommended, ...extras];
  }

  const firstName = user.name?.split(' ')[0] || 'Reader';
  const resumeBook = inProgress[0];

  return (
    <section className="home-personal">
      <div className="container">
        <div className="home-personal__welcome">
          <div className="home-personal__welcome-left">
            <div className="home-personal__avatar" aria-hidden="true">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="home-personal__eyebrow">Welcome back</p>
              <h3 className="home-personal__hello">
                {firstName}
                <span className="home-personal__count">
                  {' '}· {library.length} book{library.length !== 1 ? 's' : ''} in your library
                </span>
              </h3>
            </div>
          </div>
          <Link to="/my-library" className="btn btn-outline btn-sm">My Library →</Link>
        </div>

        {resumeBook && (
          <div className="home-personal__block">
            <div className="home-personal__head">
              <h3>Continue Reading</h3>
              {inProgress.length > 1 && (
                <span className="home-personal__meta">{inProgress.length} in progress</span>
              )}
            </div>
            <Link to={readPath(resumeBook)} className="home-resume">
              <div className="home-resume__cover">
                {resumeBook.cover
                  ? <img src={resumeBook.cover} alt="" loading="lazy" decoding="async" />
                  : <div className="home-resume__cover-fallback" style={{ background: resumeBook.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }} />
                }
              </div>
              <div className="home-resume__body">
                <p className="home-resume__kicker">Pick up where you left off</p>
                <h4 className="home-resume__title">{resumeBook.title}</h4>
                <p className="home-resume__genre">{resumeBook.genre}</p>
                {(() => {
                  const total = resumeBook.chapters?.length
                    || resumeBook.chapterCount
                    || resumeBook.tableOfContents?.filter(t => !/^(PART|ACT|BOOK|SECTION|VOLUME)\s/i.test(t)).length
                    || 0;
                  const ch = (resumeBook.progress?.chapter || 0) + 1;
                  const pct = total > 1 ? Math.min(100, Math.round((ch / total) * 100)) : 0;
                  return (
                    <>
                      {total > 1 && (
                        <div className="home-resume__bar" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <p className="home-resume__progress">
                        {total > 1 ? `Chapter ${ch} of ${total}` : 'In progress'}
                        <span>Resume →</span>
                      </p>
                    </>
                  );
                })()}
              </div>
            </Link>

            {inProgress.length > 1 && (
              <div className="home-personal__rail">
                {inProgress.slice(1).map(b => {
                  const total = b.chapters?.length || b.chapterCount || 0;
                  const ch = (b.progress?.chapter || 0) + 1;
                  return (
                    <Link key={b.id} to={readPath(b)} className="home-mini-card">
                      {hasImageCover(b)
                        ? <CoverImage src={b.cover} alt="" className="home-mini-card__img" />
                        : <div className="home-mini-card__img home-mini-card__img--fallback" style={{ background: b.coverColor || '#1a1a3a' }} />
                      }
                      <div className="home-mini-card__body">
                        <strong>{b.title}</strong>
                        <span>{total > 1 ? `Ch ${ch}/${total}` : 'Resume'} →</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {notStarted.length > 0 && (
          <div className="home-personal__block">
            <div className="home-personal__head">
              <h3>Ready to Read</h3>
            </div>
            <div className="home-personal__rail">
              {notStarted.map(b => (
                <Link key={b.id} to={readPath(b)} className="home-mini-card">
                  {hasImageCover(b)
                    ? <CoverImage src={b.cover} alt="" className="home-mini-card__img" />
                    : <div className="home-mini-card__img home-mini-card__img--fallback" style={{ background: b.coverColor || '#1a1a3a' }} />
                  }
                  <div className="home-mini-card__body">
                    <strong>{b.title}</strong>
                    <span>Start Reading →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {recommended.length > 0 && (
          <div className="home-personal__block">
            <div className="home-personal__head">
              <h3>Recommended For You</h3>
              <Link to="/library" className="home-personal__link">See all →</Link>
            </div>
            <div className="home-personal__books">
              {recommended.map(b => <BookCard key={b.id} book={b} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Featured story hook — first thing after hero to pull readers in ── */
function StoryHook({ book }) {
  if (!book) return null;
  const lines = (book.excerpt || '').split('\n').filter(Boolean).slice(0, 4);
  const canSample = book.freeFirstChapter || book.status === 'free-preview';

  return (
    <section className="story-hook">
      <div className="story-hook__glow" aria-hidden="true" />
      <div className="container story-hook__grid">
        <Link to={bookPath(book)} className="story-hook__cover-link">
          {book.cover ? (
            <img src={book.cover} alt={book.title} className="story-hook__cover" />
          ) : (
            <div
              className="story-hook__cover story-hook__cover--fallback"
              style={{ background: book.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}
            >
              <span>{book.title}</span>
            </div>
          )}
        </Link>

        <div className="story-hook__copy">
          <p className="story-hook__kicker">Start here — free sample</p>
          <h2 className="story-hook__title">{book.title}</h2>
          {book.genre && <span className="story-hook__genre">{book.genre}</span>}
          <div className="story-hook__excerpt">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          {book.inspiredNote && (
            <p className="story-hook__inspired">✦ {book.inspiredNote}</p>
          )}
          <div className="story-hook__actions">
            {canSample ? (
              <Link to={readPath(book)} className="btn btn-primary">
                Read Free Chapter →
              </Link>
            ) : (
              <Link to={bookPath(book)} className="btn btn-primary">
                Open This Story →
              </Link>
            )}
            <Link to={bookPath(book)} className="btn btn-outline">
              Full Details
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonials auto-carousel ─── */
const TESTIMONIALS = [
  { name:'Amina K.', loc:'Nairobi', stars:5, text:'"Chasing Ghosts and Supercars had me hooked from the first chapter. Finally, stories that feel like home."' },
  { name:'David O.', loc:'Mombasa', stars:5, text:'"The writing is raw and honest. You can tell these stories come from a real place. Absolutely brilliant."'  },
  { name:'Grace W.', loc:'Kisumu',  stars:5, text:'"I read Marriage is a Scam in one sitting. Every page felt like it was written about someone I know."'       },
  { name:'Brian M.', loc:'Eldoret', stars:5, text:'"The reader app is incredible — smooth, beautiful, and works perfectly on my phone. 10/10."'                 },
  { name:'Faith N.', loc:'Nyeri',   stars:5, text:'"Pain felt like it was written about my own life. I cried. I laughed. I finished it at 3am."'                 },
  { name:'Kevin L.', loc:'Nakuru',  stars:5, text:'"Children of Thunder is the East African fantasy we\'ve been waiting for. Incredible world-building."'         },
];

function TestimonialsCarousel({ sub }) {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);

  const goTo = (idx) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => { setActive(idx); setAnimating(false); }, 300);
  };

  useEffect(() => {
    const id = setInterval(() => {
      goTo((active + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(id);
  }, [active]); // eslint-disable-line

  // Show 2 at a time on desktop
  const visible = [
    TESTIMONIALS[active % TESTIMONIALS.length],
    TESTIMONIALS[(active + 1) % TESTIMONIALS.length],
  ];

  return (
    <section className="section testimonials-sec">
      <div className="container">
        <h2 className="text-c">What <span className="gold-text">Readers Say</span></h2>
        <p className="text-c muted" style={{ marginBottom:'44px' }}>{sub}</p>
        <div className="tcarousel">
          <div className={`tcarousel__track${animating ? ' tcarousel__track--fade' : ''}`}>
            {visible.map((t, i) => (
              <div key={t.name + i} className="testimonial-card">
                <div className="testimonial-card__stars">{'★'.repeat(t.stars)}</div>
                <p className="testimonial-card__text">{t.text}</p>
                <div className="testimonial-card__author">
                  <div className="testimonial-card__avatar">{t.name[0]}</div>
                  <div><strong>{t.name}</strong><span>{t.loc}</span></div>
                </div>
              </div>
            ))}
          </div>
          {/* Dots */}
          <div className="tcarousel__dots">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                className={`tcarousel__dot${i === active ? ' tcarousel__dot--active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Review ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { books, user, library } = useApp();
  usePageMeta({
    title: "Kenya's Home for Original Stories",
    description: 'Novels drawn from real Kenyan lives — love, betrayal, ambition, and hope. Open a free chapter. Buy once. Read forever.',
  });
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
    c.hero_tagline_1 || TAGLINES[0],
    c.hero_tagline_2 || TAGLINES[1],
    c.hero_tagline_3 || TAGLINES[2],
    c.hero_tagline_4 || TAGLINES[3],
  ];

  const hookBook =
    featured.find(b => b.freeFirstChapter || b.status === 'free-preview') ||
    featured[0] ||
    activeBooks.find(b => b.freeFirstChapter || b.status === 'free-preview') ||
    activeBooks.find(b => b.status !== 'coming-soon' && b.status !== 'draft');

  const sampleBook = activeBooks.find(b => b.freeFirstChapter || b.status === 'free-preview');

  return (
    <main className="home-page">

      {/* ══════════════════════════════════════
          HERO — cinematic, brand-first
      ══════════════════════════════════════ */}
      <section className="hero">
        <div className="hero__bg" aria-hidden="true">
          <img
            src={c.hero_poster || '/poster4.png'}
            alt=""
            className="hero__bg-img"
          />
          <div className="hero__bg-veil" />
          <div className="hero__bg-glow" />
        </div>
        <div className="hero__grain" aria-hidden="true" />

        <div className="container hero__inner">
          <div className="hero__copy">
            <p className="hero__brand">Ellines Haven</p>
            <span className="hero__rule" aria-hidden="true" />
            <p className="hero__eyebrow">
              <EditableField field="eyebrow">{c.eyebrow}</EditableField>
            </p>

            <h1 className="hero__h1">
              <span className={`hero__tagline${fade ? ' hero__tagline--in' : ' hero__tagline--out'}`}>
                {taglines[tagIdx]}
              </span>
            </h1>

            <p className="hero__sub">
              <EditableField field="hero_sub" multiline>{c.hero_sub}</EditableField>
            </p>

            <div className="hero__btns">
              <Link to="/library" className="btn btn-primary hero__cta-primary">
                <EditableField field="hero_btn_primary">{c.hero_btn_primary}</EditableField>
              </Link>
              {sampleBook ? (
                <Link to={readPath(sampleBook)} className="btn btn-outline hero__cta-secondary">
                  Read a Free Chapter
                </Link>
              ) : (
                <Link to="/founder" className="btn btn-outline hero__cta-secondary">
                  <EditableField field="hero_btn_secondary">{c.hero_btn_secondary}</EditableField>
                </Link>
              )}
            </div>

            <ul className="hero__promises">
              <li>Buy once · own forever</li>
              <li>M-Pesa ready</li>
              <li>Read on any phone</li>
            </ul>
          </div>

          <div className="hero__visual">
            <div className="hero__shelf">
              {(featured.filter(hasImageCover).slice(0, 3).length >= 2
                ? featured.filter(hasImageCover).slice(0, 3)
                : activeBooks.filter(hasImageCover).slice(0, 3)
              ).map((b, i) => (
                <Link
                  key={b.id}
                  to={bookPath(b)}
                  className={`hero__shelf-book hero__shelf-book--${i + 1}`}
                  title={b.title}
                >
                  <CoverImage src={b.cover} alt="" priority={i === 0} />
                </Link>
              ))}
            </div>
            <div className="hero__poster-frame">
              <EditableImage
                field="hero_poster"
                src={c.hero_poster || '/poster4.png'}
                alt="Ellines Haven"
                className="hero__poster"
                storageFolder="site-images"
              />
              <div className="hero__poster-vignette" aria-hidden="true" />
              <div className="hero__poster-shine" aria-hidden="true" />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="hero__scroll-cue"
          onClick={() => document.getElementById('home-hook')?.scrollIntoView({ behavior: 'smooth' })}
          aria-label="Scroll to featured story"
        >
          <span>Discover stories</span>
          <div className="hero__scroll-arrow" />
        </button>
      </section>

      {/* ══════════════════════════════════════
          STATS
      ══════════════════════════════════════ */}
      <div className="home-stats">
        <div className="container home-stats__inner">
          <div className="home-stats__item">
            <strong><EditableField field="stat_books">{c.stat_books}</EditableField></strong>
            <span>Books</span>
          </div>
          <div className="home-stats__bar" aria-hidden="true" />
          <div className="home-stats__item">
            <strong><EditableField field="stat_readers">{c.stat_readers}</EditableField></strong>
            <span>Readers</span>
          </div>
          <div className="home-stats__bar" aria-hidden="true" />
          <div className="home-stats__item">
            <strong><EditableField field="stat_rating">{c.stat_rating}</EditableField></strong>
            <span>Rating</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          STORY HOOK — get them into a chapter
      ══════════════════════════════════════ */}
      <div id="home-hook">
        <StoryHook book={hookBook} />
      </div>

      {/* ══════════════════════════════════════
          QUIET TRUST STRIP
      ══════════════════════════════════════ */}
      <div className="trust-bar">
        <div className="container trust-bar__inner">
          {[
            { title: 'M-Pesa & Cards', desc: 'Pay in seconds' },
            { title: 'Own Forever', desc: 'No subscription' },
            { title: 'Built-in Reader', desc: 'Phone-ready' },
            { title: 'Kenya-based', desc: 'Real support' },
          ].map(f => (
            <div key={f.title} className="trust-bar__item">
              <span className="trust-bar__mark" aria-hidden="true" />
              <div>
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </div>
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
          FEATURED BOOKS — available stories first
      ══════════════════════════════════════ */}
      <section className="section home-featured-sec">
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
                <Link key={b.id} to={bookPath(b)} className="new-release-card card">
                  <div className="new-release-card__img-wrap">
                    {hasImageCover(b)
                      ? <CoverImage src={b.cover} alt={b.title} className="new-release-card__img" />
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
                      <span className="new-release-card__cta">Open →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════
          AUTHOR SPOTLIGHT BANNER
      ══════════════════════════════════════ */}
      <section className="promo-banner">
        <div className="promo-banner__bg">
          <EditableImage
            field="author_bg_image"
            src={c.author_bg_image || '/cover-the-last-chapter.png?v=front'}
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
          WHY ELLINES HAVEN
      ══════════════════════════════════════ */}
      <section className="section why-sec">
        <div className="container">
          <h2 className="text-c">Why <span className="gold-text">Ellines Haven</span>?</h2>
          <p className="text-c muted why-sec__sub">{c.why_sub}</p>
          <div className="why-grid">
            {[
              { n: '01', title: 'Authentic Stories',  desc: 'Every book draws from real events, real people, and the streets of Kenya.' },
              { n: '02', title: 'Affordable Prices',  desc: 'Quality literature for everyone — starting from KSh 120.' },
              { n: '03', title: 'Read Anywhere',      desc: 'Works on any device — phone, tablet, or desktop. No app needed.' },
              { n: '04', title: 'Own It Forever',     desc: 'Purchase once and keep your copy forever — no subscriptions, no expiry.' },
              { n: '05', title: 'Support Local Art',  desc: 'Every purchase directly supports an independent Kenyan author.' },
              { n: '06', title: 'Curated Quality',    desc: 'Every title is carefully crafted before it reaches your hands.' },
            ].map(w => (
              <div key={w.title} className="why-card">
                <span className="why-card__n">{w.n}</span>
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
      <TestimonialsCarousel sub={c.testimonials_sub} />

      {/* ══════════════════════════════════════
          GENRES
      ══════════════════════════════════════ */}
      <section className="section genres-sec">
        <div className="container">
          <h2 className="text-c">Browse by <span className="gold-text">Genre</span></h2>
          <p className="text-c muted genres-sec__sub">{c.genres_sub}</p>
          <div className="genres-row">
            {[
              'Romance', 'Drama', 'Mystery', 'Fantasy', 'Historical',
              'Short Stories', 'Thriller', 'African Fiction', 'Sci-Fi',
              'Adventure', 'Family Saga', 'Urban Fiction',
            ].map(label => (
              <Link key={label} to={`/library?genre=${label}`} className="genre-pill">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          COMING SOON — after available books
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
                <Link key={b.id} to={bookPath(b)} className={`cs-card${i === 0 ? ' cs-card--hero' : ''}`}>
                  <div className="cs-card__art">
                    {hasImageCover(b)
                      ? <CoverImage src={b.cover} alt={b.title} className="cs-card__cover-img" />
                      : <div className="cs-card__cover-styled" style={{ background: b.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}>
                          <div className="cs-card__cover-deco" style={{ borderColor: b.coverAccent || '#c9a84c' }} />
                          <img src="/logo-icon.png" alt="" className="cs-card__cover-logo" />
                          <span className="cs-card__cover-title-art" style={{ color: b.coverAccent || '#c9a84c' }}>{b.title}</span>
                        </div>
                    }
                    <div className="cs-card__art-overlay" />
                    <div className="cs-card__top-row">
                      <BookStatusBadge status={b.status} />
                      {b.expectedDate && (
                        <span className="cs-card__eta">{b.expectedDate}</span>
                      )}
                    </div>
                  </div>
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
          RECOMMENDATIONS & TRENDING
      ══════════════════════════════════════ */}
      <section className="section rec-trending-sec">
        <div className="container">
          <div className="rec-trending-grid">
            <div className="rec-trending-grid__main">
              <RecommendationWidget limit={8} />
            </div>
            <div className="rec-trending-grid__side">
              <TrendingWidget limit={5} />
            </div>
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
      <section className="section home-cta-sec">
        <div className="container">
          <div className="cta-box">
            <div className="cta-box__glow" />
            <p className="cta-box__brand">Ellines Haven</p>
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
