import { useState, useMemo } from 'react';

/* ── Helpers ── */
const fmtKsh  = n => 'KSh ' + Number(n || 0).toLocaleString();
const fmtDate = s => { try { return new Date(s).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' }); } catch { return s; } };
const monthKey = ts => { const d = new Date(ts || Date.now()); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); };
const monthLabel = key => { const [y,m] = key.split('-'); return new Date(y, m-1, 1).toLocaleString('en-KE',{month:'short',year:'numeric'}); };

export default function ReportsPanel({ orders = [], showToast }) {
  const [range, setRange] = useState('all'); // all | month | week
  const [exportBusy, setExportBusy] = useState(false);

  /* ── Filter orders by range ── */
  const filteredOrders = useMemo(() => {
    const now = Date.now();
    return orders.filter(o => {
      const ts = o.createdAt || 0;
      if (range === 'week')  return now - ts < 7  * 86400000;
      if (range === 'month') return now - ts < 30 * 86400000;
      return true;
    });
  }, [orders, range]);

  const completed = filteredOrders.filter(o => o.status === 'Completed');
  const pending   = filteredOrders.filter(o => o.status === 'Pending');
  const rejected  = filteredOrders.filter(o => o.status === 'Rejected');

  /* ── Revenue ── */
  const totalRevenue   = completed.reduce((s, o) => s + Number(o.total || 0), 0);
  const avgOrderValue  = completed.length ? Math.round(totalRevenue / completed.length) : 0;
  const totalBooksSold = completed.reduce((s, o) => s + (o.items?.length || 1), 0);
  const pendingRevenue = pending.reduce((s, o) => s + Number(o.total || 0), 0);

  /* ── Revenue by month ── */
  const byMonth = useMemo(() => {
    const map = {};
    completed.forEach(o => {
      const k = monthKey(o.createdAt || o.date);
      if (!map[k]) map[k] = 0;
      map[k] += Number(o.total || 0);
    });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).slice(-8);
  }, [completed]);

  const maxMonthRev = byMonth.length ? Math.max(...byMonth.map(([,v]) => v)) : 1;

  /* ── Top books by revenue ── */
  const bookRevenue = useMemo(() => {
    const map = {};
    completed.forEach(o => {
      (o.items || []).forEach(item => {
        if (!map[item.id]) map[item.id] = { id: item.id, title: item.title, revenue: 0, sold: 0 };
        map[item.id].revenue += Number(item.price || 0);
        map[item.id].sold += 1;
      });
    });
    return Object.values(map).sort((a,b) => b.revenue - a.revenue).slice(0, 8);
  }, [completed]);

  const maxBookRev = bookRevenue.length ? bookRevenue[0].revenue : 1;

  /* ── Payment methods breakdown ── */
  const byMethod = useMemo(() => {
    const map = {};
    completed.forEach(o => {
      const m = o.method || 'unknown';
      if (!map[m]) map[m] = { method: m, count: 0, revenue: 0 };
      map[m].count += 1;
      map[m].revenue += Number(o.total || 0);
    });
    return Object.values(map).sort((a,b) => b.revenue - a.revenue);
  }, [completed]);

  /* ── Export CSV ── */
  const exportCSV = () => {
    setExportBusy(true);
    const rows = [
      ['Order ID', 'Date', 'Customer', 'Email', 'Books', 'Amount (KSh)', 'Method', 'Status'],
      ...filteredOrders.map(o => [
        o.id,
        fmtDate(o.createdAt || o.date),
        o.userName || '',
        o.userEmail || '',
        (o.items || []).map(i => i.title).join(' | '),
        o.total || 0,
        o.method || '',
        o.status || '',
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ellines-haven-orders-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportBusy(false);
    showToast?.('📊 Report exported');
  };

  const methodColors = {
    mpesa:'#2ecc71', airtel:'#e8832a', card:'#4a9eff',
    paystack:'#00c48c', paypal:'#0070f0',
    mpesa_stk:'#2ecc71', wa:'#25D366', unknown:'#64748b',
  };
  const methodLabel = m => ({
    mpesa:'M-Pesa', mpesa_stk:'M-Pesa STK', airtel:'Airtel Money',
    card:'Card', paystack:'Paystack', paypal:'PayPal',
    wa:'WhatsApp', unknown:'Other',
  }[m] || m);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Revenue &amp; Reports</h1>
          <span className="adm-page-sub">Real financial data from Firestore orders</span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* Date range */}
          {['all','month','week'].map(r => (
            <button key={r} className={'adm-filter-btn' + (range===r?' active':'')} onClick={() => setRange(r)}>
              {r === 'all' ? 'All Time' : r === 'month' ? 'Last 30 Days' : 'Last 7 Days'}
            </button>
          ))}
          <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={exportBusy}>
            {exportBusy ? '⏳' : '📊 Export CSV'}
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="adm-stats-grid cols-4" style={{ marginBottom:28 }}>
        {[
          { icon:'💰', label:'Total Revenue',   value: fmtKsh(totalRevenue),           color:'#2ecc71', bg:'rgba(46,204,113,0.1)'  },
          { icon:'📦', label:'Orders Completed',value: completed.length,               color:'#c9a84c', bg:'rgba(201,168,76,0.1)'  },
          { icon:'📚', label:'Books Sold',       value: totalBooksSold,                 color:'#4a9eff', bg:'rgba(74,158,255,0.1)'  },
          { icon:'📊', label:'Avg Order Value',  value: fmtKsh(avgOrderValue),          color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
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

      {/* ── Secondary KPIs ── */}
      <div className="adm-stats-grid cols-4" style={{ marginBottom:28 }}>
        {[
          { icon:'⏳', label:'Pending Orders',   value: pending.length,               color:'#e8832a', bg:'rgba(232,131,42,0.1)'  },
          { icon:'⌛', label:'Pending Revenue',  value: fmtKsh(pendingRevenue),       color:'#e8832a', bg:'rgba(232,131,42,0.08)' },
          { icon:'❌', label:'Rejected Orders',  value: rejected.length,              color:'#e74c3c', bg:'rgba(231,76,60,0.1)'   },
          { icon:'👥', label:'Total Customers',  value: new Set(completed.map(o => o.userEmail)).size, color:'#7eb6ff', bg:'rgba(126,182,255,0.1)' },
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

      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:20, marginBottom:20 }}>

        {/* ── Monthly Revenue Chart ── */}
        <div className="card" style={{ padding:24 }}>
          <h3 style={{ fontSize:'0.95rem', marginBottom:20, color:'var(--gold)' }}>📈 Monthly Revenue</h3>
          {byMonth.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:'0.88rem' }}>
              No completed orders yet.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {byMonth.map(([key, val]) => (
                <div key={key}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:4 }}>
                    <span style={{ color:'var(--text)' }}>{monthLabel(key)}</span>
                    <span style={{ color:'var(--gold)', fontWeight:700 }}>{fmtKsh(val)}</span>
                  </div>
                  <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width: Math.round((val/maxMonthRev)*100)+'%', background:'linear-gradient(90deg,#c9a84c,#e8c96d)', borderRadius:4, transition:'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Payment Methods ── */}
        <div className="card" style={{ padding:24 }}>
          <h3 style={{ fontSize:'0.95rem', marginBottom:20, color:'var(--gold)' }}>💳 By Payment Method</h3>
          {byMethod.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:'0.88rem' }}>No data yet.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {byMethod.map(m => {
                const pct = completed.length ? Math.round((m.count / completed.length) * 100) : 0;
                const color = methodColors[m.method] || '#888';
                return (
                  <div key={m.method}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', marginBottom:5, alignItems:'center' }}>
                      <span style={{ fontWeight:600, color:'var(--text)' }}>{methodLabel(m.method)}</span>
                      <div style={{ display:'flex', gap:12 }}>
                        <span style={{ color:'var(--muted)' }}>{m.count} orders</span>
                        <span style={{ color, fontWeight:700 }}>{fmtKsh(m.revenue)}</span>
                      </div>
                    </div>
                    <div style={{ height:7, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:4, opacity:0.85 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Top Books by Revenue ── */}
      <div className="card" style={{ padding:24, marginBottom:20 }}>
        <h3 style={{ fontSize:'0.95rem', marginBottom:20, color:'var(--gold)' }}>📚 Top Books by Revenue</h3>
        {bookRevenue.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)', fontSize:'0.88rem' }}>No completed orders yet.</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {bookRevenue.map((b, i) => (
              <div key={b.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--dim)', borderRadius:'var(--r-sm)' }}>
                <span style={{ width:22, height:22, borderRadius:'50%', background:'rgba(201,168,76,0.15)', color:'var(--gold)', fontWeight:700, fontSize:'0.75rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'0.82rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.title}</div>
                  <div style={{ display:'flex', gap:10, marginTop:4 }}>
                    <div style={{ height:5, flex:1, background:'rgba(255,255,255,0.05)', borderRadius:3 }}>
                      <div style={{ height:'100%', width:Math.round((b.revenue/maxBookRev)*100)+'%', background:'var(--grad-gold)', borderRadius:3 }} />
                    </div>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--gold)' }}>{fmtKsh(b.revenue)}</div>
                  <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{b.sold} sold</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Completed Orders Table ── */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div className="adm-card-head">
          <h3>Recent Completed Orders</h3>
          <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{completed.length} total</span>
        </div>
        {completed.length === 0 ? (
          <div className="adm-empty"><p>No completed orders in this range.</p></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Books</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {completed.slice(0,20).map(o => (
                  <tr key={o.id}>
                    <td><code className="adm-code">{o.id?.slice(-8)}</code></td>
                    <td>
                      <strong style={{ fontSize:'0.82rem' }}>{o.userName}</strong>
                      <span className="adm-book-author">{o.userEmail}</span>
                    </td>
                    <td style={{ fontSize:'0.78rem', color:'var(--muted)', maxWidth:200 }}>
                      {(o.items||[]).map(i=>i.title).join(', ').slice(0,60) + ((o.items||[]).map(i=>i.title).join(', ').length>60?'…':'')}
                    </td>
                    <td><strong style={{ color:'var(--gold)' }}>{fmtKsh(o.total)}</strong></td>
                    <td><span className="adm-method-badge">{methodLabel(o.method)}</span></td>
                    <td style={{ fontSize:'0.78rem', color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtDate(o.createdAt || o.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
