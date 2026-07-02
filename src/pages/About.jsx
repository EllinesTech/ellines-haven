import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import EditableImage from '../components/EditableImage';
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
    { icon: '📖', title: 'Stories Locked Away', desc: 'Brilliant African writers exist across every village, city, and campus on this continent — but their stories rarely reach the people they were written for. We change that.' },
    { icon: '💸', title: 'Priced Out of Books', desc: 'Imported books are expensive. Shipping is unreliable. Ellines Haven delivers world-class stories at honest, locally-calibrated prices — instantly, anywhere.' },
    { icon: '🌍', title: 'Representation Matters', desc: 'African readers deserve to see themselves in fiction. Not as spectacle, not as tragedy — but as full, complex human beings navigating the same beautiful, messy life everyone else does.' },
    { icon: '🛠️', title: 'Built by an African', desc: 'This platform was not donated, commissioned, or approved by a foreign publisher. It was conceived, engineered, and launched by a Kenyan — for Kenya and the continent.' },
  ],

  /* Mission & Vision */
  missionHeading: 'Our Mission',
  missionText: 'To create a world-class digital home where original African stories can be discovered, purchased, and read beautifully — and where authors who tell real, honest, local stories are celebrated on their own terms.',
  visionHeading: 'Our Vision',
  visionText: 'A continent where every African reader can find themselves in a story, and where East African literature takes its rightful place at the global table of great literature.',

  /* Values */
  valuesHeading: 'What We Stand For',
  values: [
    { icon: '✦', title: 'Authenticity', desc: 'Every story is grounded in real life — real people, real places, real emotions. No borrowed narratives, no distant voices.' },
    { icon: '🌍', title: 'African Pride', desc: 'We celebrate the richness of East African culture, history, and humanity without apology and without explanation.' },
    { icon: '📖', title: 'Accessibility', desc: 'Great literature should not be locked behind geography or high prices. Every story on Ellines Haven is priced for the people it was written about.' },
    { icon: '🛡️', title: 'Quality', desc: 'Every work published here meets a standard of craft and honesty. Stories that are worth your time, every time.' },
    { icon: '💡', title: 'Innovation', desc: 'Built by a software engineer and author, Ellines Haven blends the best of technology with the soul of literature.' },
    { icon: '🤝', title: 'Community', desc: 'We exist for readers and writers alike — building a community that uplifts African voices and creates space for new stories to emerge.' },
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
    { step: '01', icon: '🔍', title: 'Discover', desc: 'Browse our curated library by genre, theme, or mood. Every book comes with a full synopsis, excerpt, and reader reviews.' },
    { step: '02', icon: '💳', title: 'Purchase', desc: 'Pay instantly with M-Pesa, Airtel Money, or card. No hidden fees. Your book is unlocked the moment payment clears.' },
    { step: '03', icon: '📱', title: 'Read', desc: 'Open in our beautiful built-in reader — works on any device, no app needed. Or download your PDF for offline reading.' },
    { step: '04', icon: '♾️', title: 'Own Forever', desc: 'No subscriptions. No expiry. Once you buy a book, it lives in your library permanently. Yours to return to whenever you want.' },
  ],

  /* Ellines Group */
  groupHeading: 'The Ellines Group',
  groupIntro: 'Ellines Haven is the literary heart of the Ellines Group — a family of businesses founded by Elijah Mwangi M, all built on one shared belief: that Kenya deserves world-class everything. The Ellines name carries a promise of quality, purpose, and pride in every venture it covers.',
  groupCompanies: [
    {
      icon: '📚',
      name: 'Ellines Haven',
      tag: 'Literature · You Are Here',
      desc: 'A dedicated digital home for original African literature. Every novel and story is written by Elijah Mwangi M — honest, local, and deeply human. A place where authentic East African stories find a beautiful home and reach the readers who deserve them.',
      link: '/',
      linkLabel: 'Explore Ellines Haven',
      highlight: true,
    },
    {
      icon: '⚡',
      name: 'Ellines Tech',
      tag: 'Technology',
      desc: 'A full-service IT company delivering software development, AI integrations, cybersecurity, web and mobile applications, and managed IT support to businesses across Kenya and East Africa. The digital infrastructure that African business deserves.',
      link: 'https://ellinestech.co.ke',
      linkLabel: 'ellinestech.co.ke',
      highlight: false,
    },
    {
      icon: '🪑',
      name: 'Ellines Rattan Furniture',
      tag: 'Craft & Living',
      desc: 'Premium quality rattan and cane furniture, handcrafted with care and traditional weaving techniques for Kenyan homes and offices. Beautiful living spaces at honest prices.',
      link: 'https://ellinestech.co.ke',
      linkLabel: 'Contact for orders',
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
      {value}<span className="sa-edit-hint">✏️</span>
    </Tag>
  );
}

