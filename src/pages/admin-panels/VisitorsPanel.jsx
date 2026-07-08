import { useState, useEffect } from 'react';
import { collection, query, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = typeof ts === 'number' ? new Date(ts) : ts.toDate?.() || new Date(ts);
    return d.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(ts); }
};

const fmtRelative = ts => {
  if (!ts) return '—';
  try {
    const d = typeof ts === 'number' ? new Date(ts) : ts.toDate?.() || new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  } catch { return '—'; }
};

const FLAG_BASE = 'https://flagcdn.com/16x12/';

export default function VisitorsPanel({ showToast }) {
  const [visitors, setVisitors]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [stats,    setStats]      = useState({ total: 0, today: 0, unique: 0, countries: 0 });
  const [filter,   setFilter]     = useState('all');   // all | today | week
  const [search,   setSearch]     = useState('');
  const [view,     setView]       = useState('table'); // table | map
  const [selected, setSelected]   = useState(null);
  const [exporting, setExporting] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Simulate a visitor by calling the Cloud Function directly
  const simulateVisit = async () => {
    setSimulating(true);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const fns = getFunctions(undefined, 'us-central1');
      const trackFn = httpsCallable(fns, 'trackVisitor');
      await trackFn({
        page: '/library',
        referrer: 'admin-test',
        userAgent: navigator.userAgent,
        device: 'Desktop',
        userEmail: null,
        userName: null,
      });
      showToast?.('✅ Test visit recorded — should appear below shortly');
    } catch (err) {
      // Fallback: write directly to Firestore with dummy data
      try {
        const visitId = 'v_test_' + Date.now();
        const { serverTimestamp } = await import('firebase/firestore');
        await setDoc(doc(db, 'site_visitors', visitId), {
          ip: '0.0.0.0',
          city: 'Test City',
          region: 'Test Region',
          country: 'Kenya',
          countryCode: 'ke',
          lat: -1.286389, lon: 36.817223,
          isp: 'Test ISP',
          org: '',
          timezone: 'Africa/Nairobi',
          page: '/library',
          referrer: 'admin-test',
          userAgent: navigator.userAgent.slice(0, 200),
          device: 'Desktop',
          rawIp: '0.0.0.0',
          visitedAt: serverTimestamp(),
          visitedAtMs: Date.now(),
        });
        showToast?.('✅ Test visit written directly — Cloud Function unavailable');
      } catch (e2) {
        showToast?.('❌ Test failed: ' + (err.message || e2.message));
      }
    }
    setSimulating(false);
  };

  useEffect(() => {
    setLoading(true);
    // No orderBy — sort client-side so docs without visitedAt are still included.
    // Firestore silently excludes documents that lack the ordered field.
    const q = query(collection(db, 'site_visitors'), limit(500));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        // Sort newest-first client-side; handle Timestamp, ms number, or missing
        .sort((a, b) => {
          const ta = a.visitedAt?.toMillis?.() ?? (typeof a.visitedAt === 'number' ? a.visitedAt : a.visitedAtMs || 0);
          const tb = b.visitedAt?.toMillis?.() ?? (typeof b.visitedAt === 'number' ? b.visitedAt : b.visitedAtMs || 0);
          return tb - ta;
        });
      setVisitors(data);
      calcStats(data);
      setLoading(false);
    }, err => {
      console.error('[VisitorsPanel]', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const calcStats = (data) => {
    const now   = Date.now();
    const today = data.filter(v => {
      const ts = typeof v.visitedAt === 'number' ? v.visitedAt : v.visitedAt?.toMillis?.() || 0;
      return now - ts < 86400000;
    }).length;
    const unique    = new Set(data.map(v => v.ip)).size;
    const countries = new Set(data.map(v => v.country).filter(Boolean)).size;
    setStats({ total: data.length, today, unique, countries });
  };

  const filtered = visitors.filter(v => {
    // Time-range filter
    if (filter === 'today' || filter === 'week') {
      const now = Date.now();
      const ts  = typeof v.visitedAt === 'number' ? v.visitedAt : v.visitedAt?.toMillis?.() || 0;
      if (filter === 'today') return now - ts < 86400000;
      if (filter === 'week')  return now - ts < 7 * 86400000;
    }
    return true;
  }).filter(v => {
    // Search filter (applied after time-range)
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.ip?.includes(q) ||
      v.city?.toLowerCase().includes(q) ||
      v.country?.toLowerCase().includes(q) ||
      v.page?.toLowerCase().includes(q) ||
      v.userAgent?.toLowerCase().includes(q) ||
      v.userEmail?.toLowerCase().includes(q)
    );
  });

  const exportCSV = () => {
    setExporting(true);
    const rows = [
      ['Time', 'IP', 'City', 'Region', 'Country', 'ISP', 'Page', 'Referrer', 'User Agent'],
      ...filtered.map(v => [
        fmtDate(v.visitedAt),
        v.ip || '',
        v.city || '',
        v.region || '',
        v.country || '',
        v.isp || '',
        v.page || '',
        v.referrer || '',
        v.userAgent || '',
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ellines-haven-visitors-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    showToast?.('📊 Visitor data exported');
  };

  // Top countries
  const countryMap = {};
  visitors.forEach(v => {
    if (v.country) countryMap[v.country] = (countryMap[v.country] || 0) + 1;
  });
  const topCountries = Object.entries(countryMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const maxCountryCount = topCountries[0]?.[1] || 1;

  // Top pages
  const pageMap = {};
  visitors.forEach(v => {
    const p = v.page || '/';
    pageMap[p] = (pageMap[p] || 0) + 1;
  });
  const topPages = Object.entries(pageMap).sort((a,b) => b[1]-a[1]).slice(0, 8);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Site Visitors</h1>
          <span className="adm-page-sub">Real-time visitor tracking — IP addresses, locations, and pages visited</span>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {['all','today','week'].map(f => (
            <button key={f} className={'adm-filter-btn' + (filter===f?' active':'')} onClick={() => { setFilter(f); setSearch(''); }}>
              {f === 'all' ? 'All Time' : f === 'today' ? 'Today' : 'This Week'}
            </button>
          ))}
          <button
            className="btn btn-ghost btn-sm"
            onClick={simulateVisit}
            disabled={simulating}
            style={{ background:'rgba(74,158,255,0.08)', color:'#4a9eff', border:'1px solid rgba(74,158,255,0.2)' }}
            title="Simulate a test visitor to verify tracking is working"
          >
            {simulating ? '⏳ Sending…' : '🧪 Test Visit'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={exporting}>
            {exporting ? '⏳' : '📊 Export CSV'}
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="adm-stats-grid cols-4" style={{ marginBottom: 24 }}>
        {[
          { icon:'👥', label:'Total Visits',    value: stats.total,     color:'#c9a84c', bg:'rgba(201,168,76,0.1)' },
          { icon:'📅', label:'Today',           value: stats.today,     color:'#2ecc71', bg:'rgba(46,204,113,0.1)' },
          { icon:'🌐', label:'Unique IPs',      value: stats.unique,    color:'#4a9eff', bg:'rgba(74,158,255,0.1)' },
          { icon:'🗺️', label:'Countries',       value: stats.countries, color:'#a855f7', bg:'rgba(168,85,247,0.1)' },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ background: s.bg, fontSize:'1.4rem' }}>{s.icon}</div>
            <div className="adm-stat-body">
              <strong style={{ color: s.color, fontSize:'1.5rem' }}>{loading ? '…' : s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        {/* Top Countries */}
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:16, color:'var(--gold)' }}>🗺️ Top Countries</h3>
          {topCountries.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:'0.82rem' }}>
              No visitor data yet.
            </div>
          ) : topCountries.map(([country, count]) => (
            <div key={country} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:4 }}>
                <span style={{ color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>
                  <img
                    src={`${FLAG_BASE}${country.slice(0,2).toLowerCase()}.png`}
                    alt={country}
                    style={{ width:16, height:12, borderRadius:2, flexShrink:0 }}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  {country}
                </span>
                <span style={{ color:'var(--gold)', fontWeight:700 }}>{count}</span>
              </div>
              <div style={{ height:6, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width: Math.round((count/maxCountryCount)*100)+'%', background:'linear-gradient(90deg,#c9a84c,#e8c96d)', borderRadius:3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Top Pages */}
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:16, color:'var(--gold)' }}>📄 Top Pages</h3>
          {topPages.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No data yet.</div>
          ) : topPages.map(([page, count], i) => (
            <div key={page} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ width:20, fontSize:'0.7rem', color:'var(--muted)', flexShrink:0 }}>{i+1}</span>
              <span style={{ flex:1, fontSize:'0.8rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace', color:'var(--text)' }}>{page}</span>
              <span style={{ fontSize:'0.78rem', color:'var(--gold)', fontWeight:700, flexShrink:0 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ marginBottom:12 }}>
        <input
          className="field"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by IP, city, country, or page…"
          style={{ maxWidth:420 }}
        />
      </div>

      {/* ── Visitor table ── */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontWeight:600, fontSize:'0.88rem' }}>
            👤 Recent Visitors <span style={{ color:'var(--muted)', fontWeight:400, fontSize:'0.8rem' }}>({filtered.length})</span>
          </span>
          {selected && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕ Close Detail</button>
          )}
        </div>

        {loading ? (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--muted)' }}>Loading visitor data…</div>
        ) : filtered.length === 0 ? (
          <div className="adm-empty">
            <div style={{ fontSize:'2.5rem', marginBottom:10 }}>👥</div>
            <p>No visitor data yet. Visitors are tracked automatically when they browse the site.</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>IP Address</th>
                  <th>Location</th>
                  <th>ISP</th>
                  <th>Page</th>
                  <th>Device / User</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((v, i) => (
                  <>
                    <tr
                      key={v.id}
                      style={{ cursor:'pointer', background: selected?.id === v.id ? 'rgba(201,168,76,0.06)' : 'transparent' }}
                      onClick={() => setSelected(selected?.id === v.id ? null : v)}
                    >
                      <td style={{ fontSize:'0.72rem', color:'var(--muted)', whiteSpace:'nowrap' }}>
                        <div>{fmtDate(v.visitedAt)}</div>
                        <div style={{ color:'var(--gold)', fontSize:'0.68rem' }}>{fmtRelative(v.visitedAt)}</div>
                      </td>
                      <td>
                        <code style={{ fontSize:'0.78rem', color:'#7eb6ff', background:'rgba(74,158,255,0.08)', padding:'2px 6px', borderRadius:4 }}>
                          {v.ip || '—'}
                        </code>
                      </td>
                      <td style={{ fontSize:'0.8rem' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          {v.countryCode && (
                            <img
                              src={`${FLAG_BASE}${v.countryCode.toLowerCase()}.png`}
                              alt={v.country}
                              style={{ width:16, height:12, borderRadius:2, flexShrink:0 }}
                              onError={e => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <span>
                            {[v.city, v.region, v.country].filter(Boolean).join(', ') || '—'}
                          </span>
                        </div>
                        {v.lat && v.lon && (
                          <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{v.lat.toFixed(2)}, {v.lon.toFixed(2)}</div>
                        )}
                      </td>
                      <td style={{ fontSize:'0.75rem', color:'var(--muted)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {v.isp || v.org || '—'}
                      </td>
                      <td>
                        <span style={{ fontSize:'0.78rem', fontFamily:'monospace', color:'var(--text)' }}>{v.page || '/'}</span>
                        {v.referrer && v.referrer !== 'direct' && (
                          <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>from: {v.referrer}</div>
                        )}
                      </td>
                      <td style={{ fontSize:'0.72rem', color:'var(--muted)' }}>
                        <div>{v.device || '—'}</div>
                        {v.userEmail && (
                          <div style={{ color:'var(--gold)', fontSize:'0.68rem', marginTop:2 }}>
                            👤 {v.userEmail}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="adm-act-btn adm-act-edit"
                          onClick={e => { e.stopPropagation(); setSelected(selected?.id === v.id ? null : v); }}
                        >
                          {selected?.id === v.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {selected?.id === v.id && (
                      <tr key={v.id + '_detail'}>
                        <td colSpan={7} style={{ background:'rgba(255,255,255,0.02)', padding:0 }}>
                          <div style={{ padding:'16px 20px', borderLeft:'3px solid var(--gold)' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12, fontSize:'0.8rem' }}>
                              {[
                                ['🌐 IP Address',    v.ip || '—'],
                                ['📍 City',          v.city || '—'],
                                ['🗺️ Region',        v.region || '—'],
                                ['🏳️ Country',       v.country || '—'],
                                ['📡 ISP/Org',       v.isp || v.org || '—'],
                                ['🌍 Latitude',      v.lat?.toFixed(4) || '—'],
                                ['🌍 Longitude',     v.lon?.toFixed(4) || '—'],
                                ['📄 Page',          v.page || '/'],
                                ['🔗 Referrer',      v.referrer || 'Direct'],
                                ['💻 User Agent',    v.userAgent ? v.userAgent.slice(0, 80) + (v.userAgent.length > 80 ? '…' : '') : '—'],
                                ['📅 Visited At',    fmtDate(v.visitedAt)],
                                ['🔌 Timezone',      v.timezone || '—'],
                              ].map(([label, value]) => (
                                <div key={label} style={{ padding:'8px 12px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--dim)' }}>
                                  <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginBottom:2 }}>{label}</div>
                                  <div style={{ fontWeight:600, wordBreak:'break-all', color:'var(--text)' }}>{value}</div>
                                </div>
                              ))}
                            </div>
                            {v.lat && v.lon && (
                              <div style={{ marginTop:12 }}>
                                <a
                                  href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lon}&zoom=10`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize:'0.75rem' }}
                                >
                                  🗺️ View on Map
                                </a>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <div style={{ padding:'10px 16px', textAlign:'center', fontSize:'0.78rem', color:'var(--muted)', borderTop:'1px solid var(--border)' }}>
                Showing 100 of {filtered.length} visitors. Export CSV for full list.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Privacy note ── */}
      <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--dim)', borderRadius:'var(--r-sm)', fontSize:'0.75rem', color:'var(--muted)' }}>
        <strong style={{ color:'var(--text)' }}>ℹ️ Privacy Note:</strong> Visitor IP addresses and location data are stored in Firestore for admin analytics only.
        IP geolocation is approximate and based on ISP data. This site collects no personal information from unauthenticated visitors beyond what is shown here.
      </div>
    </div>
  );
}
