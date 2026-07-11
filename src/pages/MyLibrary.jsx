import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, callVerifyPaystack } from '../firebase';
import { getAllReadingStats, hydrateReadingStats } from '../hooks/useReadingProgress';
import { isBookSavedOffline, saveBookOffline, removeOfflineBook } from '../hooks/useOfflineBook';
import { bookPath, readPath } from '../utils/slugify';
import { getFallbackChapters } from '../data/bookChapters';
import { usePageMeta } from '../hooks/usePageMeta';
import ReferralDashboard from '../components/ReferralDashboard';
import './MyLibrary.css';

// Helper: get a map of bookId -> progress for current user
function useReadingProgressMap(userEmail) {
  const [progressMap, setProgressMap] = useState({});
  useEffect(() => {
    setProgressMap(getAllReadingStats(userEmail));
  }, [userEmail]);
  return progressMap;
}

const WA_NUMBER = '254748255466';

function toDownloadUrl(url) {
  if (!url) return '#';
  try {
    if (url.includes('uc?export=download')) return url;
    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
  } catch (e) { /* ignore malformed URL */ void e; }
  return url;
}

const STATUS_META = {
  complete:      { label:'Complete',      icon:'',   color:'#2ecc71', bg:'rgba(46,204,113,0.12)'  },
  ongoing:       { label:'Ongoing',       icon:'',   color:'#4a9eff', bg:'rgba(74,158,255,0.12)'  },
  premium:       { label:'Premium',       icon:'',   color:'#c9a84c', bg:'rgba(201,168,76,0.12)'  },
  'free-preview':{ label:'Free Preview',  icon:'',   color:'#a855f7', bg:'rgba(168,85,247,0.12)'  },
  'coming-soon': { label:'Coming Soon',   icon:'',   color:'#e8832a', bg:'rgba(232,131,42,0.12)'  },
  limited:       { label:'Limited',       icon:'',   color:'#e74c3c', bg:'rgba(231,76,60,0.12)'   },
  draft:         { label:'Draft',         icon:'',   color:'#64748b', bg:'rgba(100,116,139,0.12)' },
};

