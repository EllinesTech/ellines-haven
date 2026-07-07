import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

/* ── Helpers ── */
const fmtKsh  = n => 'KSh ' + Number(n || 0).toLocaleString();
const monthKey  = ts => { const d = new Date(ts || Date.now()); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); };
const monthLabel = key => { const [y,m] = key.split('-'); return new Date(y, m-1, 1).toLocaleString('en-KE', { month:'short', year:'numeric' }); };
const dayKey = ts => { const d = new Date(ts || Date.now()); return d.toISOString().slice(0,10); };
const fmtDay  = k => { try { return new Date(k).toLocaleDateString('en-KE', { day:'numeric', month:'short' }); } catch { return k; } };

const GENRE_COLORS = ['#c9a84c','#4a9eff','#2ecc71','#a855f7','#e8832a','#e74c3c','#00c48c','#64748b'];

export default function AnalyticsPanel({ orders = [], books = [], users = [], showToast }) {
  const [range, setRange]         = useState('all');
  const [visitors, setVisitors]   = useState([]);
  const [sessions, setSessions]   = useState([]);
  const [loading,  setLoading]    = useState(true);

  /* ── Load site_visitors from Firestore ── */
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'site_visitors'), orderBy('visitedAt', 'desc'), limit(1000));
    const unsub = onSnapshot(q, snap => {
      setVisitors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  /* ── Load user_sessions ── */
  useEffect(() => {
    getDocs(query(collection(db, 'user_sessions'), orderBy('loginTime', 'desc'), limit(500)))
      .then(snap => setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  /* ── Date range filter helper ── */
  const inRange = ts => {
    const ms = typeof ts === 'number' ? ts : ts?.toMillis?.() || ts?.seconds * 1000 || 0;
    const now = Date.now();
    if (range === 'week')  return now - ms < 7  * 86400000;
    if (range === 'month') return now - ms < 30 * 86400000;
    return true;
  };

  /* ── Filtered data ── */
  const filteredOrders   = useMemo(() => orders.filter(o => inRange(o.createdAt || 0)),   [orders, range]);   // eslint-disable-line
  const filteredVisitors = useMemo(() => visitors.filter(v => inRange(v.visitedAt)),       [visitors, range]); // eslint-disable-line
  const completed        = useMemo(() => filteredOrders.filter(o => o.status === 'Completed'), [filteredOrders]);

  /* ── User registration trend (last 12 months) ── */
  const usersByMonth = useMemo(() => {
    const map = {};
    users.forEach(u => {
      const ts = u.createdAt?.toMillis?.() || (u.joined ? new Date(u.joined).getTime() : 0);
      if (!ts) return;
      const k = monthKey(ts);
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).slice(-12);
  }, [users]);
  const maxUserMonth = usersByMonth.length ? Math.max(...usersByMonth.map(([,v]) => v)) : 1;

  /* ── Visitors by day (last 14 days) ── */
  const visitorsByDay = useMemo(() => {
    const map = {};
    // Seed last 14 days with 0
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      map[d.toISOString().slice(0,10)] = 0;
    }
    visitors.forEach(v => {
      const ms = typeof v.visitedAt === 'number' ? v.visitedAt : v.visitedAt?.toMillis?.() || 0;
      if (Date.now() - ms < 14 * 86400000) {
        const k = dayKey(ms);
        map[k] = (map[k] || 0) + 1;
      }
    });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
  }, [visitors]);
  const maxDayVisitors = visitorsByDay.length ? Math.max(...visitorsByDay.map(([,v]) => v), 1) : 1;

  /* ── Books by genre breakdown ── */
  const booksByGenre = useMemo(() => {
    const map = {};
    books.forEach(b => {
      const g = b.genre || 'Other';
      map[g] = (map[g] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [books]);

  /* ── Revenue by month ── */
  const revenueByMonth = useMemo(() => {
    const map = {};
    completed.forEach(o => {
      const k = monthKey(o.createdAt || 0);
      map[k] = (map[k] || 0) + Number(o.total || 0);
    });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
  }, [completed]);
  const maxRev = revenueByMonth.length ? Math.max(...revenueByMonth.map(([,v]) => v), 1) : 1;

  /* ── Top books by units sold ── */
  const topByUnits = useMemo(() => {
    const map = {};
    completed.forEach(o => {
      (o.items || []).forEach(item => {
        if (!map[item.id]) map[item.id] = { title: item.title, units: 0 };
        map[item.id].units += 1;
      });
    });
    return Object.values(map).sort((a,b) => b.units - a.units).slice(0,6);
  }, [completed]);

  /* ── Devices ── */
  const deviceMap = useMemo(() => {
    const m = {};
    filteredVisitors.forEach(v => { const d = v.device || 'Desktop'; m[d] = (m[d]||0)+1; });
    return Object.entries(m).sort((a,b) => b[1]-a[1]);
  }, [filteredVisitors]);
  const totalDevices = deviceMap.reduce((s,[,n]) => s+n, 0) || 1;

  /* ── Top countries ── */
  const topCountries = useMemo(() => {
    const m = {};
    filteredVisitors.forEach(v => { if (v.country) m[v.country] = (m[v.country]||0)+1; });
    return Object.entries(m).sort((a,b) => b[1]-a[1]).slice(0,6);
  }, [filteredVisitors]);
  const maxCountry = topCountries[0]?.[1] || 1;

  /* ── KPI summary ── */
  const totalRevenue  = completed.reduce((s,o) => s + Number(o.total||0), 0);
  const conversionRate = filteredVisitors.length
    ? Math.min(100, Math.round((completed.length / filteredVisitors.length) * 100))
    : 0;
  const newUsersCount = users.filter(u => {
    const ts = u.createdAt?.toMillis?.() || (u.joined ? new Date(u.joined).getTime() : 0);
    return inRange(ts);
  }).length;

  const DEVICE_ICONS = { Mobile:'📱', Desktop:'💻', Tablet:'📱', Windows:'💻', Mac:'🍎', Linux:'🐧' };

  return (
    <div className="adm-page">
      {/* Header */}
      <div className="adm-page-head">
        <div>
          <h1>📊 Analytics</h1>
          <span className="adm-page-sub">Site performance, growth metrics, and audience insights</span>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {['all','month','week'].map(r => (
            <button key={r} className={'adm-filter-btn' + (range===r?' active':'')} onClick={() => setRange(r)}>
              {r==='all' ? 'All Time' : r==='month' ? 'Last 30 Days' : 'Last 7 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="adm-stats-grid cols-4" style={{ marginBottom:24 }}>
        {[
          { icon:'👥', label:'Total Users',       value: users.length,                 color:'#4a9eff', bg:'rgba(74,158,255,0.1)'  },
          { icon:'🆕', label:'New Registrations', value: newUsersCount,                color:'#2ecc71', bg:'rgba(46,204,113,0.1)'  },
          { icon:'🌐', label:'Site Visits',        value: filteredVisitors.length,      color:'#c9a84c', bg:'rgba(201,168,76,0.1)'  },
          { icon:'📈', label:'Conversion Rate',   value: conversionRate + '%',         color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ background:s.bg, fontSize:'1.4rem' }}>{s.icon}</div>
            <div className="adm-stat-body">
              <strong style={{ color:s.color, fontSize:'1.5rem' }}>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="adm-stats-grid cols-4" style={{ marginBottom:28 }}>
        {[
          { icon:'📚', label:'Total Books',       value: books.length,                 color:'#e8832a', bg:'rgba(232,131,42,0.1)'  },
          { icon:'🛒', label:'Orders (period)',   value: filteredOrders.length,        color:'#c9a84c', bg:'rgba(201,168,76,0.1)'  },
          { icon:'💰', label:'Revenue (period)',  value: fmtKsh(totalRevenue),         color:'#2ecc71', bg:'rgba(46,204,113,0.1)'  },
          { icon:'🗺️', label:'Countries',         value: new Set(filteredVisitors.map(v=>v.country).filter(Boolean)).size, color:'#7eb6ff', bg:'rgba(126,182,255,0.1)' },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ background:s.bg, fontSize:'1.4rem' }}>{s.icon}</div>
            <div className="adm-stat-body">
              <strong style={{ color:s.color, fontSize:'1.5rem' }}>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 1: Visitor Trend + User Growth ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>

        {/* Visitor trend — last 14 days */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:18, color:'var(--gold)' }}>🌐 Daily Visitors — Last 14 Days</h3>
          {loading ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)', fontSize:'0.82rem' }}>Loading…</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {visitorsByDay.map(([day, count]) => (
                <div key={day} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:64, fontSize:'0.68rem', color:'var(--muted)', flexShrink:0 }}>{fmtDay(day)}</span>
                  <div style={{ flex:1, height:16, background:'rgba(255,255,255,0.04)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width: Math.round((count/maxDayVisitors)*100)+'%', background:'linear-gradient(90deg,#c9a84c,#e8c96d)', borderRadius:4, minWidth: count > 0 ? 4 : 0 }} />
                  </div>
                  <span style={{ width:24, fontSize:'0.72rem', color:'var(--gold)', fontWeight:700, textAlign:'right', flexShrink:0 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User registrations by month */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:18, color:'var(--gold)' }}>👥 New Users by Month</h3>
          {usersByMonth.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No registration data yet.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {usersByMonth.map(([key, count]) => (
                <div key={key}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', marginBottom:4 }}>
                    <span style={{ color:'var(--text)' }}>{monthLabel(key)}</span>
                    <span style={{ color:'#4a9eff', fontWeight:700 }}>{count} users</span>
                  </div>
                  <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width: Math.round((count/maxUserMonth)*100)+'%', background:'linear-gradient(90deg,#4a9eff,#7eb6ff)', borderRadius:4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Revenue trend + Top books by units ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:20, marginBottom:20 }}>

        {/* Revenue trend */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:18, color:'var(--gold)' }}>💰 Revenue Trend (Last 6 Months)</h3>
          {revenueByMonth.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No completed orders yet.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {revenueByMonth.map(([key, val]) => (
                <div key={key}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:4 }}>
                    <span style={{ color:'var(--text)' }}>{monthLabel(key)}</span>
                    <span style={{ color:'#2ecc71', fontWeight:700 }}>{fmtKsh(val)}</span>
                  </div>
                  <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width: Math.round((val/maxRev)*100)+'%', background:'linear-gradient(90deg,#2ecc71,#5eeca0)', borderRadius:4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top books by units sold */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:18, color:'var(--gold)' }}>📚 Top Books — Units Sold</h3>
          {topByUnits.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No completed orders yet.</div>
          ) : topByUnits.map((b, i) => (
            <div key={b.title} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ width:20, fontSize:'0.72rem', color:'var(--muted)', flexShrink:0 }}>{i+1}</span>
              <span style={{ flex:1, fontSize:'0.8rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text)' }}>{b.title}</span>
              <span style={{ fontSize:'0.82rem', color:'var(--gold)', fontWeight:700, flexShrink:0 }}>{b.units} sold</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 3: Audience — Devices + Countries + Genres ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, marginBottom:20 }}>

        {/* Device breakdown */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:18, color:'var(--gold)' }}>💻 Devices</h3>
          {deviceMap.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No visitor data.</div>
          ) : deviceMap.map(([device, count]) => {
            const pct = Math.round((count / totalDevices) * 100);
            return (
              <div key={device} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:4 }}>
                  <span style={{ color:'var(--text)' }}>{DEVICE_ICONS[device] || '🖥️'} {device}</span>
                  <span style={{ color:'var(--gold)', fontWeight:700 }}>{pct}% <span style={{ color:'var(--muted)', fontWeight:400 }}>({count})</span></span>
                </div>
                <div style={{ height:7, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,#a855f7,#c084fc)', borderRadius:4 }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Top countries */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:18, color:'var(--gold)' }}>🗺️ Top Countries</h3>
          {topCountries.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No visitor data.</div>
          ) : topCountries.map(([country, count]) => (
            <div key={country} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:4 }}>
                <span style={{ color:'var(--text)' }}>{country}</span>
                <span style={{ color:'#4a9eff', fontWeight:700 }}>{count}</span>
              </div>
              <div style={{ height:6, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:Math.round((count/maxCountry)*100)+'%', background:'linear-gradient(90deg,#4a9eff,#7eb6ff)', borderRadius:3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Books by genre */}
        <div className="card" style={{ padding:22 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:18, color:'var(--gold)' }}>🏷️ Catalogue by Genre</h3>
          {booksByGenre.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No books yet.</div>
          ) : booksByGenre.map(([genre, count], i) => (
            <div key={genre} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ width:10, height:10, borderRadius:'50%', background: GENRE_COLORS[i % GENRE_COLORS.length], flexShrink:0 }} />
              <span style={{ flex:1, fontSize:'0.8rem', color:'var(--text)' }}>{genre}</span>
              <span style={{ fontSize:'0.78rem', color:'var(--muted)', fontWeight:600 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 4: Recent Logins ── */}
      {sessions.length > 0 && (
        <div className="card" style={{ overflow:'hidden', marginBottom:20 }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <strong style={{ fontSize:'0.88rem' }}>🔐 Recent Logins</strong>
            <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{sessions.length} sessions tracked</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="adm-table">
              <thead>
                <tr><th>User</th><th>Device</th><th>IP</th><th>Time</th></tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map(s => {
                  const ts = s.loginTime?.toMillis?.() || 0;
                  const diff = Date.now() - ts;
                  const ago = diff < 60000 ? 'Just now'
                    : diff < 3600000 ? Math.floor(diff/60000)+'m ago'
                    : diff < 86400000 ? Math.floor(diff/3600000)+'h ago'
                    : Math.floor(diff/86400000)+'d ago';
                  return (
                    <tr key={s.id}>
                      <td style={{ fontSize:'0.8rem' }}>{s.userEmail}</td>
                      <td style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{s.device || '—'}</td>
                      <td><code style={{ fontSize:'0.72rem', color:'#7eb6ff' }}>{s.ip || '—'}</code></td>
                      <td style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{ago}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
