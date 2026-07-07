import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import EditableImage from '../components/EditableImage';
import './Founder.css';

/* ── Firestore key ── */
const FOUNDER_DOC = () => doc(db, 'site_data', 'founder_content');

/* ── Editable text (super admin only) ── */
function EditableText({ value, onSave, tag: Tag = 'p', className, style, multiline = false }) {
  const { user } = useApp();
  const isSA = user?.role === 'superadmin';
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

  if (!isSA) return <Tag className={className} style={style}>{value}</Tag>;

  if (editing) return (
    <div className="sa-edit-wrap">
      {multiline
        ? <textarea className="sa-edit-field" value={draft} onChange={e => setDraft(e.target.value)} rows={4} autoFocus />
        : <input    className="sa-edit-field" value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
      }
      <div className="sa-edit-actions">
        <button className="sa-btn sa-btn-save"   onClick={() => { onSave(draft); setEditing(false); }}>✓ Save</button>
        <button className="sa-btn sa-btn-cancel" onClick={() => { setDraft(value); setEditing(false); }}>✕</button>
      </div>
    </div>
  );

  return (
    <Tag className={`${className || ''} sa-editable`} style={style}
      title="Click to edit (super admin)" onClick={() => { setDraft(value); setEditing(true); }}>
      {value}<span className="sa-edit-hint">✏️</span>
    </Tag>
  );
}

