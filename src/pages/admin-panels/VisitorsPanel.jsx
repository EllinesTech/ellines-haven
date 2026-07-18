import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, deleteDoc, writeBatch, updateDoc, getDocs } from 'firebase/firestore';
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

/** Fetch geo info for an IP using ip-api.com (free, no key needed) */
async function fetchGeoForIp(ip) {
  if (!ip || ip === 'unknown' || ip === '' || ip.startsWith('127.') || ip.startsWith('::1')) return null;
  try {
    const res = await fetch(`https://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp,org,timezone,query`);
    const data = await res.json();
    if (data.status === 'success') return data;
  } catch {}
  return null;
}

/** Get the visitor's real IP using ipify */
async function getMyIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || null;
  } catch { return null; }
}

export default function VisitorsPanel({ showToast }) {
  const [visitors, setVisitors]     = useState([]);
  const [loading,  setLoading]      = useState(true);
  const [stats,    setStats]        = useState({ total: 0, today: 0, unique: 0, countries: 0 });
  const [filter,   setFilter]       = useState('all');
  const [search,   setSearch]       = useState('');
  const [selected, setSelected]     = useState(null);
  const [exporting, setExporting]   = useState(false);
  const [clearing,  setClearing]    = useState(false);
  const [enriching, setEnriching]   = useState(false);
  const [geoCache,  setGeoCache]    = useState({});  // ip → geo data cache

  // ── Firestore listener ──────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'site_visitors'), orderBy('visitedAtMs', 'desc'), limit(500));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setVisitors(data);
      calcStats(data);
      setLoading(false);
    }, err => {
      console.error('[VisitorsPanel] Listener error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Auto-enrich visitors that are missing geo data ───────────────────────────
  useEffect(() => {
    if (loading || visitors.length === 0) return;
    const needsGeo = visitors.filter(v => v._needsGeo && !geoCache[v.id]);
    if (needsGeo.length === 0) return;

    // Process up to 5 at a time to avoid rate limiting ip-api (45 req/min free)
    const batch = needsGeo.slice(0, 5);
    batch.forEach(async (v) => {
      // Get IP: try the stored rawIp first, then the stored ip field
      const ip = v.rawIp || v.ip || null;
      if (!ip) return;
      const geo = await fetchGeoForIp(ip);
      if (!geo) return;

      // Update Firestore doc with geo data
      try {
        await updateDoc(doc(db, 'site_visitors', v.id), {
          ip:          geo.query || ip,
          city:        geo.city || '',
          region:      geo.regionName || '',
          country:     geo.country || '',
          countryCode: geo.countryCode || '',
          lat:         geo.lat || null,
          lon:         geo.lon || null,
          isp:         geo.isp || geo.org || '',
          org:         geo.org || '',
          timezone:    geo.timezone || '',
          _needsGeo:   false,
        });
      } catch {}

      // Cache locally too
      setGeoCache(prev => ({ ...prev, [v.id]: geo }));
    });
  }, [visitors, loading]);

  const calcStats = (data) => {
    const now   = Date.now();
    const today = data.filter(v => {
      const ts = typeof v.visitedAtMs === 'number' ? v.visitedAtMs : v.visitedAt?.toMillis?.() || 0;
      return now - ts < 86400000;
    }).length;
    const unique    = new Set(data.map(v => v.ip || v.rawIp).filter(Boolean)).size;
    const countries = new Set(data.map(v => v.country).filter(Boolean)).size;
    setStats({ total: data.length, today, unique, countries });
  };

  // ── Delete a single visitor record ───────────────────────────────────────────
  const deleteVisitor = async (id) => {
    try {
      await deleteDoc(doc(db, 'site_visitors', id));
      if (selected?.id === id) setSelected(null);
      showToast?.('🗑️ Visitor record deleted');
    } catch (e) {
      showToast?.('❌ Delete failed: ' + e.message);
    }
  };

  // ── Clear all visitor records ─────────────────────────────────────────────────
  const clearAll = async () => {
    if (!window.confirm(`Delete ALL ${visitors.length} visitor records? This cannot be undone.`)) return;
    setClearing(true);
    try {
      const snap = await getDocs(collection(db, 'site_visitors'));
      // Delete in batches of 500
      const chunks = [];
      let current = writeBatch(db);
      let count = 0;
      snap.docs.forEach(d => {
        current.delete(d.ref);
        count++;
        if (count === 499) { chunks.push(current); current = writeBatch(db); count = 0; }
      });
      if (count > 0) chunks.push(current);
      await Promise.all(chunks.map(b => b.commit()));
      setSelected(null);
      showToast?.('🗑️ All visitor records cleared');
    } catch (e) {
      showToast?.('❌ Clear failed: ' + e.message);
    }
    setClearing(false);
  };

  // ── Manually enrich all missing IPs ──────────────────────────────────────────
  const enrichAll = async () => {
    setEnriching(true);
    showToast?.('🔍 Looking up IP addresses... this may take a moment');
    const missing = visitors.filter(v => !v.country && (v.rawIp || v.ip));
    let done = 0;
    for (const v of missing.slice(0, 30)) {  // max 30 to respect rate limits
      const ip = v.rawIp || v.ip;
      const geo = await fetchGeoForIp(ip);
      if (geo) {
        try {
          await updateDoc(doc(db, 'site_visitors', v.id), {
            ip: geo.query || ip, city: geo.city || '', region: geo.regionName || '',
            country: geo.country || '', countryCode: geo.countryCode || '',
            lat: geo.lat || null, lon: geo.lon || null,
            isp: geo.isp || geo.org || '', org: geo.org || '', timezone: geo.timezone || '',
            _needsGeo: false,
          });
          done++;
        } catch {}
      }
      // Small delay to avoid rate limit (45 req/min = ~1.3 req/sec)
      await new Promise(r => setTimeout(r, 800));
    }
    showToast?.(`✅ Enriched ${done} visitor records with IP data`);
    setEnriching(false);
  };

  // ── Test visit ────────────────────────────────────────────────────────────────
  const simulateVisit = async () => {
    try {
      const ip = await getMyIp();
      const { addDoc, serverTimestamp } = await import('firebase/firestore');
      const geo = ip ? await fetchGeoForIp(ip) : null;
      await addDoc(collection(db, 'site_visitors'), {
        ip:          geo?.query || ip || '0.0.0.0',
        city:        geo?.city || 'Test City',
        region:      geo?.regionName || '',
        country:     geo?.country || 'Kenya',
        countryCode: geo?.countryCode || 'ke',
        lat:         geo?.lat || -1.2864, lon: geo?.lon || 36.8172,
        isp:         geo?.isp || 'Test ISP',
        org:         geo?.org || '',
        timezone:    geo?.timezone || 'Africa/Nairobi',
        page:        '/library',
        referrer:    'admin-test',
        userAgent:   navigator.userAgent.slice(0, 200),
        device:      'Desktop',
        rawIp:       ip || '0.0.0.0',
        visitedAt:   serverTimestamp(),
        visitedAtMs: Date.now(),
        _needsGeo:   false,
        _isTest:     true,
      });
      showToast?.('✅ Test visit recorded with real IP data');
    } catch (e) {
      showToast?.('❌ Test failed: ' + e.message);
    }
  };

  // ── Filters ───────────────────────────────────────────────────────────────────
  const filtered = visitors.filter(v => {
    if (filter === 'today') {
      const ts = typeof v.visitedAtMs === 'number' ? v.visitedAtMs : v.visitedAt?.toMillis?.() || 0;
      if (Date.now() - ts >= 86400000) return false;
    }
    if (filter === 'week') {
      const ts = typeof v.visitedAtMs === 'number' ? v.visitedAtMs : v.visitedAt?.toMillis?.() || 0;
      if (Date.now() - ts >= 7 * 86400000) return false;
    }
    if (!search) {
      // SUPER ADMIN GHOST MODE: Filter out super admin's visitor records
      // Super admin's site visits should not be tracked/visible to other admins
      const SUPER_ADMIN_EMAIL = 'ellines.haven@gmail.com';
      if (v.userEmail?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        return false; // Hide super admin's visitor record
      }
      return true;
    }
    const q = search.toLowerCase();
    return (
      v.ip?.includes(q) || v.rawIp?.includes(q) ||
      v.city?.toLowerCase().includes(q) ||
      v.country?.toLowerCase().includes(q) ||
      v.page?.toLowerCase().includes(q) ||
      v.userEmail?.toLowerCase().includes(q) ||
      v.isp?.toLowerCase().includes(q)
    );
  });

  const exportCSV = () => {
    setExporting(true);
    const rows = [
      ['Time', 'IP', 'City', 'Region', 'Country', 'ISP', 'Page', 'Referrer', 'Device', 'User', 'Timezone'],
      ...filtered.map(v => [
        fmtDate(v.visitedAtMs || v.visitedAt),
        v.ip || v.rawIp || '',
        v.city || '', v.region || '', v.country || '', v.isp || '',
        v.page || '', v.referrer || '', v.device || '',
        v.userEmail || '', v.timezone || '',
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `visitors-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    showToast?.('📊 Exported');
  };

  // Top countries / pages charts
  const countryMap = {};
  visitors.forEach(v => { if (v.country) countryMap[v.country] = (countryMap[v.country] || 0) + 1; });
  const topCountries = Object.entries(countryMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const maxCC = topCountries[0]?.[1] || 1;

  const pageMap = {};
  visitors.forEach(v => { const p = v.page || '/'; pageMap[p] = (pageMap[p] || 0) + 1; });
  const topPages = Object.entries(pageMap).sort((a,b) => b[1]-a[1]).slice(0, 8);

  const missingGeoCount = visitors.filter(v => !v.country && (v.rawIp || v.ip)).length;

  return (
    <div className="adm-page">
      {/* ── Header ── */}
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
          <button className="btn btn-ghost btn-sm" onClick={simulateVisit}
            style={{ background:'rgba(74,158,255,0.08)', color:'#4a9eff', border:'1px solid rgba(74,158,255,0.2)' }}>
            🧪 Test Visit
          </button>
          {missingGeoCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={enrichAll} disabled={enriching}
              style={{ background:'rgba(46,204,113,0.08)', color:'#2ecc71', border:'1px solid rgba(46,204,113,0.2)' }}>
              {enriching ? '⏳ Enriching…' : `🔍 Enrich ${missingGeoCount} IPs`}
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={exporting}>
            {exporting ? '⏳' : '📊 Export CSV'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearAll} disabled={clearing}
            style={{ background:'rgba(231,76,60,0.08)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.2)' }}>
            {clearing ? '⏳ Clearing…' : '🗑️ Clear All'}
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="adm-stats-grid cols-4" style={{ marginBottom:24 }}>
        {[
          { icon:'👥', label:'Total Visits',  value: stats.total,     color:'#c9a84c', bg:'rgba(201,168,76,0.1)' },
          { icon:'📅', label:'Today',         value: stats.today,     color:'#2ecc71', bg:'rgba(46,204,113,0.1)' },
          { icon:'🌐', label:'Unique IPs',    value: stats.unique,    color:'#4a9eff', bg:'rgba(74,158,255,0.1)' },
          { icon:'🗺️', label:'Countries',     value: stats.countries, color:'#a855f7', bg:'rgba(168,85,247,0.1)' },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card">
            <div className="adm-stat-icon" style={{ background:s.bg, fontSize:'1.4rem' }}>{s.icon}</div>
            <div className="adm-stat-body">
              <strong style={{ color:s.color, fontSize:'1.5rem' }}>{loading ? '…' : s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:16, color:'var(--gold)' }}>🗺️ Top Countries</h3>
          {topCountries.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:'0.82rem' }}>No geo data yet. Click "Enrich IPs" above.</div>
          ) : topCountries.map(([country, count]) => (
            <div key={country} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:4 }}>
                <span style={{ color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>
                  <img src={`${FLAG_BASE}${country.slice(0,2).toLowerCase()}.png`} alt="" style={{ width:16, height:12, borderRadius:2 }} onError={e=>{e.target.style.display='none'}} />
                  {country}
                </span>
                <span style={{ color:'var(--gold)', fontWeight:700 }}>{count}</span>
              </div>
              <div style={{ height:6, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:Math.round((count/maxCC)*100)+'%', background:'linear-gradient(90deg,#c9a84c,#e8c96d)', borderRadius:3 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontSize:'0.92rem', marginBottom:16, color:'var(--gold)' }}>📄 Top Pages</h3>
          {topPages.map(([page, count], i) => (
            <div key={page} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ width:20, fontSize:'0.7rem', color:'var(--muted)' }}>{i+1}</span>
              <span style={{ flex:1, fontSize:'0.8rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace', color:'var(--text)' }}>{page}</span>
              <span style={{ fontSize:'0.78rem', color:'var(--gold)', fontWeight:700 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ marginBottom:12 }}>
        <input className="field" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search by IP, city, country, page, or user…" style={{ maxWidth:420 }} />
      </div>

      {/* ── Table ── */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontWeight:600, fontSize:'0.88rem' }}>
            👤 Recent Visitors <span style={{ color:'var(--muted)', fontWeight:400, fontSize:'0.8rem' }}>({filtered.length})</span>
          </span>
          {selected && <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>✕ Close</button>}
        </div>

        {loading ? (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--muted)' }}>Loading visitor data…</div>
        ) : filtered.length === 0 ? (
          <div className="adm-empty">
            <div style={{ fontSize:'2.5rem', marginBottom:10 }}>👥</div>
            <p>No visitors found. They are tracked automatically when browsing the site.</p>
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
                  <th style={{ width:100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map(v => (
                  <>
                    <tr key={v.id}
                      style={{ cursor:'pointer', background: selected?.id===v.id ? 'rgba(201,168,76,0.06)' : 'transparent' }}
                      onClick={()=>setSelected(selected?.id===v.id ? null : v)}>
                      <td style={{ fontSize:'0.72rem', color:'var(--muted)', whiteSpace:'nowrap' }}>
                        <div>{fmtDate(v.visitedAtMs || v.visitedAt)}</div>
                        <div style={{ color:'var(--gold)', fontSize:'0.68rem' }}>{fmtRelative(v.visitedAtMs || v.visitedAt)}</div>
                      </td>
                      <td>
                        {v.ip || v.rawIp ? (
                          <code style={{ fontSize:'0.78rem', color:'#7eb6ff', background:'rgba(74,158,255,0.08)', padding:'2px 6px', borderRadius:4 }}>
                            {v.ip || v.rawIp}
                          </code>
                        ) : (
                          <span style={{ color:'var(--muted)', fontSize:'0.75rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize:'0.8rem' }}>
                        {v.country ? (
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            {v.countryCode && <img src={`${FLAG_BASE}${v.countryCode.toLowerCase()}.png`} alt="" style={{ width:16, height:12, borderRadius:2 }} onError={e=>{e.target.style.display='none'}} />}
                            <span>{[v.city, v.region, v.country].filter(Boolean).join(', ')}</span>
                          </div>
                        ) : (
                          <span style={{ color:'var(--muted)', fontSize:'0.75rem' }}>—</span>
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
                        {v.userEmail && <div style={{ color:'var(--gold)', fontSize:'0.68rem', marginTop:2 }}>👤 {v.userEmail}</div>}
                      </td>
                      <td onClick={e=>e.stopPropagation()}>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="adm-act-btn adm-act-edit" onClick={()=>setSelected(selected?.id===v.id ? null : v)}>
                            {selected?.id===v.id ? 'Hide' : 'Details'}
                          </button>
                          <button className="adm-act-btn adm-act-del"
                            style={{ background:'rgba(231,76,60,0.1)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.2)' }}
                            onClick={()=>{ if(window.confirm('Delete this visitor record?')) deleteVisitor(v.id); }}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                    {selected?.id === v.id && (
                      <tr key={v.id+'_detail'}>
                        <td colSpan={7} style={{ background:'rgba(255,255,255,0.02)', padding:0 }}>
                          <div style={{ padding:'16px 20px', borderLeft:'3px solid var(--gold)' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12, fontSize:'0.8rem' }}>
                              {[
                                ['🌐 IP Address', v.ip || v.rawIp || '—'],
                                ['📍 City',       v.city || '—'],
                                ['🗺️ Region',     v.region || '—'],
                                ['🏳️ Country',    v.country || '—'],
                                ['📡 ISP/Org',    v.isp || v.org || '—'],
                                ['🌍 Latitude',   v.lat?.toFixed(4) || '—'],
                                ['🌍 Longitude',  v.lon?.toFixed(4) || '—'],
                                ['📄 Page',       v.page || '/'],
                                ['🔗 Referrer',   v.referrer || 'Direct'],
                                ['💻 User Agent', v.userAgent ? v.userAgent.slice(0,80)+(v.userAgent.length>80?'…':'') : '—'],
                                ['📅 Visited At', fmtDate(v.visitedAtMs || v.visitedAt)],
                                ['🔌 Timezone',   v.timezone || '—'],
                              ].map(([label, value]) => (
                                <div key={label} style={{ padding:'8px 12px', background:'var(--bg)', borderRadius:'var(--r-sm)', border:'1px solid var(--dim)' }}>
                                  <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginBottom:2 }}>{label}</div>
                                  <div style={{ fontWeight:600, wordBreak:'break-all', color:'var(--text)' }}>{value}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                              {v.lat && v.lon && (
                                <a href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lon}&zoom=10`}
                                  target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize:'0.75rem' }}>
                                  🗺️ View on Map
                                </a>
                              )}
                              {(v.ip || v.rawIp) && !v.country && (
                                <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.75rem', color:'#2ecc71' }}
                                  onClick={async () => {
                                    const geo = await fetchGeoForIp(v.ip || v.rawIp);
                                    if (geo) {
                                      await updateDoc(doc(db, 'site_visitors', v.id), {
                                        ip: geo.query || v.ip, city: geo.city || '', region: geo.regionName || '',
                                        country: geo.country || '', countryCode: geo.countryCode || '',
                                        lat: geo.lat || null, lon: geo.lon || null,
                                        isp: geo.isp || '', org: geo.org || '', timezone: geo.timezone || '',
                                        _needsGeo: false,
                                      });
                                      showToast?.('✅ IP enriched: ' + geo.city + ', ' + geo.country);
                                    } else {
                                      showToast?.('❌ Could not lookup IP: ' + (v.ip || v.rawIp));
                                    }
                                  }}>
                                  🔍 Lookup IP
                                </button>
                              )}
                              <button className="btn btn-ghost btn-sm"
                                style={{ fontSize:'0.75rem', color:'#e74c3c' }}
                                onClick={()=>{ if(window.confirm('Delete this record?')) deleteVisitor(v.id); }}>
                                🗑️ Delete Record
                              </button>
                            </div>
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

      <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--dim)', borderRadius:'var(--r-sm)', fontSize:'0.75rem', color:'var(--muted)' }}>
        <strong style={{ color:'var(--text)' }}>ℹ️ Privacy Note:</strong> Visitor IP addresses and location data are stored in Firestore for admin analytics only. IP geolocation is approximate and based on ISP data.
      </div>
    </div>
  );
}
