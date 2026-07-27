import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import EditableImage from '../components/EditableImage';
import { usePageMeta } from '../hooks/usePageMeta';
import './About.css';

/* ── Firestore key ── */
const ABOUT_DOC = () => doc(db, 'site_data', 'about_content');

const DEFAULT_CONTENT = {
  founderPhoto: '/mwangi.png',
  heroTagline: 'A home for original African literature — built in Kenya, for the world.',

  /* Story */
  storyHeading: 'Our Story',
  storyPara1: 'Ellines Haven was born from a simple but powerful belief: that Kenyan and East African stories deserve a dedicated, beautiful, and permanent home. We are a platform built for readers who hunger for authentic voices — and powered by an author who refused to wait for someone else to build what he needed.',
  storyPara2: 'Every book on this platform is crafted with care and honesty, drawing from the rich tapestry of Kenyan life — its landscapes, its people, its history, and its dreams. From gripping dramas on the streets of Nairobi to sweeping stories of the highlands, we bring you tales that stay with you long after the last page.',
  storyPara3: 'Ellines Haven is not just a bookstore. It is a literary sanctuary — a place where the lived experiences of East Africa are transformed into stories that educate, inspire, and endure. Here, authentic voices are celebrated on their own terms, without apology and without translation.',

  /* Why Africa Needs This */
  whyHeading: 'Why Africa Needs This',
  whySub: 'The African literary space is vast — but the platforms that celebrate it are few. Ellines Haven was built to close that gap.',
  whyPoints: [
    { title: 'Stories Locked Away', desc: 'Brilliant African writers exist across every village, city, and campus on this continent — but their stories rarely reach the people they were written for. We change that.' },
    { title: 'Priced Out of Books', desc: 'Imported books are expensive. Shipping is unreliable. Ellines Haven delivers world-class stories at honest, locally-calibrated prices — instantly, anywhere.' },
    { title: 'Representation Matters', desc: 'African readers deserve to see themselves in fiction. Not as spectacle, not as tragedy — but as full, complex human beings navigating the same beautiful, messy life everyone else does.' },
    { title: 'Built by an African', desc: 'This platform was not donated, commissioned, or approved by a foreign publisher. It was conceived, engineered, and launched by a Kenyan — for Kenya and the continent.' },
  ],

  /* Mission & Vision */
  missionHeading: 'Our Mission',
  missionText: 'To create a world-class digital home where original African stories can be discovered, purchased, and read beautifully — and where authors who tell real, honest, local stories are celebrated on their own terms.',
  visionHeading: 'Our Vision',
  visionText: 'A continent where every African reader can find themselves in a story, and where East African literature takes its rightful place at the global table of great literature.',

  /* Values */
  valuesHeading: 'What We Stand For',
  values: [
    { title: 'Authenticity', desc: 'Every story is grounded in real life — real people, real places, real emotions. No borrowed narratives, no distant voices.' },
    { title: 'African Pride', desc: 'We celebrate the richness of East African culture, history, and humanity without apology and without explanation.' },
    { title: 'Accessibility', desc: 'Great literature should not be locked behind geography or high prices. Every story on Ellines Haven is priced for the people it was written about.' },
    { title: 'Quality', desc: 'Every work published here meets a standard of craft and honesty. Stories that are worth your time, every time.' },
    { title: 'Innovation', desc: 'Built by a software engineer and author, Ellines Haven blends the best of technology with the soul of literature.' },
    { title: 'Community', desc: 'We exist for readers and writers alike — building a community that uplifts African voices and creates space for new stories to emerge.' },
  ],

  /* What We Offer */
  offerHeading: 'What We Offer',
  offers: [
    'Original novels and short stories by Elijah Mwangi M',
    'Instant access after purchase — read online immediately',
    'Download PDF to read offline at your own pace',
    'Secure M-Pesa, Airtel Money & card payments',
    'Kenya-based support — real people who care',
    'Carefully curated library with new titles regularly',
  ],

  /* Experience section */
  experienceHeading: 'The Ellines Haven Experience',
  experienceSub: 'More than a store — a complete literary journey from discovery to the last page.',
  experiences: [
    { step: '01', title: 'Discover', desc: 'Browse our curated library by genre, theme, or mood. Every book comes with a full synopsis, excerpt, and reader reviews.' },
    { step: '02', title: 'Purchase', desc: 'Pay instantly with M-Pesa, Airtel Money, or card. No hidden fees. Your book is unlocked the moment payment clears.' },
    { step: '03', title: 'Read', desc: 'Open in our beautiful built-in reader — works on any device, no app needed. Or download your PDF for offline reading.' },
    { step: '04', title: 'Own Forever', desc: 'No subscriptions. No expiry. Once you buy a book, it lives in your library permanently. Yours to return to whenever you want.' },
  ],

  /* Ellines Group */
  groupHeading: 'The Ellines Group',
  groupIntro: 'Ellines Haven is the literary heart of the Ellines Group — a family of businesses founded by Elijah Mwangi M, all built on one shared belief: that Kenya deserves world-class everything. The Ellines name carries a promise of quality, purpose, and pride in every venture it covers.',
  groupCompanies: [
    {
      name: 'Ellines Haven',
      tag: 'Literature · You Are Here',
      desc: 'A dedicated digital home for original African literature. Every novel and story is written by Elijah Mwangi M — honest, local, and deeply human. A place where authentic East African stories find a beautiful home and reach the readers who deserve them.',
      link: '/',
      linkLabel: 'Explore Ellines Haven',
      highlight: true,
    },
    {
      name: 'Ellines Tech',
      tag: 'Technology',
      desc: 'A full-service IT company delivering software development, AI integrations, cybersecurity, web and mobile applications, and managed IT support to businesses across Kenya and East Africa. The digital infrastructure that African business deserves.',
      link: 'https://tech.ellines.co.ke/',
      linkLabel: 'tech.ellines.co.ke',
      highlight: false,
    },
    {
      name: 'Ellines Rattan Furniture',
      tag: 'Craft & Living',
      desc: 'Premium quality rattan and cane furniture, handcrafted with care and traditional weaving techniques for Kenyan homes and offices. Beautiful living spaces at honest prices.',
      link: 'https://rattanfurniture.ellines.co.ke/',
      linkLabel: 'rattanfurniture.ellines.co.ke',
      highlight: false,
    },
  ],

  /* Founder teaser */
  founderTeaser: 'Ellines Haven was created by Elijah Mwangi M — a Kenyan software engineer, AI developer, and author who built the platform he always wished existed. Every story on this platform is written by him, drawn from real life, real people, and real moments across East Africa.',

  /* Stats */
  statsHeading: 'Ellines Haven by the Numbers',
  stats: [
    { n: '50+',    l: 'Books Published' },
    { n: '2,000+', l: 'Happy Readers'   },
    { n: '4.8★',   l: 'Average Rating'  },
    { n: 'Kenya',  l: 'Based In'        },
  ],

  /* Promise */
  promiseHeading: 'Our Promise to Readers',
  promisePara1: 'Every book you find on Ellines Haven has been written with full commitment — no ghost-writers, no shortcuts, no filler. Each story is a direct expression of one author\'s lived experience and creative vision.',
  promisePara2: 'We promise honest pricing, instant delivery, and stories that treat you — the reader — as someone who deserves complexity, beauty, and truth in equal measure. And we will keep building, keep writing, and keep showing up for African literature for as long as readers keep showing up for us.',
  promiseQuote: '"We are not building a bookstore. We are building a legacy — one story at a time."',
};