/* ── Default content ── */
const DEFAULT = {
  founderPhoto: '/mwangi.png',
  heroTitle: 'Elijah Mwangi M',
  heroSub: 'Visionary founder of the Ellines Group — spanning technology, literature, and craftsmanship across Kenya. Software engineer, AI developer, and published author.',
  roles: [
    { icon: '🏛️', label: 'Group Founder' },
    { icon: '💻', label: 'Software Engineer' },
    { icon: '🤖', label: 'AI Developer' },
    { icon: '🌐', label: 'IT Specialist' },
    { icon: '✍️', label: 'Writer & Author' },
    { icon: '🪑', label: 'Rattan Craftsman' },
  ],
  stats: [
    { n: '3',    l: 'Companies Founded' },
    { n: '5+',   l: 'Years Experience'  },
    { n: '50+',  l: 'Projects Delivered' },
    { n: '100+', l: 'Clients Served'    },
  ],
  storyHeading: 'The Story',
  storySub: 'A journey of technology, creativity, and purpose',
  storyPara: 'Elijah Mwangi M is the founder of the Ellines Group — a family of businesses built on the belief that Kenya deserves world-class everything. Born and raised in Kenya, he combined a passion for technology with a deep love of storytelling. He founded Ellines Tech to bridge the gap in IT solutions for Kenyan businesses, created Ellines Haven as a sanctuary for authentic African literature, and launched Ellines Rattan Furniture to bring premium craftsmanship into local homes. His work sits at the intersection of technology and culture — building AI tools by day, crafting stories that matter by night.',
  storyQuote: '"Technology should empower everyone — not just the privileged few. My mission is to build tools and platforms that uplift African businesses, creators, and communities."',
  writerHeading: "The Writer's Soul",
  writerSub: 'Stories born from real life, real people, and real wonder',
  writerPara: 'Long before Elijah wrote a line of code, he wrote stories. As a child in Kenya, books were portals. He devoured Ngugi wa Thiong\'o, Chinua Achebe, and everything he could find — but noticed that the texture of daily African life was missing from the shelves. That absence became his calling. His novels are not invented from thin air; they are assembled from conversations overheard at bus stops, people he has met, places he has lived, and moments that refused to leave him. Running Ellines Tech brought him face-to-face with Kenya\'s hidden stories — young coders in Kibera, women entrepreneurs in Gikomba, teachers in rural schools. These encounters found their way into his writing. He built Ellines Haven because great African stories existed, but a platform worthy of them did not.',
  pullQuotes: [
    '"I write because the stories I needed as a young man didn\'t exist yet. So I decided to write them myself."',
    '"Every novel is a conversation across time — talking to a reader I will never meet, about a truth we both already know."',
    '"Africa does not need to be explained. It needs to be heard — on its own terms, in its own voice."',
  ],
  booksHeading: 'Published Works',
  booksSub: 'Every novel and story written by Elijah Mwangi M — all inspired by true stories, real life experiences, and the people he has met on his journey.',
  books: [
    { title: 'Marriage Is a Scam', genre: 'Drama Novel',    cover: '/cover-marriage-is-a-scam.png', note: 'A bold, unflinching look at modern Kenyan marriage — drawn from real relationships and real heartbreaks.', color: null, accent: '#c9a84c' },
    { title: 'Pain',               genre: 'Drama Novel',    cover: '/cover-pain.png',               note: 'His most personal work. Written through loss — every page carries the weight of something truly lived.', color: null, accent: '#e8832a' },
    { title: 'Echoes of the Savanna', genre: 'Historical',  cover: null, color: 'linear-gradient(145deg,#1a2a0a,#2d4a10)', accent: '#7ab648', note: 'True stories of Kenyan families fighting colonial land seizure — courage preserved in fiction.' },
    { title: 'Seven Sunsets',      genre: 'Short Stories',  cover: null, color: 'linear-gradient(145deg,#1a0a00,#4a2000)', accent: '#e8832a', note: 'Seven true-to-life moments gifted by real people across East Africa.' },
    { title: 'Midnight in Mombasa', genre: 'Mystery Novel', cover: null, color: 'linear-gradient(145deg,#00081a,#001a3a)', accent: '#4a9eff', note: 'Inspired by real events on the Swahili coast — power, secrets, family loyalty.' },
    { title: 'Nairobi Nights',     genre: 'Drama Stories',  cover: null, color: 'linear-gradient(145deg,#0a0005,#1a0010)', accent: '#ff6b9d', note: 'Three nights in Nairobi that Elijah witnessed firsthand — captured as they felt.' },
  ],
  journeyHeading: 'The Journey',
  journeySub: 'From blank notebooks to built platforms — every step that shaped the writer and the builder.',
  timeline: [
    { year: '2015', icon: '📚', tag: 'Writing',     title: 'First Words on Paper',           desc: 'As a teenager Elijah filled notebooks with characters drawn from Nairobi\'s streets — he was already a writer without knowing it.' },
    { year: '2017', icon: '📖', tag: 'Inspiration', title: 'The Books That Changed Everything', desc: 'Reading Ngugi wa Thiong\'o and Chimamanda Ngozi Adichie showed him that fiction could carry the full weight of African truth. He decided he would write that kind of book.' },
    { year: '2018', icon: '💻', tag: 'Tech',        title: 'Into the World of Code',          desc: 'Started programming and fell in love with building. The discipline of engineering sharpened how he structured stories.' },
    { year: '2020', icon: '🚀', tag: 'Company',     title: 'Ellines Tech Founded',            desc: 'Launched Ellines Tech in Nairobi, bringing world-class IT solutions to Kenyan businesses.' },
    { year: '2021', icon: '✍️', tag: 'Writing',    title: 'First Manuscript Completed',      desc: 'During a difficult personal season, the first full novel came out of silence — raw, honest, and deeply Kenyan. Finishing it changed him.' },
    { year: '2022', icon: '🌍', tag: 'Inspiration', title: 'Stories from the Field',          desc: 'Running Ellines Tech placed him inside Kenya\'s hidden stories. Every client meeting was research. The second novel began writing itself.' },
    { year: '2023', icon: '🪑', tag: 'Company',     title: 'Ellines Rattan Furniture Launched', desc: 'Expanded the Ellines Group into handcrafted living — bringing premium rattan pieces to Kenyan homes at honest prices.' },
    { year: '2024', icon: '🏠', tag: 'Platform',    title: 'Ellines Haven Launched',          desc: 'Built and launched Ellines Haven — the dedicated digital platform for original African literature he had always wished existed.' },
    { year: '2025', icon: '🌟', tag: 'Now',         title: 'Writing, Building, Inspiring',    desc: 'Currently writing his third novel while scaling Ellines Tech and Haven. Mentoring young Kenyan developers and writers alike.' },
  ],
  skillsHeading: 'Areas of Expertise',
  skillsSub: 'A multidisciplinary builder across technology and the arts.',
  skills: [
    { icon: '🤖', title: 'AI & Machine Learning',  desc: 'Building intelligent systems — from automation pipelines to conversational AI agents and predictive models.' },
    { icon: '💻', title: 'Software Engineering',    desc: 'Crafting scalable, production-grade software with modern stacks. Full-stack from elegant UIs to robust backend architectures.' },
    { icon: '🌐', title: 'IT Infrastructure',       desc: 'Designing and managing reliable IT ecosystems — networks, cloud deployments, cybersecurity, and end-to-end technical support.' },
    { icon: '📱', title: 'Web & App Development',   desc: 'Creating beautiful, fast, and accessible web and mobile applications tailored to client needs.' },
    { icon: '✍️', title: 'Writing & Storytelling', desc: 'An accomplished author whose stories draw from the rich fabric of East African life. Fiction that resonates, educates, and endures.' },
    { icon: '🛡️', title: 'Cybersecurity',          desc: 'Protecting digital assets through security audits, vulnerability assessments, and best-practice security architectures.' },
  ],
  worksHeading: 'The Ellines Group',
  worksSub: 'Three ventures, one vision — built from the ground up in Kenya.',
  works: [
    { icon: '⚡', tag: 'Technology',    title: 'Ellines Tech',            story: 'Kenyan businesses were being left behind by technology — not because they lacked ambition, but because accessible, world-class tech solutions didn\'t exist for them. Elijah founded Ellines Tech to change that. Today it is a trusted IT partner delivering software, AI, cybersecurity, and managed services to businesses across East Africa.', link: 'https://ellinestech.co.ke', linkLabel: 'ellinestech.co.ke' },
    { icon: '📚', tag: 'Literature',   title: 'Ellines Haven',           story: 'Books saved Elijah. But the African stories he needed — honest, local, deeply human — were hard to find and rarely celebrated. So he built Ellines Haven: a dedicated digital home for original African literature. Every novel is written by him, drawn from real life and real people. Not just a bookstore — a literary sanctuary built by a writer who refused to wait.', link: '/', linkLabel: 'Explore Ellines Haven' },
    { icon: '🪑', tag: 'Furniture',    title: 'Ellines Rattan Furniture', story: 'Not every Ellines chapter happens on a screen. Ellines Rattan Furniture brings premium handcrafted rattan and cane pieces to Kenyan homes and offices at honest prices. The same philosophy: build something real, build it well, and make sure the people around you can afford to benefit from it.', link: 'https://ellinestech.co.ke', linkLabel: 'Contact for orders' },
  ],
  ctaHeading: 'Work with Elijah',
  ctaSub: 'Whether you need a custom software solution, AI integration, IT infrastructure, or just want to collaborate — reach out and let\'s build something great.',
};

