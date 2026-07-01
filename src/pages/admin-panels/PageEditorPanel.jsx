import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

/* ─── Per-page default field schemas ─────────────────────────────────────── */
const PAGE_DEFAULTS = {
  home_content: {
    eyebrow:          "Kenya's Premier Literary Platform",
    hero_tagline_1:   'Where Stories Find Their Home',
    hero_tagline_2:   'From the Heart of Kenya',
    hero_tagline_3:   'Real Lives. Real Drama. Real Stories.',
    hero_tagline_4:   'Original Fiction by Elijah Mwangi M',
    hero_sub:         'Original novels and short stories by Elijah Mwangi M — drawn from real lives, real heartbreaks, and the soul of East Africa. Buy once. Read forever.',
    hero_btn_primary: 'Browse Books →',
    hero_btn_secondary: 'Our Story',
    stat_books:       '50+',
    stat_readers:     '2k+',
    stat_rating:      '4.8★',
    trust_payment:    'M-Pesa & Airtel',
    trust_download:   'Download Forever',
    trust_read:       'Read Online',
    trust_secure:     'Secure & Safe',
    coming_soon_heading: 'Coming Soon',
    coming_soon_sub:  'Upcoming novels & stories — get notified on launch day',
    new_releases_heading: 'New Releases',
    new_releases_sub: 'The latest from Elijah Mwangi M',
    featured_heading: 'Featured Novels & Books',
    featured_sub:     'Original works inspired by true stories',
    author_badge:     'Author Spotlight',
    author_name:      'Elijah Mwangi M',
    author_bio:       'From the golden savannahs of the Maasai Mara to the misty highlands of Mount Kenya — his stories are drawn from the full breath of this country.',
    author_quote:     '"Stories that stay with you long after the last page."',
    genres_heading:   'Browse by Genre',
    genres_sub:       'Find the story that speaks to you',
    why_heading:      'Why Ellines Haven?',
    why_sub:          'More than a bookstore — a literary experience',
    testimonials_heading: 'What Readers Say',
    testimonials_sub: 'Voices from our community',
    cta_heading:      'Ready to Start Reading?',
    cta_sub:          "Join thousands of readers discovering Kenya's finest stories.",
    cta_btn_primary:  'Create Free Account',
    cta_btn_secondary:'Browse First',
  },
  about_content: {
    heroTagline:      'A home for original African literature — built in Kenya, for the world.',
    storyHeading:     'Our Story',
    storyPara1:       'Ellines Haven was born from a simple but powerful belief: that Kenyan and East African stories deserve a dedicated, beautiful, and permanent home.',
    storyPara2:       'Every book on this platform is crafted with care and honesty, drawing from the rich tapestry of Kenyan life.',
    storyPara3:       'Ellines Haven is not just a bookstore. It is a literary sanctuary.',
    whyHeading:       'Why Africa Needs This',
    whySub:           'The African literary space is vast — but the platforms that celebrate it are few.',
    missionHeading:   'Our Mission',
    missionText:      'To create a world-class digital home where original African stories can be discovered, purchased, and read beautifully.',
    visionHeading:    'Our Vision',
    visionText:       'A continent where every African reader can find themselves in a story.',
    valuesHeading:    'What We Stand For',
    offerHeading:     'What We Offer',
    experienceHeading:'The Ellines Haven Experience',
    experienceSub:    'More than a store — a complete literary journey from discovery to the last page.',
    groupHeading:     'The Ellines Group',
    groupIntro:       'Ellines Haven is the literary heart of the Ellines Group — a family of businesses founded by Elijah Mwangi M.',
    founderTeaser:    'Ellines Haven was created by Elijah Mwangi M — a Kenyan software engineer, AI developer, and author.',
    statsHeading:     'Ellines Haven by the Numbers',
    promiseHeading:   'Our Promise to Readers',
    promisePara1:     'Every book you find on Ellines Haven has been written with full commitment.',
    promisePara2:     'We promise honest pricing, instant delivery, and stories that treat you as someone who deserves complexity.',
    promiseQuote:     '"We are not building a bookstore. We are building a legacy — one story at a time."',
  },
  founder_content: {
    heroTitle:        'Elijah Mwangi M',
    heroSub:          'Visionary founder of the Ellines Group — spanning technology, literature, and craftsmanship across Kenya.',
    storyHeading:     'The Story',
    storySub:         'A journey of technology, creativity, and purpose',
    storyPara:        'Elijah Mwangi M is the founder of the Ellines Group — a family of businesses built on the belief that Kenya deserves world-class everything.',
    storyQuote:       '"Technology should empower everyone — not just the privileged few."',
    writerHeading:    "The Writer's Soul",
    writerSub:        'Stories born from real life, real people, and real wonder',
    writerPara:       'Long before Elijah wrote a line of code, he wrote stories.',
    booksHeading:     'Published Works',
    booksSub:         'Every novel and story written by Elijah Mwangi M — all inspired by true stories.',
    journeyHeading:   'The Journey',
    journeySub:       'From blank notebooks to built platforms.',
    skillsHeading:    'Areas of Expertise',
    skillsSub:        'A multidisciplinary builder across technology and the arts.',
    worksHeading:     'The Ellines Group',
    worksSub:         'Three ventures, one vision — built from the ground up in Kenya.',
    ctaHeading:       'Work with Elijah',
    ctaSub:           'Whether you need a custom software solution, AI integration, or want to collaborate — reach out.',
  },
  contact_content: {
    page_title:       'Get in Touch',
    page_sub:         "We'd love to hear from you",
    faq_nudge:        'Have a quick question? Check our FAQ page.',
    details_heading:  'Contact Details',
    details_sub:      'Reach out with any questions, feedback, or partnership inquiries.',
    wa_label:         'Chat on WhatsApp',
    wa_sub:           '0748 255 466 — We reply fast',
    phone:            '0748 255 466',
    email:            'ellines.haven@gmail.com',
    location:         'Nairobi, Kenya',
    response_wa:      'Usually within 1 hour',
    response_email:   'Within 24 hours',
    response_phone:   'Mon–Sat, 8am–8pm EAT',
    form_heading:     'Send a Message',
    form_btn:         'Send via WhatsApp',
    sent_heading:     'Message Sent via WhatsApp!',
    sent_sub:         "Your message has been forwarded to our WhatsApp. We'll reply shortly.",
  },
  library_content: {
    hero_badge:       'Complete Collection',
    hero_heading:     'The Library',
    hero_sub:         'Every novel & short story by Elijah Mwangi M — original fiction drawn from real East African life.',
    search_placeholder: 'Search by title, genre or author…',
    empty_heading:    'No books found',
    empty_sub:        'Try adjusting your filters or search term.',
  },
  cart_content: {
    cart_heading:     'Your Cart',
    empty_heading:    'Your cart is empty',
    empty_sub:        'Add some books to get started.',
    checkout_heading: 'Checkout',
    pay_heading:      'Choose Payment Method',
    summary_heading:  'Order Summary',
    pending_heading:  'Payment Submitted',
    pending_sub:      'Your order is pending confirmation.',
    pending_note:     'Once our team verifies your payment, your books will be unlocked automatically.',
    trust_line1:      'Your books unlock after payment is verified',
    trust_line2:      'Usually within minutes during business hours',
    wa_btn:           'Order via WhatsApp instead',
    confirm_wa_btn:   'Confirm via WhatsApp',
  },
  login_content: {
    heading:          'Welcome Back',
    sub:              'Sign in to access your library',
    forgot_label:     'Forgot password?',
    btn:              'Sign In',
    no_account:       'No account?',
    create_link:      'Create one',
  },
  register_content: {
    heading:          'Create Account',
    sub:              'Join our community of readers',
    btn:              'Create Account',
    already_have:     'Already have an account?',
    sign_in_link:     'Sign in',
    closed_heading:   'Registrations Closed',
    closed_sub:       'New account creation is currently disabled. Please check back later.',
  },
};