/* ── Inline icons ── */
const IconTarget = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const IconStar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconPhone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const IconGlobe = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IconMap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconBook = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);
const IconLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IconTag = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconWrench = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);
const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconSpark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2z"/>
  </svg>
);
const IconHeart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
const IconBolt = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconChair = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 11h12v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3z"/><path d="M8 11V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4"/><path d="M8 16v3M16 16v3M5 22h14"/>
  </svg>
);
const IconArrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const WHY_ICONS = [IconLock, IconTag, IconUsers, IconWrench];
const VALUE_ICONS = [IconSpark, IconGlobe, IconBook, IconShield, IconBolt, IconHeart];
const GROUP_ICONS = [IconBook, IconBolt, IconChair];

/* ── Inline editor ── */
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
      {value}<span className="sa-edit-hint">✎</span>
    </Tag>
  );
}

/* ── Decorative poster ── */
function AboutPoster() {
  return (
    <div className="about-poster-card">
      <div className="apc-orb apc-orb1" aria-hidden="true" />
      <div className="apc-orb apc-orb2" aria-hidden="true" />
      <div className="apc-logo-wrap">
        <img src="/logo-icon.png" alt="" className="apc-logo-img" />
        <div className="apc-logo-glow" aria-hidden="true" />
      </div>
      <div className="apc-brand">
        <span className="apc-brand-main">Ellines</span>
        <span className="apc-brand-sub">Haven</span>
      </div>
      <p className="apc-tagline">Stories That Resonate</p>
      <div className="apc-divider" aria-hidden="true" />
      <p className="apc-pillars">Original African Literature</p>
      <span className="apc-watermark">haven.ellines.co.ke</span>
    </div>
  );
}