// -- Reading Stats Panel -----------------------------------------------------
function ReadingStats({ user, library, catalog, orders }) {
  const stats = getAllReadingStats(user.email);
  const booksStarted   = Object.keys(stats).length;
  const booksCompleted = library.length;
  const totalOrders    = orders.length;
  const totalSpent     = orders.filter(o => o.status === 'Completed').reduce((s,o) => s + (o.total||0), 0);

  // Reading challenge — stored locally
  const challengeKey = `eh_challenge_${user.email.toLowerCase().replace(/[^a-z0-9]/g,'_')}`;
  const [challenge, setChallenge] = useState(() => {
    try { return JSON.parse(localStorage.getItem(challengeKey) || '{"goal":5,"year":' + new Date().getFullYear() + '}'); } catch { return { goal: 5, year: new Date().getFullYear() }; }
  });
  const [editGoal, setEditGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(challenge.goal);

  const saveGoal = () => {
    const g = Math.max(1, Math.min(100, parseInt(goalInput) || 5));
    const next = { ...challenge, goal: g };
    setChallenge(next);
    localStorage.setItem(challengeKey, JSON.stringify(next));
    setEditGoal(false);
  };

  const challengePct = Math.min(100, Math.round((booksCompleted / challenge.goal) * 100));
  const challengeDone = booksCompleted >= challenge.goal;

  // Genres breakdown
  const genreCounts = {};
  library.forEach(lb => {
    const cat = catalog.find(b => b.id === lb.id);
    if (cat?.genre) genreCounts[cat.genre] = (genreCounts[cat.genre] || 0) + 1;
  });
  const topGenres = Object.entries(genreCounts).sort((a,b) => b[1]-a[1]).slice(0, 5);

  // Last read
  const lastReadEntry = Object.entries(stats)
    .sort((a,b) => (b[1].lastRead||0) - (a[1].lastRead||0))[0];
  const lastReadBook  = lastReadEntry ? catalog.find(b => b.id === lastReadEntry[0]) : null;
  const lastReadDate  = lastReadEntry
    ? new Date(lastReadEntry[1].lastRead).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })
    : null;

  // Reading streak — days with reading activity in the last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return d.toLocaleDateString('en-KE');
  });
  const activeDays = new Set(
    Object.values(stats).map(s => s.lastRead ? new Date(s.lastRead).toLocaleDateString('en-KE') : null).filter(Boolean)
  );
  const streakDays = last7Days.filter(d => activeDays.has(d)).length;

  const statCards = [
    { icon:'📚', value: booksCompleted,                      label:'Books Owned'       },
    { icon:'📖', value: booksStarted,                        label:'Books Started'      },
    { icon:'🛒', value: totalOrders,                         label:'Total Orders'       },
    { icon:'💰', value:`KSh ${totalSpent.toLocaleString()}`, label:'Total Spent'        },
    { icon:'📅', value:`${streakDays}/7`,                    label:'Active Days (week)' },
    { icon:'❤',  value: topGenres[0]?.[0] || '—',            label:'Favourite Genre'    },
  ];

  return (
    <div className="mylib-stats">
      <h3 className="mylib-stats-title">Reading Stats</h3>

      {/* -- Reading Challenge -- */}
      <div className="card mylib-challenge">
        <div className="mylib-challenge-header">
          <div>
            <span className="mylib-challenge-label">{challenge.year} Reading Challenge</span>
            <h4>
              {challengeDone
                ? `Goal Complete! ${booksCompleted} of ${challenge.goal} books`
                : `${booksCompleted} of ${challenge.goal} books read`}
            </h4>
          </div>
          {!editGoal ? (
            <button className="btn btn-ghost btn-sm" onClick={() => { setGoalInput(challenge.goal); setEditGoal(true); }}>
              Set Goal
            </button>
          ) : (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <input
                type="number"
                min="1" max="100"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                className="mylib-challenge-input"
                aria-label="Reading goal"
              />
              <button className="btn btn-primary btn-sm" onClick={saveGoal}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditGoal(false)}>Cancel</button>
            </div>
          )}
        </div>
        <div className="mylib-challenge-track">
          <div
            className={'mylib-challenge-fill' + (challengeDone ? ' done' : '')}
            style={{ width: `${challengePct}%` }}
          />
        </div>
        <p className="mylib-challenge-note">
          {challengeDone
            ? `You crushed it! Consider raising your goal for next time.`
            : `${Math.max(0, challenge.goal - booksCompleted)} more book${challenge.goal - booksCompleted !== 1 ? 's' : ''} to reach your ${challenge.year} goal.`}
        </p>
      </div>

      {/* Stat cards */}
      <div className="mylib-stats-grid">
        {statCards.map(s => (
          <div key={s.label} className="card mylib-stat-card">
            <span className="mylib-stat-icon">{s.icon}</span>
            <strong className="mylib-stat-value">{s.value}</strong>
            <span className="mylib-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Last read */}
      {lastReadBook && (
        <div className="card mylib-last-read">
          <span style={{ fontSize:'1.5rem', lineHeight:1 }}>&#9654;</span>
          <div>
            <strong>Last Read</strong>
            <p>{lastReadBook.title} <span style={{ color:'var(--muted)', fontSize:'0.8rem' }}>— {lastReadDate}</span></p>
          </div>
          <Link to={readPath(lastReadBook)} className="btn btn-outline btn-sm" style={{ flexShrink:0 }}>
            Continue &rarr;
          </Link>
        </div>
      )}

      {/* Genre breakdown */}
      {topGenres.length > 0 && (
        <div className="card mylib-genre-chart">
          <h4>Genres in Your Library</h4>
          <div className="mylib-genre-bars">
            {topGenres.map(([genre, count]) => (
              <div key={genre} className="mylib-genre-row">
                <span className="mylib-genre-label">{genre}</span>
                <div className="mylib-genre-track">
                  <div
                    className="mylib-genre-fill"
                    style={{ width:`${Math.round((count / booksCompleted) * 100)}%` }}
                  />
                </div>
                <span className="mylib-genre-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity heatmap — last 7 days */}
      <div className="card mylib-heatmap">
        <h4>Last 7 Days Activity</h4>
        <div className="mylib-heatmap-row">
          {last7Days.reverse().map(d => (
            <div
              key={d}
              className={'mylib-heatmap-day' + (activeDays.has(d) ? ' active' : '')}
              title={d}
            >
              <span>{new Date(d).toLocaleDateString('en-KE', { weekday:'short' }).charAt(0)}</span>
            </div>
          ))}
        </div>
        <p className="mylib-heatmap-note">
          {streakDays > 0 ? `You read on ${streakDays} of the last 7 days. Keep it up!` : 'No reading activity this week. Open a book and start!'}
        </p>
      </div>

      {library.length === 0 && (
        <div className="mylib-empty" style={{ marginTop:24 }}>
          <div className="mylib-empty-icon">&#128218;</div>
          <h3>No reading data yet</h3>
          <p>Purchase and read books to start building your reading history.</p>
          <Link to="/library" className="btn btn-primary">Browse Books</Link>
        </div>
      )}
    </div>
  );
}

// -- Account Settings Panel --------------------------------------------------
function AccountSettings({ user, myPerms }) {
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eh_user_prefs_' + user.email) || '{}'); } catch { return {}; }
  });
  const [pwForm, setPwForm] = useState({ current:'', newPw:'', confirm:'' });
  const [pwMsg,  setPwMsg]  = useState('');
  const [saved,  setSaved]  = useState('');

  const savePrefs = (next) => {
    setPrefs(next);
    localStorage.setItem('eh_user_prefs_' + user.email, JSON.stringify(next));
    setSaved('Preferences saved');
    setTimeout(() => setSaved(''), 2500);
  };
  const toggle = (key, def = true) => savePrefs({ ...prefs, [key]: prefs[key] === undefined ? !def : !prefs[key] });
  const get    = (key, def = true) => prefs[key] === undefined ? def : prefs[key];

  const handlePwChange = async e => {
    e.preventDefault();
    setPwMsg('');
    const emailKey = user.email.toLowerCase();
    const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
    const localOverride = overrides[emailKey];

    // Fetch Firestore password to validate current password properly
    let storedPw = localOverride || '';
    try {
      const { doc: fsDoc, getDoc: fsGet } = await import('firebase/firestore');
      const { db: fsDb } = await import('../firebase');
      const snap = await fsGet(fsDoc(fsDb, 'users', user.id || emailKey.replace(/[^a-z0-9]/g, '_')));
      if (snap.exists()) storedPw = snap.data().passwordHash || localOverride || '';
    } catch {}

    if (storedPw && pwForm.current !== storedPw) { setPwMsg('error:Current password is incorrect'); return; }
    if (pwForm.newPw.length < 4) { setPwMsg('error:New password must be at least 4 characters'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg('error:Passwords do not match'); return; }

    // Write to localStorage override
    overrides[emailKey] = pwForm.newPw;
    localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));

    // Write to Firestore — this is what Login checks first on any device
    try {
      const { doc: fsDoc, setDoc: fsSet, serverTimestamp: fsSvTs } = await import('firebase/firestore');
      const { db: fsDb } = await import('../firebase');
      await fsSet(fsDoc(fsDb, 'users', user.id || emailKey.replace(/[^a-z0-9]/g, '_')),
        { passwordHash: pwForm.newPw, updatedAt: fsSvTs() }, { merge: true });
    } catch {}

    setPwMsg('ok:Password updated successfully');
    setPwForm({ current: '', newPw: '', confirm: '' });
  };

  const isOk      = pwMsg.startsWith('ok:');
  const pwDisplay = pwMsg.replace(/^(ok|error):/, '');

  const preferenceGroups = [
    { label:'Reading Experience', items:[
      { key:'darkReader',      label:'Dark reader background',  desc:'Darker background in the online reader',   def:true  },
      { key:'largeText',       label:'Larger text by default',  desc:'Start reader with bigger font size',       def:false },
      { key:'showProgress',    label:'Show reading progress',   desc:'Display chapter progress indicator',       def:true  },
      { key:'autoNextChapter', label:'Auto-advance chapters',   desc:'Automatically scroll to next chapter',    def:false },
    ]},
    { label:'Notifications', items:[
      { key:'notifyNewBooks',  label:'New book releases',       desc:'Notified when new books are published',    def:true  },
      { key:'notifyOrders',    label:'Order status updates',    desc:'Updates on your payment verification',     def:true  },
      { key:'notifyPromos',    label:'Promotions & discounts',  desc:'Exclusive deals and promo codes',          def:false },
    ]},
    { label:'Privacy', items:[
      { key:'showInLeaders',   label:'Reading leaderboard',     desc:'Let others see your reading activity',     def:true  },
      { key:'publicProfile',   label:'Public profile',          desc:'Allow others to see your collection',      def:false },
    ]},
  ];

  return (
    <div className="mylib-settings">
      {/* Profile card */}
      <div className="mylib-settings-profile card">
        <div className="mylib-settings-avatar">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="mylib-settings-info">
          <h3>{user.name}</h3>
          <span>{user.email}</span>
          <span className="mylib-role-badge">
            {user.role === 'admin' ? 'Admin' : user.role === 'superadmin' ? 'Super Admin' : 'Reader'}
          </span>
        </div>
        <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hi, I need help with my Ellines Haven account: ' + user.email)}`}
          target="_blank" rel="noopener noreferrer"
          className="btn btn-sm mylib-support-btn">
          Support
        </a>
      </div>

      {/* Permission badges */}
      <div className="mylib-perms card">
        <h4>Account Permissions</h4>
        <div className="mylib-perms-list">
          {[
            { key:'canBrowse',     label:'Browse'     },
            { key:'canPurchase',   label:'Purchase'   },
            { key:'canReadOnline', label:'Read Online' },
            { key:'canDownload',   label:'Download'   },
            { key:'canReview',     label:'Reviews'    },
            { key:'canPlaceOrders',label:'Orders'     },
          ].map(p => (
            <span key={p.key} className={'mylib-perm-badge' + (myPerms?.[p.key] === false ? ' off' : ' on')}>
              {myPerms?.[p.key] === false ? '✗' : '✓'} {p.label}
            </span>
          ))}
        </div>
      </div>

      {/* Preference groups */}
      {saved && (
        <div className="mylib-saved-msg">✓ {saved}</div>
      )}
      {preferenceGroups.map(group => (
        <div key={group.label} className="card mylib-pref-card">
          <h4>{group.label}</h4>
          {group.items.map(item => (
            <div key={item.key} className="mylib-pref-row">
              <div>
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </div>
              <button type="button"
                onClick={() => toggle(item.key, item.def)}
                className={'mylib-toggle-btn' + (get(item.key, item.def) ? ' on' : '')}>
                {get(item.key, item.def) ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>
      ))}

      {/* Change password */}
      <div className="card mylib-pref-card">
        <h4>Change Password</h4>
        {pwMsg && (
          <div className={'mylib-pw-msg' + (isOk ? ' ok' : ' err')}>
            {isOk ? '✓' : '✗'} {pwDisplay}
          </div>
        )}
        <form onSubmit={handlePwChange} className="mylib-pw-form">
          <div className="adm-field-group">
            <label>Current Password</label>
            <input className="field" type="password" placeholder="Your current password" value={pwForm.current} onChange={e => setPwForm(f=>({...f,current:e.target.value}))} />
          </div>
          <div className="adm-field-group">
            <label>New Password</label>
            <input className="field" type="password" placeholder="Minimum 4 characters" value={pwForm.newPw} onChange={e => setPwForm(f=>({...f,newPw:e.target.value}))} />
          </div>
          <div className="adm-field-group">
            <label>Confirm New Password</label>
            <input className="field" type="password" placeholder="Repeat new password" value={pwForm.confirm} onChange={e => setPwForm(f=>({...f,confirm:e.target.value}))} />
          </div>
          <button type="submit" className="btn btn-outline btn-sm">Update Password</button>
        </form>
      </div>

      {/* Support */}
      <div className="card mylib-support-card">
        <span style={{ fontSize:'2rem', lineHeight:1 }}>&#128172;</span>
        <div>
          <strong>Need help?</strong>
          <span>WhatsApp us directly — we reply fast</span>
        </div>
        <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
          className="btn btn-sm" style={{ background:'rgba(37,211,102,0.12)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', flexShrink:0 }}>
          Open WhatsApp
        </a>
      </div>
    </div>
  );
}

// -- Pending Order Row — shows retry button for Paystack orders --------------
// NOTE: We do the Firestore unlock directly from the frontend using the
// client SDK. The Cloud Function (callVerifyPaystack) only checks with
// Paystack's API to confirm payment — we no longer rely on it to write
// to Firestore because that write was silently failing (caught + swallowed).
function PendingOrderRow({ order: o, userEmail, isPendingPaystack }) {
  const [retrying,   setRetrying]   = useState(false);
  const [retryMsg,   setRetryMsg]   = useState('');
  const [retryDone,  setRetryDone]  = useState(false);
  const { books: catalog } = useApp();

  const libDocIdFn = (email) => (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

  const doFrontendUnlock = async (orderId, userEmailLow, items) => {
    // Write library entry directly from the client — rules allow write: if true
    const libRef = doc(db, 'libraries', libDocIdFn(userEmailLow));
    const snap   = await getDoc(libRef);
    const existing = snap.exists() ? (snap.data().books || []) : [];
    const map = new Map(existing.map(b => [b.id, b]));
    items.forEach(item => {
      const cat  = catalog.find(b => b.id === item.id) || item;
      const prev = map.get(item.id) || {};
      map.set(item.id, {
        ...prev,
        id:               item.id,
        title:            cat.title  || item.title  || prev.title  || '',
        price:            cat.price  || item.price  || prev.price  || 0,
        cover:            cat.cover  || item.cover  || prev.cover  || '',
        coverType:        cat.coverType || prev.coverType || '',
        author:           cat.author || item.author || prev.author || '',
        genre:            cat.genre  || item.genre  || prev.genre  || '',
        downloadUnlocked: true,
        unlockedAt:       new Date().toISOString(),
        unlockedBy:       'paystack_frontend',
      });
    });
    await setDoc(libRef, { email: userEmailLow, books: Array.from(map.values()) }, { merge: true });

    // Mark order completed — write directly from client
    await updateDoc(doc(db, 'orders', orderId), {
      status:          'Completed',
      confirmedAt:     serverTimestamp(),
      paymentMethod:   'paystack',
      activatedBy:     'frontend_retry',
      updatedAt:       serverTimestamp(),
    });
  };

  const retryActivation = async () => {
    setRetrying(true);
    setRetryMsg('');
    try {
      // Step 1: Check if Firestore already shows Completed (webhook may have arrived)
      const snap = await getDoc(doc(db, 'orders', o.id));
      const orderData = snap.exists() ? snap.data() : null;

      if (orderData?.status === 'Completed') {
        // Order is complete but library may not have been updated — ensure unlock
        await doFrontendUnlock(o.id, userEmail.toLowerCase(), orderData.items || o.items || []);
        setRetryMsg('Books unlocked! Refreshing…');
        setRetryDone(true);
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      // Step 2: Try calling the verify function to check with Paystack
      // The function ONLY confirms payment status — we do the Firestore writes here
      if (o.paystackRef) {
        let paymentConfirmed = false;
        try {
          const result = await callVerifyPaystack({
            reference: o.paystackRef,
            orderId:   o.id,
            userEmail: userEmail,
          });
          // If function returns success, Paystack confirmed payment
          paymentConfirmed = result?.data?.success === true || !!result?.data;
        } catch (verifyErr) {
          // Verify function threw — only bail if payment is explicitly not confirmed
          const msg = verifyErr?.message || '';
          if (msg.includes('Payment status:') && !msg.includes('pending')) {
            // Definitive failure (abandoned, reversed, etc.)
            setRetryMsg('Payment was not completed. If money was deducted, contact support with ref: ' + o.paystackRef);
            return;
          }
          // For network errors or pending status, try the unlock anyway
          // (if money was taken, the order should be activated)
        }

        if (paymentConfirmed) {
          // Payment confirmed — do the unlock directly from frontend
          await doFrontendUnlock(o.id, userEmail.toLowerCase(), o.items || []);
          setRetryMsg('Books unlocked! Refreshing…');
          setRetryDone(true);
          setTimeout(() => window.location.reload(), 1500);
          return;
        }
      }

      setRetryMsg('Payment not yet confirmed by Paystack. If money was deducted, please contact support.');
    } catch (err) {
      console.error('[PendingOrderRow] retry error:', err);
      setRetryMsg('Error: ' + (err?.message || 'Unknown error') + ' — please contact support.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mylib-order-pending-row">
      {retryMsg
        ? <p style={{ color: retryDone ? '#2ecc71' : '#e8832a' }}>{retryMsg}</p>
        : <p>This order is processing. Your books will unlock automatically — usually within seconds. If it takes longer, use the button to retry.</p>
      }
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', flexShrink:0 }}>
        {isPendingPaystack && !retryDone && (
          <button
            className="btn btn-sm"
            style={{ background:'rgba(201,168,76,0.12)', color:'var(--gold)', border:'1px solid rgba(201,168,76,0.35)', whiteSpace:'nowrap' }}
            onClick={retryActivation}
            disabled={retrying}
          >
            {retrying ? 'Activating…' : 'Retry Activation'}
          </button>
        )}
        <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hi, I have a pending order ' + o.id + ' for KSh ' + o.total + '. Please check my payment. Ref: ' + (o.paystackRef||o.ref||'N/A'))}`}
          target="_blank" rel="noopener noreferrer"
          className="btn btn-sm" style={{ background:'rgba(37,211,102,0.1)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', whiteSpace:'nowrap' }}>
          Contact Support
        </a>
      </div>
    </div>
  );
}

// -- Reading Leaderboard Panel -----------------------------------------------
// Reads from user_profiles collection where users have opted in (showInLeaders pref)
// Falls back to a local-only view showing just the current user's stats
function ReadingLeaderboard({ user, catalog }) {
  const [leaders,  setLeaders]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [myRank,   setMyRank]   = useState(null);

  useEffect(() => {
    // Opt-in check — user can disable via Account > Privacy > Reading leaderboard
    const prefKey = 'eh_user_prefs_' + (user?.email || '');
    const prefs = (() => { try { return JSON.parse(localStorage.getItem(prefKey) || '{}'); } catch { return {}; } })();
    const showInLeaders = prefs.showInLeaders !== false; // default true

    // Write current user's stats to user_profiles so they appear on leaderboard
    const myStats  = getAllReadingStats(user.email);
    const myBooks  = Object.keys(myStats).length;
    const myChaps  = Object.values(myStats).reduce((s, v) => s + (v.chapter || 0), 0);
    const myStreak = (() => {
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toLocaleDateString('en-KE');
      });
      const activeDays = new Set(Object.values(myStats).map(s => s.lastRead ? new Date(s.lastRead).toLocaleDateString('en-KE') : null).filter(Boolean));
      return last7.filter(d => activeDays.has(d)).length;
    })();

    if (showInLeaders && user?.email) {
      import('firebase/firestore').then(({ doc, setDoc, serverTimestamp }) => {
        import('../firebase').then(({ db }) => {
          setDoc(doc(db, 'user_profiles', user.email.toLowerCase()), {
            name:         user.name,
            email:        user.email.toLowerCase(),
            booksStarted: myBooks,
            chaptersRead: myChaps,
            streakDays:   myStreak,
            showInLeaders: true,
            updatedAt:    serverTimestamp(),
          }, { merge: true }).catch(() => {});
        });
      });
    }

    // Load leaderboard from Firestore
    import('firebase/firestore').then(({ collection, query, where, orderBy, limit, getDocs }) => {
      import('../firebase').then(({ db }) => {
        getDocs(query(
          collection(db, 'user_profiles'),
          where('showInLeaders', '==', true),
          orderBy('booksStarted', 'desc'),
          limit(50)
        )).then(snap => {
          const rows = snap.docs.map((d, i) => ({
            rank:   i + 1,
            name:   d.data().name   || 'Reader',
            email:  d.data().email  || '',
            books:  d.data().booksStarted || 0,
            chaps:  d.data().chaptersRead || 0,
            streak: d.data().streakDays   || 0,
            isMe:   d.data().email?.toLowerCase() === user?.email?.toLowerCase(),
          }));
          setLeaders(rows);
          const rank = rows.find(r => r.isMe);
          setMyRank(rank?.rank || null);
          setLoading(false);
        }).catch(() => setLoading(false));
      });
    });
  }, [user?.email]); // eslint-disable-line

  const medals = ['🥇','🥈','🥉'];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize:'1.15rem', color:'var(--gold)', marginBottom:6 }}>🏆 Reading Leaderboard</h2>
        <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>
          Top readers on Ellines Haven — ranked by books started. Your position is based on your reading activity.
          {myRank && <strong style={{ color:'var(--gold)', marginLeft:6 }}>You are ranked #{myRank}.</strong>}
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)' }}>Loading leaderboard…</div>
      ) : leaders.length === 0 ? (
        <div className="card" style={{ padding:'32px', textAlign:'center' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:12 }}>📚</div>
          <h3>No leaderboard data yet</h3>
          <p style={{ color:'var(--muted)', fontSize:'0.84rem' }}>Start reading to appear here. Enable leaderboard visibility in Account → Privacy.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--dim)' }}>
                {['Rank','Reader','Books','Chapters','7-day Streak'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaders.map(l => (
                <tr key={l.email} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: l.isMe ? 'rgba(201,168,76,0.07)' : 'transparent',
                  transition: 'background 0.15s',
                }}>
                  <td style={{ padding:'10px 14px', fontWeight:700, fontSize:'0.95rem', color: l.rank <= 3 ? 'var(--gold)' : 'var(--muted)' }}>
                    {medals[l.rank - 1] || `#${l.rank}`}
                  </td>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(201,168,76,0.15)', border:'1px solid rgba(201,168,76,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.85rem', color:'var(--gold)', flexShrink:0 }}>
                        {(l.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:'0.88rem', color: l.isMe ? 'var(--gold)' : 'var(--text)' }}>
                          {l.isMe ? `${l.name} (You)` : l.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'var(--text)' }}>{l.books}</td>
                  <td style={{ padding:'10px 14px', color:'var(--muted)' }}>{l.chaps}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      {l.streak > 0 ? (
                        <>
                          <span style={{ fontSize:'0.9rem' }}>🔥</span>
                          <span style={{ fontWeight:600, color: l.streak >= 5 ? '#e8832a' : 'var(--text)' }}>{l.streak}/7</span>
                        </>
                      ) : (
                        <span style={{ color:'var(--muted)', fontSize:'0.82rem' }}>—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize:'0.74rem', color:'var(--muted)', marginTop:14, textAlign:'center' }}>
        Your name only appears if you have "Reading leaderboard" turned on in Account → Privacy settings.
      </p>
    </div>
  );
}

// -- Main MyLibrary Page -----------------------------------------------------
export default function MyLibrary() {
  const { user, library, books: catalog, myPerms, removeFromMyLibrary, siteControls, wishlist } = useApp();
  
  usePageMeta({
    title: 'My Library',
    description: 'Access all your purchased books, orders, reading stats, and offline downloads — your personal digital library.',
  });

  const [liveOrders, setLiveOrders] = useState([]);
  const [activeTab,  setActiveTab]  = useState('library');
  const [removingBook, setRemovingBook] = useState(null); // bookId being confirmed for removal
  // Track offline save state per-book: { [bookId]: 'saved' | 'saving' | false }
  const [offlineState, setOfflineState] = useState({});

  useEffect(() => {
    if (!user?.email) {
      setLiveOrders([]); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    // Pull reading progress from Firestore ? localStorage so stats are cross-device
    hydrateReadingStats(user.email).catch(() => {});

    const q = query(collection(db, 'orders'), where('userEmail', '==', user.email.toLowerCase()));
    const unsub = onSnapshot(q,
      snap => {
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt || 0 }));
        orders.sort((a, b) => b.createdAt - a.createdAt);
        setLiveOrders(orders);
      },
      err => console.error('MyLibrary orders listener:', err)
    );
    return () => unsub();
  }, [user?.email]);

  // Check which books are already saved offline
  useEffect(() => {
    if (!user?.email || !library?.length) return;
    const map = {};
    library.forEach(b => { map[b.id] = isBookSavedOffline(user.email, b.id) ? 'saved' : false; });
    setOfflineState(map);
  }, [user?.email, library?.length]); // eslint-disable-line

  if (!user) return (
    <main className="mylib-page">
      <div className="container">
        <div className="mylib-gate">
          <img src="/logo-nobg3.png" alt="Ellines Haven" className="mylib-gate-logo" />
          <h2>Your Library Awaits</h2>
          <p>Sign in to access your books, track orders, and manage your reading journey.</p>
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <Link to="/login"    className="btn btn-primary">Sign In</Link>
            <Link to="/register" className="btn btn-outline">Create Account</Link>
          </div>
        </div>
      </div>
    </main>
  );

  if (myPerms?.canAccessMyLibrary === false) return (
    <main className="mylib-page">
      <div className="container">
        <div className="mylib-gate">
          <div className="mylib-gate-icon">&#128274;</div>
          <h2>Library Access Restricted</h2>
          <p>Your access has been restricted by an administrator. Please contact support.</p>
          <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Contact Support</a>
        </div>
      </div>
    </main>
  );

  const myPending   = liveOrders.filter(o => o.status === 'Pending');
  const myCompleted = liveOrders.filter(o => o.status === 'Completed');

  // Reading progress for all owned books
  const progressMap = useReadingProgressMap(user.email);

  const enrichedLibrary = library.map(lb => {
    const cat = catalog.find(b => b.id === lb.id);
    return {
      ...lb,
      cover:       cat?.cover       ?? lb.cover,
      coverType:   cat?.coverType   ?? lb.coverType,
      coverColor:  cat?.coverColor  ?? lb.coverColor,
      coverAccent: cat?.coverAccent ?? lb.coverAccent,
      title:       cat?.title       ?? lb.title,
      author:      cat?.author      ?? lb.author,
      genre:       cat?.genre       ?? lb.genre,
      pages:       cat?.pages       ?? lb.pages,
      readTime:    cat?.readTime    ?? lb.readTime,
      driveUrl:    cat?.driveUrl    ?? lb.driveUrl,
      status:      cat?.status      ?? lb.status,
    };
  });

  const TABS = [
    { k:'library',     label:'My Books',    badge: library.length   || null  },
    { k:'wishlist',    label:'Wishlist',    badge: wishlist.length  || null  },
    { k:'referral',    label:'Referrals',   badge: null                       },
    { k:'orders',      label:'Orders',      badge: myPending.length || null  },
    { k:'stats',       label:'Stats',       badge: null                       },
    { k:'leaderboard', label:'Leaderboard', badge: null                       },
    { k:'account',     label:'Account',     badge: null                       },
  ];

  return (
    <main className="mylib-page">

      {/* -- Hero header -- */}
      <div className="mylib-hero">
        <div className="mylib-hero-glow mylib-hero-glow--a" />
        <div className="mylib-hero-glow mylib-hero-glow--b" />
        <div className="container mylib-hero-inner">
          <div className="mylib-hero-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="mylib-hero-text">
            <h1>Welcome back, <span className="gold-text">{user.name.split(' ')[0]}</span></h1>
            <p>
              {library.length > 0
                ? `You have ${library.length} book${library.length !== 1 ? 's' : ''} in your collection`
                : 'Start building your collection today'}
              {myPending.length > 0 && <span className="mylib-pending-badge">· {myPending.length} pending payment{myPending.length !== 1 ? 's' : ''}</span>}
            </p>
          </div>
          <div className="mylib-hero-stats">
            <div className="mylib-hero-stat">
              <strong>{library.length}</strong>
              <span>Books</span>
            </div>
            <div className="mylib-hero-stat">
              <strong>{myCompleted.length}</strong>
              <span>Purchases</span>
            </div>
            <div className="mylib-hero-stat">
              <strong>{liveOrders.length}</strong>
              <span>Orders</span>
            </div>
          </div>
        </div>
      </div>

      {/* -- Tab bar -- */}
      <div className="mylib-tabbar">
        <div className="container mylib-tabs">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)}
              className={'mylib-tab' + (activeTab === t.k ? ' active' : '')}>
              {t.label}
              {t.badge > 0 && <span className="mylib-tab-badge">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="container mylib-body">

        {/* -- Pending payment alert -- */}
        {activeTab === 'library' && myPending.length > 0 && (
          <div className="mylib-alert">
            <span className="mylib-alert-icon">!</span>
            <div>
              <strong>Processing payment…</strong>
              <p>You have {myPending.length} order{myPending.length !== 1 ? 's' : ''} still processing. Your books will appear here automatically once confirmed.</p>
            </div>
            <button onClick={() => setActiveTab('orders')} className="btn btn-outline btn-sm" style={{ flexShrink:0 }}>
              View Orders
            </button>
          </div>
        )}

        {/* -- LIBRARY TAB -- */}
        {activeTab === 'library' && (
          <>
            {enrichedLibrary.length === 0 ? (
              <div className="mylib-empty">
                <div className="mylib-empty-icon">&#128218;</div>
                <h3>Your library is empty</h3>
                <p>Browse our collection and purchase books to start your reading journey.</p>
                <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
                  <Link to="/library" className="btn btn-primary">Browse Books</Link>
                  <Link to="/"        className="btn btn-outline">Go Home</Link>
                </div>
              </div>
            ) : (
              <div className="mylib-grid">
                {enrichedLibrary.map(b => {
                  const isFullOff = b.active === false;
                  const isReadOff = b.readDeactivated === true;
                  const isDlOff   = b.downloadDeactivated === true;
                  const reason    = b.deactivationReason || 'Access restricted by administrator.';
                  const canRead   = myPerms?.canReadOnline !== false && !isReadOff && !isFullOff;
                  const canDl     = myPerms?.canDownload   !== false && !isDlOff   && !isFullOff;
                  const anyOff    = isFullOff || isReadOff || isDlOff;
                  const sm        = STATUS_META[b.status || 'complete'] || STATUS_META.complete;
                  const progress  = progressMap[b.id] || null;
                  const isReading = progress && progress.chapter > 0;
                  return (
                    <div key={b.id} className={'mylib-card card' + (anyOff ? ' mylib-card--restricted' : '') + (isReading ? ' mylib-card--reading' : '')}>
                      <div className="mylib-card__cover-wrap">
                        {b.coverType === 'photo' && b.cover
                          ? <img src={b.cover} alt={b.title} className="mylib-card__cover" />
                          : <div className="mylib-card__cover mylib-card__cover--styled"
                              style={{ background: b.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}>
                              <span style={{ fontSize:'1.6rem', opacity:0.35 }}>&#128218;</span>
                            </div>
                        }
                        {/* Currently Reading badge */}
                        {isReading && !anyOff && (
                          <div className="mylib-reading-badge">Reading</div>
                        )}
                        {/* Status badge on cover */}
                        {b.status && b.status !== 'complete' && (
                          <span className="mylib-card__status-badge" style={{ background: sm.bg, color: sm.color, border:`1px solid ${sm.color}40` }}>
                            {sm.icon} {sm.label}
                          </span>
                        )}
                        {anyOff && <div className="mylib-card__restricted-overlay">Restricted</div>}
                      </div>

                      <div className="mylib-card__body">
                        <span className="mylib-card__genre">{b.genre}</span>
                        <h3 className="mylib-card__title">{b.title}</h3>
                        <p className="mylib-card__author">by {b.author}</p>
                        {(b.pages > 0 || b.readTime) && (
                          <p className="mylib-card__meta">
                            {b.pages > 0 ? `${b.pages} pages` : ''}
                            {b.pages > 0 && b.readTime ? ' · ' : ''}
                            {b.readTime}
                          </p>
                        )}

                        {/* Reading progress bar */}
                        {isReading && !anyOff && b.chapters && b.chapters.length > 1 && (
                          <div className="mylib-progress-wrap">
                            <div className="mylib-progress-track">
                              <div
                                className="mylib-progress-fill"
                                style={{ width: `${Math.min(100, Math.round(((progress.chapter + 1) / b.chapters.length) * 100))}%` }}
                              />
                            </div>
                            <span className="mylib-progress-label">
                              Ch {progress.chapter + 1}/{b.chapters.length}
                            </span>
                          </div>
                        )}
                        {isReading && !anyOff && (!b.chapters || b.chapters.length <= 1) && (
                          <div className="mylib-progress-wrap">
                            <span className="mylib-progress-label" style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>
                              In progress
                            </span>
                          </div>
                        )}

                        {anyOff && (
                          <div className="mylib-restriction-notice">
                            <strong>Access Restricted</strong>
                            <p>{reason}</p>
                          </div>
                        )}

                        <div className="mylib-card__actions">
                          {/* Primary CTA */}
                          {canRead
                            ? <Link to={readPath(b)} className="btn btn-primary btn-sm">Read Now</Link>
                            : <span className="btn btn-primary btn-sm mylib-disabled" title={reason}>Read Now</span>
                          }
                          {/* PDF download — only shown when a real file exists */}
                          {b.downloadUnlocked && canDl && b.driveUrl && (
                            <a
                              href={toDownloadUrl(b.driveUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                try {
                                  import('../utils/adminActivityTracker').then(({ trackActivity, NOTIFICATION_CATEGORIES }) =>
                                    trackActivity({
                                      category: NOTIFICATION_CATEGORIES.BOOK_DOWNLOAD,
                                      title: 'Book Downloaded',
                                      message: `${user?.name || user?.email} downloaded "${b.title}"`,
                                      userEmail: user?.email,
                                      userName: user?.name,
                                      metadata: { bookId: b.id, bookTitle: b.title },
                                      priority: 'low',
                                    })
                                  ).catch(() => {});
                                } catch {}
                              }}
                            >PDF</a>
                          )}
                          {b.downloadUnlocked && !canDl && !isFullOff && (
                            <span className="btn btn-outline btn-sm mylib-disabled" title={reason}>Restricted</span>
                          )}
                          <Link to={bookPath(b)} className="btn btn-ghost btn-sm">Details</Link>
                          {/* Trash — confirm inline */}
                          {removingBook === b.id ? (
                            <span className="mylib-remove-confirm">
                              Remove?{' '}
                              <button className="btn btn-sm mylib-remove-yes" onClick={async () => { await removeFromMyLibrary(b.id); setRemovingBook(null); }}>Yes</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setRemovingBook(null)}>No</button>
                            </span>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm mylib-remove-btn"
                              title="Remove from library"
                              onClick={() => setRemovingBook(b.id)}
                            >&#128465;</button>
                          )}
                        </div>

                        {/* -- Offline save row -- */}
                        {siteControls?.offlineEnabled !== false && !anyOff && (
                          <div className="mylib-offline-row">
                            {offlineState[b.id] === 'saved' ? (
                              <>
                                <span className="mylib-offline-badge">Saved Offline</span>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize:'0.72rem', padding:'2px 8px' }}
                                  title="Remove offline cache for this book"
                                  onClick={() => {
                                    removeOfflineBook(user.email, b.id);
                                    setOfflineState(s => ({ ...s, [b.id]: false }));
                                  }}
                                >Remove</button>
                              </>
                            ) : (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize:'0.75rem', padding:'3px 10px', color:'var(--muted)', border:'1px solid rgba(255,255,255,0.1)' }}
                                disabled={offlineState[b.id] === 'saving'}
                                title="Save this book's chapters to your browser for offline reading"
                                onClick={() => {
                                  setOfflineState(s => ({ ...s, [b.id]: 'saving' }));
                                  // Use fallback chapters — same source the Reader uses
                                  const chapters = getFallbackChapters(b);
                                  const ok = saveBookOffline(user.email, b.id, b, chapters);
                                  setOfflineState(s => ({ ...s, [b.id]: ok ? 'saved' : false }));
                                }}
                              >
                                {offlineState[b.id] === 'saving' ? 'Saving…' : 'Save Offline'}
                              </button>
                            )}
                          </div>
                        )}

                        {b.downloadUnlocked && (
                          <p className="mylib-license-note">Licensed to {user.name} only</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Discover more */}
            {enrichedLibrary.length > 0 && (
              <div className="mylib-discover">
                <div>
                  <strong>Discover more stories</strong>
                  <span>Browse our full catalogue of original East African fiction</span>
                </div>
                <Link to="/library" className="btn btn-outline btn-sm">Browse Library &rarr;</Link>
              </div>
            )}
          </>
        )}

        {/* -- WISHLIST TAB -- */}
        {activeTab === 'wishlist' && (
          <>
            {wishlist.length === 0 ? (
              <div className="mylib-empty">
                <div className="mylib-empty-icon">💛</div>
                <h3>Your wishlist is empty</h3>
                <p>Add books to your wishlist to save them for later. We'll notify you when they go on sale!</p>
                <Link to="/library" className="btn btn-primary">Browse Books</Link>
              </div>
            ) : (
              <div className="mylib-grid">
                {wishlist.map(b => {
                  const owned     = library.some(lib => lib.id === b.id);
                  const sm        = STATUS_META[b.status || 'complete'] || STATUS_META.complete;
                  return (
                    <div key={b.id} className={'mylib-card card' + (owned ? ' mylib-card--owned' : '')}>
                      <div className="mylib-card__cover-wrap">
                        {b.coverType === 'photo' && b.cover
                          ? <img src={b.cover} alt={b.title} className="mylib-card__cover" />
                          : <div className="mylib-card__cover mylib-card__cover--styled"
                              style={{ background: b.coverColor || 'linear-gradient(145deg,#0f0f22,#1a1a3a)' }}>
                              <span style={{ fontSize:'1.6rem', opacity:0.35 }}>&#128218;</span>
                            </div>
                        }
                        {owned && (
                          <div className="mylib-reading-badge" style={{ background: 'var(--ok)' }}>
                            ✓ Owned
                          </div>
                        )}
                        {b.status && b.status !== 'complete' && (
                          <span className="mylib-card__status-badge" style={{ background: sm.bg, color: sm.color, border:`1px solid ${sm.color}40` }}>
                            {sm.icon} {sm.label}
                          </span>
                        )}
                      </div>

                      <div className="mylib-card__body">
                        <span className="mylib-card__genre">{b.genre}</span>
                        <h3 className="mylib-card__title">{b.title}</h3>
                        <p className="mylib-card__author">by {b.author}</p>
                        {(b.pages > 0 || b.readTime) && (
                          <p className="mylib-card__meta">
                            {b.pages > 0 ? `${b.pages} pages` : ''}
                            {b.pages > 0 && b.readTime ? ' · ' : ''}
                            {b.readTime}
                          </p>
                        )}
                        
                        {b.price > 0 && (
                          <div style={{ 
                            fontSize: '1.1rem', 
                            fontWeight: 700, 
                            color: 'var(--gold)', 
                            marginTop: 8,
                            marginBottom: 8 
                          }}>
                            KSh {b.price.toLocaleString()}
                          </div>
                        )}

                        <div className="mylib-card__actions">
                          {owned ? (
                            <>
                              <Link to={readPath(b)} className="btn btn-primary btn-sm">Read Now</Link>
                              <Link to={bookPath(b)} className="btn btn-ghost btn-sm">View</Link>
                            </>
                          ) : (
                            <>
                              <Link to={bookPath(b)} className="btn btn-primary btn-sm">Buy Now</Link>
                              <Link to={bookPath(b)} className="btn btn-ghost btn-sm">Details</Link>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* -- REFERRAL TAB -- */}
        {activeTab === 'referral' && (
          <ReferralDashboard user={user} />
        )}

        {/* -- ORDERS TAB -- */}
        {activeTab === 'orders' && (
          <div className="mylib-orders">
            {liveOrders.length === 0 ? (
              <div className="mylib-empty">
                <div className="mylib-empty-icon">&#128219;</div>
                <h3>No orders yet</h3>
                <p>Your purchase history will appear here once you place an order.</p>
                <Link to="/library" className="btn btn-primary">Browse Books</Link>
              </div>
            ) : (
              <>
                {/* Summary row */}
                <div className="mylib-orders-summary">
                  {[
                    { label:'Total Orders',    value: liveOrders.length,                                                        color:'var(--gold)' },
                    { label:'Completed',       value: myCompleted.length,                                                       color:'#2ecc71'     },
                    { label:'Pending',         value: myPending.length,                                                         color:'#e8832a'     },
                    { label:'Total Spent',     value: 'KSh ' + myCompleted.reduce((s,o)=>s+(o.total||0),0).toLocaleString(),   color:'var(--gold)' },
                  ].map(s => (
                    <div key={s.label} className="mylib-order-stat card">
                      <strong style={{ color: s.color }}>{s.value}</strong>
                      <span>{s.label}</span>
                    </div>
                  ))}
                </div>

                <div className="mylib-orders-list">
                  {liveOrders.map(o => {
                    const isPendingPaystack = o.status === 'Pending' && o.method === 'paystack' && o.paystackRef;
                    const statusColor = o.status==='Completed' ? '#2ecc71' : o.status==='Pending' ? '#e8832a' : '#e74c3c';
                    const statusBg    = o.status==='Completed' ? 'rgba(46,204,113,0.1)' : o.status==='Pending' ? 'rgba(232,131,42,0.1)' : 'rgba(231,76,60,0.1)';
                    return (
                      <div key={o.id} className="mylib-order-card card"
                        style={{ borderLeft: `3px solid ${statusColor}` }}>
                        <div className="mylib-order-top">
                          <div className="mylib-order-books">
                            <strong>{o.items?.map(i => i.title).join(', ') || 'Order'}</strong>
                            <span className="mylib-order-meta">{o.id} · {o.date} · {o.method}</span>
                            {o.ref && <span className="mylib-order-ref">Ref: {o.ref}</span>}
                            {o.promoCode && (
                              <span style={{ fontSize:'0.72rem', color:'var(--ok)', fontWeight:600 }}>
                                Promo: {o.promoCode}
                                {o.discountAmount > 0 && ` (-KSh ${o.discountAmount.toLocaleString()})`}
                              </span>
                            )}
                          </div>
                          <div className="mylib-order-right">
                            <strong className="mylib-order-amount">KSh {(o.total||0).toLocaleString()}</strong>
                            {o.originalTotal && o.originalTotal !== o.total && (
                              <span style={{ fontSize:'0.72rem', color:'var(--muted)', textDecoration:'line-through' }}>
                                KSh {o.originalTotal.toLocaleString()}
                              </span>
                            )}
                            <span className="mylib-order-status-badge"
                              style={{ background: statusBg, color: statusColor, border:`1px solid ${statusColor}40` }}>
                              {o.status}
                            </span>
                          </div>
                        </div>
                        {o.status === 'Pending' && (
                          <PendingOrderRow order={o} userEmail={user.email} isPendingPaystack={isPendingPaystack} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* -- ACCOUNT TAB -- */}
        {activeTab === 'account' && <AccountSettings user={user} myPerms={myPerms} />}

        {/* -- STATS TAB -- */}
        {activeTab === 'stats' && (
          <ReadingStats
            user={user}
            library={enrichedLibrary}
            catalog={catalog}
            orders={liveOrders}
          />
        )}

        {/* -- LEADERBOARD TAB -- */}
        {activeTab === 'leaderboard' && (
          <ReadingLeaderboard user={user} catalog={catalog} />
        )}

      </div>
    </main>
  );
}