const PAGES = [
  { key: 'home_content',     label: 'Home',      path: '/',         icon: '🏠' },
  { key: 'about_content',    label: 'About Us',  path: '/about',    icon: 'ℹ️' },
  { key: 'founder_content',  label: 'Founder',   path: '/founder',  icon: '👤' },
  { key: 'contact_content',  label: 'Contact',   path: '/contact',  icon: '📞' },
  { key: 'library_content',  label: 'Library',   path: '/library',  icon: '📚' },
  { key: 'cart_content',     label: 'Cart',       path: '/cart',     icon: '🛒' },
  { key: 'login_content',    label: 'Sign In',   path: '/login',    icon: '🔑' },
  { key: 'register_content', label: 'Register',  path: '/register', icon: '📝' },
];

/* ─── Nice label mapping for field keys ──────────────────────────────────── */
function labelFor(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function PageEditorPanel({ showToast }) {
  const [activePage,  setActivePage]  = useState(PAGES[0]);
  const [pageData,    setPageData]    = useState({});
  const [loaded,      setLoaded]      = useState({});
  const [editKey,     setEditKey]     = useState(null);
  const [editVal,     setEditVal]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [sideOpen,    setSideOpen]    = useState(true);
  const [iframeKey,   setIframeKey]   = useState(0);
  const [iframeErr,   setIframeErr]   = useState(false);
  const [search,      setSearch]      = useState('');
  const iframeRef = useRef(null);

  /* Merge Firestore data on top of defaults so fields always show */
  const defaults  = PAGE_DEFAULTS[activePage.key] || {};
  const saved     = pageData[activePage.key] || {};
  const current   = { ...defaults, ...saved };
  const allKeys   = Object.keys(current).filter(k => k !== 'updatedAt');
  const filtered  = search
    ? allKeys.filter(k => k.toLowerCase().includes(search.toLowerCase()) || String(current[k]).toLowerCase().includes(search.toLowerCase()))
    : allKeys;

  useEffect(() => {
    if (loaded[activePage.key]) return;
    getDoc(doc(db, 'site_data', activePage.key)).then(snap => {
      setPageData(prev => ({ ...prev, [activePage.key]: snap.exists() ? snap.data() : {} }));
      setLoaded(prev => ({ ...prev, [activePage.key]: true }));
    }).catch(() => {
      setPageData(prev => ({ ...prev, [activePage.key]: {} }));
      setLoaded(prev => ({ ...prev, [activePage.key]: true }));
    });
  }, [activePage.key]); // eslint-disable-line

  const updateField = (k, v) => {
    setPageData(prev => ({
      ...prev,
      [activePage.key]: { ...(prev[activePage.key] || {}), [k]: v },
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'site_data', activePage.key),
        { ...current, updatedAt: serverTimestamp() },
        { merge: true }
      );
      showToast?.('✅ ' + activePage.label + ' saved — changes live!');
      setIframeKey(k => k + 1);
    } catch (e) {
      showToast?.('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const origin = window.location.origin;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 70px)', overflow:'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 18px', background:'var(--surface)', borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap' }}>
        <h2 style={{ fontSize:'1rem', margin:0 }}>Page Editor</h2>
        <span style={{ fontSize:'0.72rem', background:'rgba(201,168,76,0.15)', color:'var(--gold)', padding:'2px 8px', borderRadius:4 }}>Live Preview</span>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', flex:1, marginLeft:8 }}>
          {PAGES.map(p => (
            <button key={p.key}
              onClick={() => { setActivePage(p); setEditKey(null); setIframeErr(false); setSearch(''); }}
              style={{
                padding:'5px 12px', border:'none', borderRadius:6, cursor:'pointer', fontSize:'0.78rem', fontWeight:600, fontFamily:'inherit',
                background: activePage.key === p.key ? 'var(--gold)' : 'rgba(255,255,255,0.07)',
                color: activePage.key === p.key ? '#000' : 'var(--muted)',
                transition:'all 0.15s',
              }}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginLeft:'auto' }}>
          <button onClick={() => setIframeKey(k => k + 1)}
            style={{ background:'rgba(255,255,255,0.07)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit' }}>
            ↺ Refresh
          </button>
          <a href={origin + activePage.path} target="_blank" rel="noopener noreferrer"
            style={{ background:'rgba(255,255,255,0.07)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit', textDecoration:'none' }}>
            ↗ Open
          </a>
          <button onClick={() => setSideOpen(o => !o)}
            style={{ background:'rgba(255,255,255,0.07)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:'0.8rem', fontFamily:'inherit' }}>
            {sideOpen ? '⟩ Hide Panel' : '⟨ Show Panel'}
          </button>
          <button onClick={saveAll} disabled={saving}
            style={{ background:'var(--gold)', border:'none', color:'#000', borderRadius:6, padding:'7px 18px', cursor:'pointer', fontWeight:700, fontSize:'0.82rem', fontFamily:'inherit', opacity:saving?0.7:1 }}>
            {saving ? '⏳…' : '💾 Save & Publish'}
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Live iframe */}
        <div style={{ flex:1, position:'relative', background:'#111', overflow:'hidden' }}>
          {iframeErr ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:14, padding:24, textAlign:'center' }}>
              <div style={{ fontSize:'2.5rem' }}>🔗</div>
              <p style={{ color:'var(--muted)', fontSize:'0.88rem', lineHeight:1.6, maxWidth:340 }}>
                Live preview blocked by browser security.<br />Open the page directly to see it.
              </p>
              <a href={origin + activePage.path} target="_blank" rel="noopener noreferrer"
                style={{ background:'var(--gold)', color:'#000', borderRadius:7, padding:'8px 20px', fontWeight:700, fontSize:'0.85rem', textDecoration:'none' }}>
                ↗ Open {activePage.label} in New Tab
              </a>
            </div>
          ) : (
            <iframe key={iframeKey} ref={iframeRef} src={origin + activePage.path}
              title={activePage.label + ' preview'}
              style={{ width:'100%', height:'100%', border:'none', display:'block' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onError={() => setIframeErr(true)} />
          )}
          <div style={{ position:'absolute', bottom:12, left:12, background:'rgba(0,0,0,0.7)', color:'var(--gold)', fontSize:'0.72rem', fontWeight:700, padding:'4px 10px', borderRadius:6, pointerEvents:'none', letterSpacing:1 }}>
            LIVE PREVIEW — {activePage.label.toUpperCase()}
          </div>
        </div>

        {/* Edit sidebar */}
        {sideOpen && (
          <div style={{ width:380, flexShrink:0, borderLeft:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Sidebar header */}
            <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <div style={{ fontWeight:700, fontSize:'0.9rem', marginBottom:4 }}>
                {activePage.icon} {activePage.label} — <span style={{ color:'var(--gold)', fontWeight:400, fontSize:'0.8rem' }}>{filtered.length} fields</span>
              </div>
              <p style={{ fontSize:'0.74rem', color:'var(--muted)', margin:'0 0 8px', lineHeight:1.5 }}>
                Edit any field below. Hit Save & Publish to push changes live instantly.
              </p>
              {/* Search */}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search fields…"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:5, padding:'5px 9px', color:'var(--text)', fontSize:'0.78rem', outline:'none', boxSizing:'border-box' }}
              />
            </div>

            {/* Field list */}
            <div style={{ flex:1, overflowY:'auto', padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
              {!loaded[activePage.key] && (
                <p style={{ color:'var(--muted)', fontSize:'0.82rem', textAlign:'center', padding:'20px 0' }}>Loading…</p>
              )}
              {loaded[activePage.key] && filtered.map(k => {
                const v = current[k];
                const isEditing = editKey === k;
                const isLong = String(v).length > 80;
                return (
                  <div key={k} style={{ background:'var(--card)', border:`1px solid ${isEditing ? 'rgba(201,168,76,0.5)' : 'var(--border)'}`, borderRadius:8, overflow:'hidden', transition:'border-color 0.2s' }}>
                    {/* Field header */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', borderBottom:'1px solid rgba(255,255,255,0.04)', background:'rgba(255,255,255,0.02)' }}>
                      <div>
                        <div style={{ fontSize:'0.76rem', fontWeight:600, color:'var(--text)' }}>{labelFor(k)}</div>
                        <code style={{ fontSize:'0.64rem', color:'rgba(201,168,76,0.6)' }}>{k}</code>
                      </div>
                      <button onClick={() => { setEditKey(isEditing ? null : k); setEditVal(String(v ?? '')); }}
                        style={{ background:isEditing?'rgba(201,168,76,0.2)':'rgba(255,255,255,0.06)', border:'none', color:isEditing?'var(--gold)':'var(--muted)', borderRadius:4, padding:'3px 10px', cursor:'pointer', fontSize:'0.72rem', fontFamily:'inherit', flexShrink:0 }}>
                        {isEditing ? '▲ Close' : '✏️ Edit'}
                      </button>
                    </div>

                    {/* Field body */}
                    <div style={{ padding:'8px 10px' }}>
                      {isEditing ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {isLong ? (
                            <textarea value={editVal} onChange={e => setEditVal(e.target.value)} rows={5} autoFocus
                              style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(201,168,76,0.4)', borderRadius:5, color:'var(--text)', padding:'7px 9px', fontSize:'0.82rem', resize:'vertical', outline:'none', fontFamily:'inherit', lineHeight:1.6, boxSizing:'border-box' }} />
                          ) : (
                            <input value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus
                              style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(201,168,76,0.4)', borderRadius:5, color:'var(--text)', padding:'7px 9px', fontSize:'0.82rem', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }} />
                          )}
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={() => { updateField(k, editVal); setEditKey(null); }}
                              style={{ background:'var(--gold)', border:'none', color:'#000', borderRadius:5, padding:'5px 14px', cursor:'pointer', fontWeight:700, fontSize:'0.78rem', fontFamily:'inherit' }}>✓ Done</button>
                            <button onClick={() => setEditKey(null)}
                              style={{ background:'rgba(255,255,255,0.07)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:5, padding:'5px 10px', cursor:'pointer', fontSize:'0.78rem', fontFamily:'inherit' }}>Cancel</button>
                            <button onClick={() => { updateField(k, defaults[k] ?? ''); setEditKey(null); }}
                              title="Reset to default" style={{ background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.2)', color:'#e74c3c', borderRadius:5, padding:'5px 8px', cursor:'pointer', fontSize:'0.72rem', fontFamily:'inherit', marginLeft:'auto' }}>↩ Reset</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize:'0.8rem', color:'var(--text)', margin:0, lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word', opacity:v?1:0.35, cursor:'pointer' }}
                          onClick={() => { setEditKey(k); setEditVal(String(v ?? '')); }}>
                          {v ? String(v).slice(0,180) + (String(v).length > 180 ? '…' : '') : <em>Click to set value…</em>}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sidebar save */}
            <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
              <button onClick={saveAll} disabled={saving}
                style={{ width:'100%', background:'var(--gold)', border:'none', color:'#000', borderRadius:7, padding:'10px', cursor:'pointer', fontWeight:700, fontSize:'0.88rem', fontFamily:'inherit', opacity:saving?0.7:1 }}>
                {saving ? '⏳ Saving…' : '💾 Save & Publish Changes'}
              </button>
              <p style={{ fontSize:'0.7rem', color:'var(--muted)', textAlign:'center', margin:'6px 0 0', lineHeight:1.4 }}>
                Saved to Firestore — appears live instantly
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