export default function About() {
  const { user } = useApp();
  usePageMeta({
    title: 'About Ellines Haven',
    description: 'A sanctuary for original African literature — stories born from real life, written in Kenya, read by the world.',
  });
  const isSA = user?.role === 'superadmin';
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');

  useEffect(() => {
    getDoc(ABOUT_DOC()).then(snap => {
      if (snap.exists()) setContent(prev => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const patch = async (key, val) => {
    const next = { ...content, [key]: val };
    setContent(next);
    setSaving(true);
    try {
      await setDoc(ABOUT_DOC(), { [key]: val, updatedAt: serverTimestamp() }, { merge: true });
      showToast('✓ Saved');
    } catch (e) { showToast('⚠ Save failed: ' + e.message); }
    setSaving(false);
  };

  const patchArray = async (key, idx, subKey, val) => {
    const arr = [...content[key]];
    arr[idx] = { ...arr[idx], [subKey]: val };
    await patch(key, arr);
  };

  /* shorthand helper */
  const EA = (key, tag, cls, style, multi) => (
    <EditableText value={content[key]} onSave={v => patch(key, v)}
      tag={tag} className={cls} style={style} multiline={multi} />
  );

  return (
    <main className="about-page">
      {(toast || saving) && (
        <div className="sa-toast">{saving ? 'Saving…' : toast}</div>
      )}

      {/* ── Hero ── */}
      <header className="about-hero">
        <div className="about-hero__glow" aria-hidden="true" />
        <div className="about-hero__orb about-hero__orb--1" aria-hidden="true" />
        <div className="about-hero__orb about-hero__orb--2" aria-hidden="true" />
        <div className="container about-hero__inner">
          <p className="about-hero__brand">Ellines Haven</p>
          <h1>About <span className="gold-text">Our Haven</span></h1>
          {EA('heroTagline', 'p', 'about-hero__sub', undefined, false)}
          <div className="about-hero__ctas">
            <Link to="/library" className="btn btn-primary">Browse the Library</Link>
            <Link to="/founder" className="btn btn-outline">Meet the Founder</Link>
          </div>
        </div>
      </header>

      {/* ── Story + poster ── */}
      <section className="section about-story-section">
        <div className="container about-grid about-rise">
          <div className="about-img">
            <AboutPoster />
          </div>
          <div className="about-copy">
            <h2>{EA('storyHeading', 'span', 'gold-text')}</h2>
            {EA('storyPara1', 'p', undefined, undefined, true)}
            {EA('storyPara2', 'p', undefined, undefined, true)}
            {EA('storyPara3', 'p', 'about-story-pull', undefined, true)}
            <div className="about-story-actions">
              <Link to="/library" className="btn btn-primary about-cta">Browse Our Books</Link>
              <Link to="/contact" className="btn btn-outline about-cta">Get in Touch</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="section about-stats-sec">
        <div className="container">
          <div className="about-stats about-rise about-rise--delay">
            {content.stats.map((s, i) => (
              <div key={i} className="about-stat">
                {isSA ? (
                  <>
                    <EditableText value={s.n} onSave={v => patchArray('stats', i, 'n', v)} tag="strong" />
                    <EditableText value={s.l} onSave={v => patchArray('stats', i, 'l', v)} tag="span" />
                  </>
                ) : (
                  <><strong>{s.n}</strong><span>{s.l}</span></>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Africa Needs This ── */}
      <section className="section about-why-section">
        <div className="container">
          <div className="about-section-title about-rise">
            <h2>{EA('whyHeading', 'span', 'gold-text')}</h2>
            {EA('whySub', 'p', 'about-section-sub', undefined, true)}
          </div>
          <div className="about-why-grid">
            {content.whyPoints.map((p, i) => {
              const WhyIcon = WHY_ICONS[i % WHY_ICONS.length];
              return (
                <div key={i} className="about-why-item">
                  <div className="about-mark" aria-hidden="true"><WhyIcon /></div>
                  <div>
                    {isSA
                      ? <EditableText value={p.title} onSave={v => patchArray('whyPoints', i, 'title', v)} tag="h4" />
                      : <h4>{p.title}</h4>
                    }
                    {isSA
                      ? <EditableText value={p.desc} onSave={v => patchArray('whyPoints', i, 'desc', v)} tag="p" multiline />
                      : <p>{p.desc}</p>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Mission & Vision ── */}
      <section className="section about-mv-section">
        <div className="container">
          <div className="about-mv-grid about-rise">
            <div className="about-mv-block">
              <div className="about-mv-icon" aria-hidden="true"><IconTarget /></div>
              <h3>{EA('missionHeading', 'span')}</h3>
              {EA('missionText', 'p', undefined, undefined, true)}
            </div>
            <div className="about-mv-block">
              <div className="about-mv-icon" aria-hidden="true"><IconStar /></div>
              <h3>{EA('visionHeading', 'span')}</h3>
              {EA('visionText', 'p', undefined, undefined, true)}
            </div>
          </div>
        </div>
      </section>

      {/* ── What We Stand For ── */}
      <section className="section about-values-section">
        <div className="container">
          <div className="about-section-title about-rise">
            <h2>{EA('valuesHeading', 'span', 'gold-text')}</h2>
          </div>
          <div className="about-values-grid">
            {content.values.map((v, i) => {
              const ValIcon = VALUE_ICONS[i % VALUE_ICONS.length];
              return (
                <div key={i} className="about-value-item">
                  <div className="about-mark about-mark--sm" aria-hidden="true"><ValIcon /></div>
                  <div>
                    {isSA
                      ? <EditableText value={v.title} onSave={val => patchArray('values', i, 'title', val)} tag="h4" />
                      : <h4>{v.title}</h4>
                    }
                    {isSA
                      ? <EditableText value={v.desc} onSave={val => patchArray('values', i, 'desc', val)} tag="p" multiline />
                      : <p>{v.desc}</p>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── The Experience ── */}
      <section className="section about-experience-section">
        <div className="container">
          <div className="about-section-title about-rise">
            <h2>{EA('experienceHeading', 'span', 'gold-text')}</h2>
            {EA('experienceSub', 'p', 'about-section-sub', undefined, true)}
          </div>
          <div className="about-experience-grid">
            {content.experiences.map((e, i) => (
              <div key={i} className="about-experience-step">
                <div className="about-exp-step">{e.step}</div>
                {isSA
                  ? <EditableText value={e.title} onSave={v => patchArray('experiences', i, 'title', v)} tag="h4" />
                  : <h4>{e.title}</h4>
                }
                {isSA
                  ? <EditableText value={e.desc} onSave={v => patchArray('experiences', i, 'desc', v)} tag="p" multiline />
                  : <p>{e.desc}</p>
                }
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What We Offer ── */}
      <section className="section about-offer-section">
        <div className="container about-offer-grid about-rise">
          <div className="about-offer-text">
            <h2>{EA('offerHeading', 'span', 'gold-text')}</h2>
            <ul className="about-list">
              {content.offers.map((item, i) => (
                <li key={i}>
                  <span className="about-check" aria-hidden="true"><IconCheck /></span>
                  {isSA
                    ? <EditableText value={item} onSave={val => { const arr = [...content.offers]; arr[i] = val; patch('offers', arr); }} tag="span" />
                    : item
                  }
                </li>
              ))}
            </ul>
            <Link to="/library" className="btn btn-primary about-cta">Start Reading</Link>
          </div>
          <div className="about-offer-aside">
            <h4 className="about-offer-aside__title">Get in Touch</h4>
            <div className="about-contact-row">
              <span className="about-contact-icon"><IconMail /></span>
              <a href="mailto:haven@ellines.co.ke">haven@ellines.co.ke</a>
            </div>
            <div className="about-contact-row">
              <span className="about-contact-icon"><IconPhone /></span>
              <a href="tel:+254748255466">0748 255 466</a>
            </div>
            <div className="about-contact-row">
              <span className="about-contact-icon"><IconGlobe /></span>
              <a href="https://haven.ellines.co.ke" target="_blank" rel="noopener noreferrer">haven.ellines.co.ke</a>
            </div>
            <div className="about-contact-row">
              <span className="about-contact-icon"><IconMap /></span>
              <span>Nairobi, Kenya</span>
            </div>
            <Link to="/contact" className="about-offer-aside__link">
              Contact form <IconArrow />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Ellines Group ── */}
      <section className="section about-group-section">
        <div className="container">
          <div className="about-section-title about-rise">
            <h2>{EA('groupHeading', 'span', 'gold-text')}</h2>
            {EA('groupIntro', 'p', 'about-section-sub', undefined, true)}
          </div>
          <div className="about-group-grid">
            {content.groupCompanies.map((co, i) => {
              const GroupIcon = GROUP_ICONS[i % GROUP_ICONS.length];
              return (
                <div key={i} className={`about-group-card${co.highlight ? ' highlight' : ''}`}>
                  <div className="about-mark" aria-hidden="true"><GroupIcon /></div>
                  <div className="about-group-body">
                    <span className="about-group-tag">{co.tag}</span>
                    {isSA
                      ? <EditableText value={co.name} onSave={v => patchArray('groupCompanies', i, 'name', v)} tag="h3" />
                      : <h3>{co.name}</h3>
                    }
                    {isSA
                      ? <EditableText value={co.desc} onSave={v => patchArray('groupCompanies', i, 'desc', v)} tag="p" multiline />
                      : <p>{co.desc}</p>
                    }
                    {co.link.startsWith('/') ? (
                      <Link to={co.link} className="about-group-link">{co.linkLabel} <IconArrow /></Link>
                    ) : (
                      <a href={co.link} target="_blank" rel="noopener noreferrer" className="about-group-link">{co.linkLabel} <IconArrow /></a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Our Promise ── */}
      <section className="section about-promise-section">
        <div className="container">
          <div className="about-promise-inner about-rise">
            <div className="about-promise-text">
              <h2>{EA('promiseHeading', 'span', 'gold-text')}</h2>
              {EA('promisePara1', 'p', undefined, undefined, true)}
              {EA('promisePara2', 'p', undefined, undefined, true)}
            </div>
            <div className="about-promise-quote">
              <div className="about-promise-quote-mark" aria-hidden="true">"</div>
              {EA('promiseQuote', 'p', undefined, undefined, true)}
              <div className="about-promise-attribution">— Elijah Mwangi M, Founder</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Founder teaser ── */}
      <section className="section about-founder-teaser">
        <div className="container">
          <div className="about-founder-strip about-rise">
            <div className="about-founder-photo-wrap">
              {isSA ? (
                <EditableImage
                  field="founderPhoto"
                  src={content.founderPhoto || '/mwangi.png'}
                  alt="Elijah Mwangi M — Founder"
                  className="about-founder-photo"
                  storageFolder="site-images"
                  onUpload={url => patch('founderPhoto', url)}
                />
              ) : (
                <picture>
                  <source
                    srcSet={(content.founderPhoto || '/mwangi.png').replace(/\.png$/i, '.webp')}
                    type="image/webp"
                  />
                  <img
                    src={content.founderPhoto || '/mwangi.png'}
                    alt="Elijah Mwangi M — Founder"
                    className="about-founder-photo"
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              )}
            </div>
            <div className="about-founder-text">
              <span className="about-founder-label">The Founder</span>
              <h2>Elijah <span className="gold-text">Mwangi M</span></h2>
              {EA('founderTeaser', 'p', undefined, undefined, true)}
              <Link to="/founder" className="btn btn-primary about-cta about-cta--sm">
                Meet the Founder
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="section about-close-section">
        <div className="container">
          <div className="about-close about-rise">
            <div className="about-close__glow" aria-hidden="true" />
            <p className="about-close__brand">Ellines Haven</p>
            <h2>Ready to find your next story?</h2>
            <p className="about-close__sub">
              Browse the library, meet the founder, or reach the team in Nairobi — we are here for African literature.
            </p>
            <div className="about-close__actions">
              <Link to="/library" className="btn btn-primary">Explore the Library</Link>
              <Link to="/founder" className="btn btn-outline">Meet the Founder</Link>
              <Link to="/contact" className="about-close__ghost">Contact Us</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