/* ── Photo gallery for the hero crossfade ── */
const HERO_PHOTOS = [
  { src: '/mwangi.png',  alt: 'Elijah Mwangi M — Founder & CEO',    caption: 'Founder & CEO'          },
  { src: '/mwangi2.png', alt: 'Elijah Mwangi M — at work',          caption: 'Building the future'    },
  { src: '/mwangi3.png', alt: 'Elijah Mwangi M — tech advocate',    caption: 'Tech advocate'           },
  { src: '/mwangi4.png', alt: 'Elijah Mwangi M — the man behind',   caption: 'The man behind Ellines'  },
  { src: '/mwangi5.png', alt: 'Elijah Mwangi M — vision & purpose', caption: 'Vision & purpose'        },
];

export default function Founder() {
  const { user } = useApp();
  const isSA = user?.role === 'superadmin';
  const [content, setContent] = useState(DEFAULT);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');
  const [activePhoto, setActivePhoto] = useState(0);
  const [fading,      setFading]      = useState(false);

  /* Auto-cycle photos every 30 seconds with a crossfade */
  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setActivePhoto(p => (p + 1) % HERO_PHOTOS.length);
        setFading(false);
      }, 800); // fade-out duration before swapping
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getDoc(FOUNDER_DOC()).then(snap => {
      if (snap.exists()) setContent(prev => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const patch = async (key, val) => {
    const next = { ...content, [key]: val };
    setContent(next);
    setSaving(true);
    try {
      await setDoc(FOUNDER_DOC(), { [key]: val, updatedAt: serverTimestamp() }, { merge: true });
      showToast('✓ Saved');
    } catch (e) { showToast('⚠ Save failed: ' + e.message); }
    setSaving(false);
  };

  const patchArr = async (key, idx, subKey, val) => {
    const arr = [...content[key]];
    arr[idx] = { ...arr[idx], [subKey]: val };
    await patch(key, arr);
  };

  const EA = (key, tag, cls, sty, multi) => (
    <EditableText value={content[key]} onSave={v => patch(key, v)}
      tag={tag} className={cls} style={sty} multiline={multi} />
  );

  return (
    <main>
      {(toast || saving) && (
        <div className="sa-toast">{saving ? '⏳ Saving…' : toast}</div>
      )}

      {/* ── Hero ── */}
      <section className="founder-hero">
        <div className="founder-hero-bg" aria-hidden="true" />
        <div className="founder-hero-content">
          <div className="founder-photo-wrap">
            <div className="founder-photo-ring">
              {isSA ? (
                <EditableImage
                  field="founderPhoto"
                  src={content.founderPhoto || HERO_PHOTOS[activePhoto].src}
                  alt={HERO_PHOTOS[activePhoto].alt}
                  className={`founder-photo founder-photo--fade${fading ? ' out' : ' in'}`}
                  storageFolder="site-images"
                  onUpload={url => patch('founderPhoto', url)}
                />
              ) : (
                <picture>
                  <source
                    srcSet={(content.founderPhoto || HERO_PHOTOS[activePhoto].src).replace(/\.png$/i, '.webp')}
                    type="image/webp"
                  />
                  <img
                    src={content.founderPhoto || HERO_PHOTOS[activePhoto].src}
                    alt={HERO_PHOTOS[activePhoto].alt}
                    className={`founder-photo founder-photo--fade${fading ? ' out' : ' in'}`}
                    loading="eager"
                    decoding="async"
                  />
                </picture>
              )}
              <span className="founder-badge-float">{HERO_PHOTOS[activePhoto].caption}</span>
            </div>
            {/* Dot indicators */}
            <div className="founder-photo-dots">
              {HERO_PHOTOS.map((_, i) => (
                <button
                  key={i}
                  className={`founder-photo-dot${activePhoto === i ? ' active' : ''}`}
                  onClick={() => { setFading(true); setTimeout(() => { setActivePhoto(i); setFading(false); }, 400); }}
                  aria-label={`View photo ${i + 1}`}
                />
              ))}
            </div>
          </div>
          <div className="founder-bio">
            <span className="founder-tag"><span>✦</span> Founder, Ellines Group</span>
            <h1 className="founder-name">
              {EA('heroTitle', 'span', undefined, undefined, false)}
            </h1>
            {EA('heroSub', 'p', 'founder-title', undefined, true)}
            <div className="founder-roles">
              {content.roles.map((r, i) => (
                <span key={i} className="founder-role-chip">
                  <span className="chip-icon">{r.icon}</span>
                  {isSA
                    ? <EditableText value={r.label} onSave={v => patchArr('roles', i, 'label', v)} tag="span" />
                    : r.label
                  }
                </span>
              ))}
            </div>
            <div className="founder-contact-strip">
              <a href="tel:+254748255466" className="founder-contact-item"><span>📞</span> 0748 255 466</a>
              <a href="mailto:ellines.haven@gmail.com" className="founder-contact-item"><span>📧</span> ellines.haven@gmail.com</a>
              <a href="https://ellinestech.co.ke" target="_blank" rel="noopener noreferrer" className="founder-contact-item"><span>🌐</span> ellinestech.co.ke</a>
            </div>
            <div className="founder-cta-row">
              <a href="https://ellinestech.co.ke" target="_blank" rel="noopener noreferrer" className="btn btn-primary">🌐 Visit Ellines Tech</a>
              <Link to="/contact" className="btn btn-outline">Get in Touch</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <div className="founder-stats-strip">
        <div className="founder-stats-inner">
          {content.stats.map((s, i) => (
            <div key={i} className="founder-stat-item">
              {isSA ? (
                <>
                  <EditableText value={s.n} onSave={v => patchArr('stats', i, 'n', v)} tag="strong" />
                  <EditableText value={s.l} onSave={v => patchArr('stats', i, 'l', v)} tag="span" />
                </>
              ) : (
                <><strong>{s.n}</strong><span>{s.l}</span></>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Story ── */}
      <section className="founder-section">
        <div className="founder-inner">
          <div className="founder-story-full">
            {/* Left: text + quote */}
            <div className="founder-story-text-col">
              <span className="founder-story-eyebrow">✦ His Story</span>
              <h2 className="founder-story-h2">
                {EA('storyHeading', 'span', 'gold-text')}
              </h2>
              <p className="founder-story-sub">{content.storySub}</p>
              {EA('storyPara', 'p', 'founder-story-body', undefined, true)}
              <blockquote className="founder-story-bq">
                {EA('storyQuote', 'span', undefined, undefined, true)}
              </blockquote>
            </div>
            {/* Right: what he built */}
            <div className="founder-story-built-col">
              <p className="founder-story-built-label">What he built</p>
              {content.works.map((w, i) => (
                <a
                  key={i}
                  href={w.link}
                  target={w.link.startsWith('http') ? '_blank' : '_self'}
                  rel="noopener noreferrer"
                  className="founder-built-card"
                >
                  <span className="founder-built-icon">{w.icon}</span>
                  <div className="founder-built-body">
                    <strong>{w.title}</strong>
                    <span>{w.tag}</span>
                  </div>
                  <span className="founder-built-arrow">→</span>
                </a>
              ))}
              <div className="founder-story-since">
                <span className="founder-story-since-n">2020</span>
                <span className="founder-story-since-l">Building since</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Writer's Soul ── */}
      <section className="founder-section founder-section-alt">
        <div className="founder-inner">
          <div className="founder-section-title">
            <h2>{EA('writerHeading', 'span', 'gold-text')}</h2>
            {EA('writerSub', 'p', undefined, undefined, false)}
          </div>
          <div className="founder-writing-row">
            <div className="founder-writing-main">
              {EA('writerPara', 'p', undefined, { lineHeight: 1.85, color: 'var(--muted)' }, true)}
              <div className="founder-true-stories-banner">
                <div className="founder-tsb-icon">✦</div>
                <div className="founder-tsb-content">
                  <h3>All Stories Are True Stories</h3>
                  <p>Every novel Elijah has written is grounded in reality — assembled from real life experiences, people he has met, conversations he has heard, places he has lived, and moments that refused to leave him. The names change. The truth at the core does not.</p>
                  <div className="founder-tsb-tags">
                    <span>True Life Experiences</span>
                    <span>Real People's Stories</span>
                    <span>Kenyan Society</span>
                    <span>Human Emotion</span>
                    <span>Personal Journey</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="founder-writing-aside">
              {content.pullQuotes.map((q, i) => (
                <div key={i} className="founder-pullquote">
                  {isSA
                    ? <EditableText value={q} onSave={v => { const arr = [...content.pullQuotes]; arr[i] = v; patch('pullQuotes', arr); }} tag="p" multiline />
                    : <p>{q}</p>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Published Works ── */}
      <section className="founder-section">
        <div className="founder-inner">
          <div className="founder-section-title">
            <h2>📚 {EA('booksHeading', 'span', 'gold-text')}</h2>
            {EA('booksSub', 'p', 'about-section-sub', undefined, true)}
          </div>
          <div className="founder-books-grid">
            {content.books.map((b, i) => (
              <div key={i} className="founder-book-card">
                <div className="founder-book-spine" aria-hidden="true" />
                {b.cover ? (
                  <div className="founder-book-cover-photo"><img src={b.cover} alt={b.title} /></div>
                ) : (
                  <div className="founder-book-cover-styled" style={{ background: b.color }}>
                    <span style={{ color: b.accent, fontSize:'0.58rem', fontWeight:700, letterSpacing:'2px', textTransform:'uppercase' }}>{b.genre}</span>
                    <strong style={{ fontFamily:"'Playfair Display',serif", fontSize:'0.88rem', color:'#f0ece2', textAlign:'center', lineHeight:1.3 }}>{b.title}</strong>
                    <div style={{ width:28, height:2, background: b.accent, borderRadius:2, opacity:0.8 }} />
                  </div>
                )}
                <div className="founder-book-body">
                  {isSA
                    ? <EditableText value={b.title} onSave={v => patchArr('books', i, 'title', v)} tag="h4" />
                    : <h4>{b.title}</h4>
                  }
                  <span className="founder-book-author">{b.genre}</span>
                  {isSA
                    ? <EditableText value={b.note} onSave={v => patchArr('books', i, 'note', v)} tag="p" multiline />
                    : <p>{b.note}</p>
                  }
                  <span className="founder-book-true-badge">✦ Inspired by True Stories</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey / Timeline ── */}
      <section className="founder-section founder-section-alt">
        <div className="founder-inner">
          <div className="founder-section-title">
            <h2>The <span className="gold-text">{EA('journeyHeading', 'span')}</span></h2>
            {EA('journeySub', 'p', undefined, undefined, false)}
          </div>
          <div className="founder-tl-rail">
            {content.timeline.map((t, i) => (
              <div key={i} className="founder-tl-card">
                <div className="founder-tl-dot-new" />
                <div>
                  <span className="founder-tl-year">{t.year}</span>
                  <span className={`founder-tl-tag tl-tag-${t.tag.toLowerCase()}`}>{t.tag}</span>
                </div>
                {isSA
                  ? <EditableText value={t.title} onSave={v => patchArr('timeline', i, 'title', v)} tag="h3" />
                  : <h3>{t.title}</h3>
                }
                {isSA
                  ? <EditableText value={t.desc} onSave={v => patchArr('timeline', i, 'desc', v)} tag="p" multiline />
                  : <p>{t.desc}</p>
                }
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Areas of Expertise ── */}
      <section className="founder-section">
        <div className="founder-inner">
          <div className="founder-section-title">
            <h2>{EA('skillsHeading', 'span', 'gold-text')}</h2>
            {EA('skillsSub', 'p', undefined, undefined, false)}
          </div>
          <div className="founder-skills-grid">
            {content.skills.map((s, i) => (
              <div key={i} className="founder-skill-card">
                <div className="skill-icon">{s.icon}</div>
                {isSA
                  ? <EditableText value={s.title} onSave={v => patchArr('skills', i, 'title', v)} tag="h3" />
                  : <h3>{s.title}</h3>
                }
                {isSA
                  ? <EditableText value={s.desc} onSave={v => patchArr('skills', i, 'desc', v)} tag="p" multiline />
                  : <p>{s.desc}</p>
                }
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Work with Elijah CTA ── */}
      <section className="founder-cta-section">
        <div className="founder-inner">
          <h2>{EA('ctaHeading', 'span', undefined, undefined, false)}</h2>
          {EA('ctaSub', 'p', undefined, undefined, true)}
          <div className="founder-cta-contact">
            <a href="tel:+254748255466" className="founder-cta-chip">📞 0748 255 466</a>
            <a href="mailto:ellines.haven@gmail.com" className="founder-cta-chip">📧 ellines.haven@gmail.com</a>
            <a href="https://ellinestech.co.ke" target="_blank" rel="noopener noreferrer" className="founder-cta-chip">🌐 ellinestech.co.ke</a>
          </div>
          <div className="founder-cta-buttons">
            <a href="https://ellinestech.co.ke" target="_blank" rel="noopener noreferrer" className="btn btn-primary">🌐 Ellines Tech</a>
            <Link to="/contact" className="btn btn-outline">✉️ Contact Us</Link>
            <Link to="/library" className="btn btn-ghost">📚 Read His Books</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
