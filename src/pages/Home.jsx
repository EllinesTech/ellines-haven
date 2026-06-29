import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import BookCard, { BookStatusBadge } from '../components/BookCard';
import { useApp } from '../context/AppContext';
import { GENRES } from '../data/books';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './Home.css';

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

export default function Home() {
  const { books } = useApp();
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
      setTimeout(() => { setTagIdx(i => (i + 1) % TAGLINES.length); setFade(true); }, 350);
    }, 3600);
    return () => clearInterval(t);
  }, []);

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
            <span className="badge badge-gold hero__eyebrow">Kenya's Premier Literary Platform</span>

            <h1 className="hero__h1">
              <span className={`hero__tagline${fade ? ' hero__tagline--in' : ' hero__tagline--out'}`}>
                {TAGLINES[tagIdx]}
              </span>
            </h1>

            <p className="hero__sub">
              Original novels and short stories by <strong>Elijah Mwangi M</strong> —
              drawn from real lives, real heartbreaks, and the soul of East Africa.
              Buy once. Read forever.
            </p>

            <div className="hero__btns">
              <Link to="/library" className="btn btn-primary">Browse Books →</Link>
              <Link to="/about"   className="btn btn-outline">Our Story</Link>
            </div>

            <div className="hero__stats">
              <div><strong>50+</strong><span>Books</span></div>
              <div className="hero__stat-bar" />
              <div><strong>2k+</strong><span>Readers</span></div>
              <div className="hero__stat-bar" />
              <div><strong>4.8★</strong><span>Rating</span></div>
            </div>
          </div>

          {/* RIGHT — poster + floating badge */}
          <div className="hero__visual">
            <div className="hero__poster-frame">
              <img src="/poster4.png" alt="Ellines Haven" className="hero__poster" />
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
            { icon:'📱', title:'M-Pesa & Airtel',  desc:'Instant mobile payments'  },
            { icon:'⬇️', title:'Download Forever', desc:'Buy once, keep forever'    },
            { icon:'📖', title:'Read Online',       desc:'Beautiful built-in reader' },
            { icon:'🔒', title:'Secure & Safe',     desc:'Protected transactions'    },
          ].map(f => (
            <div key={f.title} className="trust-bar__item">
              <span className="trust-bar__icon">{f.icon}</span>
              <div><strong>{f.title}</strong><span>{f.desc}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          COMING SOON & IN PROGRESS
      ══════════════════════════════════════ */}
      {comingSoon.length > 0 && (
        <section className="section coming-soon-sec">
          <div className="container">
            <div className="sec-head">
              <div>
                <h2>Coming <span className="gold-text">Soon</span></h2>
                <p>Upcoming novels &amp; stories — get notified on launch day</p>
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
                <p>The latest from Elijah Mwangi M</p>
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
              <h2>Featured <span className="gold-text">Novels & Books</span></h2>
              <p>Original works inspired by true stories</p>
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
          <img src="/cover-the-last-chapter.png" alt="" aria-hidden="true" className="promo-banner__bg-img" />
          <div className="promo-banner__bg-mask" />
        </div>
        <div className="container promo-banner__content">
          <div className="promo-banner__copy">
            <span className="badge badge-gold">Author Spotlight</span>
            <h2>Elijah Mwangi M</h2>
            <p>
              From the golden savannahs of the Maasai Mara to the misty highlands of
              Mount Kenya — his stories are drawn from the full breath of this country.
              Every novel is a window into lives lived and dreams chased across East Africa.
            </p>
            <div className="promo-banner__btns">
              <Link to="/founder" className="btn btn-primary">Meet the Author</Link>
              <Link to="/library" className="btn btn-ghost">Explore All Books</Link>
            </div>
            <div className="promo-banner__quotes">
              <blockquote>"Stories that stay with you long after the last page."</blockquote>
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
          <p className="text-c muted" style={{ marginBottom:'36px' }}>Find the story that speaks to you</p>
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
          <p className="text-c muted" style={{ marginBottom:'48px' }}>More than a bookstore — a literary experience</p>
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
          <p className="text-c muted" style={{ marginBottom:'44px' }}>Voices from our community</p>
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
          CTA
      ══════════════════════════════════════ */}
      <section className="section">
        <div className="container">
          <div className="cta-box">
            <div className="cta-box__glow" />
            <img src="/logo-icon.png" alt="" className="cta-box__logo" />
            <h2>Ready to Start Reading?</h2>
            <p>Join thousands of readers discovering Kenya's finest stories.</p>
            <div className="cta-box__btns">
              <Link to="/register" className="btn btn-primary">Create Free Account</Link>
              <Link to="/library"  className="btn btn-ghost">Browse First</Link>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