/* ── Decorative poster card ── */
function AboutPoster() {
  return (
    <div className="about-poster-card">
      <div className="apc-orb apc-orb1" aria-hidden="true" />
      <div className="apc-orb apc-orb2" aria-hidden="true" />
      <div className="apc-orb apc-orb3" aria-hidden="true" />
      <span className="apc-tag">Est. Kenya</span>
      <div className="apc-logo-wrap">
        <img src="/logo-icon.png" alt="Ellines Haven logo mark" className="apc-logo-img" />
        <div className="apc-logo-glow" aria-hidden="true" />
      </div>
      <div className="apc-brand">
        <span className="apc-brand-main">Ellines</span>
        <span className="apc-brand-sub">Haven</span>
      </div>
      <p className="apc-tagline">Stories That Resonate</p>
      <div className="apc-divider" aria-hidden="true" />
      <div className="apc-pillars">
        {['Original Stories', 'African Voices', 'Digital Library'].map(p => (
          <span key={p} className="apc-pill">{p}</span>
        ))}
      </div>
      <span className="apc-watermark">haven.ellines.co.ke</span>
    </div>
  );
}

export default function About() {
  const { user } = useApp();
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
    <main>
      {(toast || saving) && (
        <div className="sa-toast">{saving ? '⏳ Saving…' : toast}</div>
      )}

      {/* ── Header ── */}
      <div className="page-header">
        <div className="container">
          <h1>About <span className="gold-text">Ellines Haven</span></h1>
          {EA('heroTagline', 'p', undefined, undefined, false)}
        </div>
      </div>

      {/* ── Story + poster ── */}
      <section className="section">
        <div className="container about-grid">
          <div className="about-img">
            <AboutPoster />
          </div>
          <div className="about-copy">
            <h2>{EA('storyHeading', 'span', 'gold-text')}</h2>
            {EA('storyPara1', 'p', undefined, undefined, true)}
            {EA('storyPara2', 'p', undefined, undefined, true)}
            {EA('storyPara3', 'p', undefined, { fontStyle:'italic', borderLeft:'4px solid var(--gold)', paddingLeft:'16px', color:'var(--text)', opacity:0.9 }, true)}
            <Link to="/library" className="btn btn-primary" style={{ marginTop:'28px' }}>Browse Our Books →</Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="section about-stats-sec">
        <div className="container">
          <div className="about-stats">
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
          <div className="about-section-title">
            <h2>{EA('whyHeading', 'span', 'gold-text')}</h2>
            {EA('whySub', 'p', 'about-section-sub', undefined, true)}
          </div>
          <div className="about-why-grid">
            {content.whyPoints.map((p, i) => (
              <div key={i} className="about-why-card">
                <div className="about-why-icon">{p.icon}</div>
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
            ))}
          </div>
        </div>
      </section>

      {/* ── Mission & Vision ── */}
      <section className="section about-mv-section">
        <div className="container">
          <div className="about-mv-grid">
            <div className="about-mv-card">
              <div className="about-mv-icon">🎯</div>
              <h3>{EA('missionHeading', 'span')}</h3>
              {EA('missionText', 'p', undefined, undefined, true)}
            </div>
            <div className="about-mv-card">
              <div className="about-mv-icon">🌟</div>
              <h3>{EA('visionHeading', 'span')}</h3>
              {EA('visionText', 'p', undefined, undefined, true)}
            </div>
          </div>
        </div>
      </section>

      {/* ── What We Stand For ── */}
      <section className="section about-values-section">
        <div className="container">
          <div className="about-section-title">
            <h2>{EA('valuesHeading', 'span', 'gold-text')}</h2>
          </div>
          <div className="about-values-grid">
            {content.values.map((v, i) => (
              <div key={i} className="about-value-card">
                <div className="about-value-icon">{v.icon}</div>
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
            ))}
          </div>
        </div>
      </section>

      {/* ── The Experience ── */}
      <section className="section about-experience-section">
        <div className="container">
          <div className="about-section-title">
            <h2>{EA('experienceHeading', 'span', 'gold-text')}</h2>
            {EA('experienceSub', 'p', 'about-section-sub', undefined, true)}
          </div>
          <div className="about-experience-grid">
            {content.experiences.map((e, i) => (
              <div key={i} className="about-experience-card">
                <div className="about-exp-step">{e.step}</div>
                <div className="about-exp-icon">{e.icon}</div>
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
        <div className="container about-offer-grid">
          <div className="about-offer-text">
            <h2>{EA('offerHeading', 'span', 'gold-text')}</h2>
            <ul className="about-list" style={{ marginTop:'20px' }}>
              {content.offers.map((item, i) => (
                <li key={i}>
                  <span className="about-check">✓</span>
                  {isSA
                    ? <EditableText value={item} onSave={val => { const arr = [...content.offers]; arr[i] = val; patch('offers', arr); }} tag="span" />
                    : item
                  }
                </li>
              ))}
            </ul>
            <Link to="/library" className="btn btn-primary" style={{ marginTop:'28px' }}>Start Reading →</Link>
          </div>
          <div className="about-offer-aside">
            <div className="about-offer-card">
              <h4>📞 Get in Touch</h4>
              <div className="about-contact-row"><span>📧</span><a href="mailto:ellines.haven@gmail.com">ellines.haven@gmail.com</a></div>
              <div className="about-contact-row"><span>📱</span><a href="tel:+254748255466">0748 255 466</a></div>
              <div className="about-contact-row"><span>🌐</span><a href="https://haven.ellines.co.ke" target="_blank" rel="noopener noreferrer">haven.ellines.co.ke</a></div>
              <div className="about-contact-row"><span>📍</span><span>Nairobi, Kenya</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ellines Group ── */}
      <section className="section about-group-section">
        <div className="container">
          <div className="about-section-title">
            <h2>{EA('groupHeading', 'span', 'gold-text')}</h2>
            {EA('groupIntro', 'p', 'about-section-sub', undefined, true)}
          </div>
          <div className="about-group-grid">
            {content.groupCompanies.map((co, i) => (
              <div key={i} className={`about-group-card${co.highlight ? ' highlight' : ''}`}>
                <div className="about-group-icon">{co.icon}</div>
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
                    <Link to={co.link} className="about-group-link">{co.linkLabel} <span>→</span></Link>
                  ) : (
                    <a href={co.link} target="_blank" rel="noopener noreferrer" className="about-group-link">{co.linkLabel} <span>→</span></a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Promise ── */}
      <section className="section about-promise-section">
        <div className="container">
          <div className="about-promise-inner">
            <div className="about-promise-text">
              <h2>{EA('promiseHeading', 'span', 'gold-text')}</h2>
              {EA('promisePara1', 'p', undefined, undefined, true)}
              {EA('promisePara2', 'p', undefined, undefined, true)}
            </div>
            <div className="about-promise-quote">
              <div className="about-promise-quote-mark">"</div>
              {EA('promiseQuote', 'p', undefined, undefined, true)}
              <div className="about-promise-attribution">— Elijah Mwangi M, Founder</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Founder teaser ── */}
      <section className="section about-founder-teaser">
        <div className="container">
          <div className="about-founder-strip">
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
                <img src={content.founderPhoto || '/mwangi.png'} alt="Elijah Mwangi M — Founder" className="about-founder-photo" />
              )}
            </div>
            <div className="about-founder-text">
              <span className="about-founder-label">✦ The Founder</span>
              <h2>Elijah <span className="gold-text">Mwangi M</span></h2>
              {EA('founderTeaser', 'p', undefined, undefined, true)}
              <Link to="/founder" className="btn btn-primary" style={{ marginTop:'20px' }}>
                Meet the Founder →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
