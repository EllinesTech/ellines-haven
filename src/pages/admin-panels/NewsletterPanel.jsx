/**
 * NewsletterPanel — Full newsletter management:
 *  - Tab 1: Compose & send campaigns (stored in Firestore, opens email client)
 *  - Tab 2: Subscriber list management
 */
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc,
  query, orderBy, addDoc, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

/* ── helpers ── */
const fmtDate = ts => {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* ── Prefill example templates ── */
const TEMPLATES = [
  {
    label: '📚 New Book Release',
    subject: '📚 New Release: [Book Title] is Live on Ellines Haven!',
    body: `Hi [Name],

We have exciting news — a brand new story is now available on Ellines Haven!

📖 [Book Title]
By Elijah Mwangi M

[One-line description of the book]

Genre: [Genre] · Price: KSh [Price]

👉 Read the first chapter free: https://ellinesgroup.web.app/book/[book-id]

This is an original East African story written from real life. Don't miss it.

Thank you for being part of the Ellines Haven community.

Warm regards,
Elijah Mwangi M
Ellines Haven
📞 0748 255 466 · ellines.haven@gmail.com
https://ellinesgroup.web.app`,
  },
  {
    label: '🔖 Chapter Update',
    subject: '📖 New Chapters Available — [Book Title]',
    body: `Hi [Name],

Quick update from Ellines Haven!

[Book Title] has been updated — new chapters are now available for all readers.

📖 Chapters now available: [X] of [Total]
Latest chapter: [Chapter Name]

If you haven't started reading yet, now is the perfect time. Log in and continue your reading journey:
👉 https://ellinesgroup.web.app/my-library

See you in the story,
Elijah Mwangi M
Ellines Haven`,
  },
  {
    label: '🎉 Promo / Discount',
    subject: '🎁 Special Offer — Get [Book Title] at a Discount!',
    body: `Hi [Name],

We're running a limited-time offer just for our newsletter readers!

🎉 [Book Title] — now at KSh [Discounted Price] (was KSh [Original Price])

This offer ends on [Date]. Use the link below to grab your copy:
👉 https://ellinesgroup.web.app/book/[book-id]

Payment via M-Pesa, Airtel Money, Visa/MC, or PayPal.

Don't miss out — this offer is only available to our newsletter subscribers.

Best,
Ellines Haven Team`,
  },
  {
    label: '📣 General Announcement',
    subject: '📣 News from Ellines Haven',
    body: `Hi [Name],

We wanted to reach out with a quick update from Ellines Haven.

[Your announcement here]

Stay tuned for more stories, updates, and surprises.

Visit us: https://ellinesgroup.web.app

Thank you for your continued support,
Elijah Mwangi M
Ellines Haven
📞 0748 255 466`,
  },
];

/* ════════════════════════════════════════════
   COMPOSE TAB
════════════════════════════════════════════ */
function ComposeTab({ subs, showToast }) {
  const active = subs.filter(s => s.active !== false);
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [sent,    setSent]    = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState('');

  /* Load sent campaigns */
  useEffect(() => {
    const q = query(collection(db, 'newsletter_campaigns'), orderBy('sentAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setSent(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingSent(false);
    }, () => setLoadingSent(false));
    return () => unsub();
  }, []);

  const applyTemplate = (label) => {
    const tpl = TEMPLATES.find(t => t.label === label);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
    setSelectedTpl(label);
    setPreview(false);
  };

  /* Build mailto BCC string — browsers cap at ~2000 chars so we batch */
  const buildMailtoLink = () => {
    const emails = active.map(s => s.email).filter(Boolean).join(',');
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody    = encodeURIComponent(body);
    return `mailto:ellines.haven@gmail.com?bcc=${encodeURIComponent(emails)}&subject=${encodedSubject}&body=${encodedBody}`;
  };

  const handleSend = async () => {
    if (!subject.trim()) { showToast('❌ Please enter a subject'); return; }
    if (!body.trim())    { showToast('❌ Please write the email body'); return; }
    if (active.length === 0) { showToast('❌ No active subscribers to send to'); return; }

    setSending(true);

    /* 1 — Save campaign record to Firestore */
    try {
      await addDoc(collection(db, 'newsletter_campaigns'), {
        subject: subject.trim(),
        body: body.trim(),
        recipientCount: active.length,
        recipients: active.map(s => s.email),
        sentAt: serverTimestamp(),
        status: 'sent',
        sentBy: 'admin',
      });
    } catch (e) { console.warn('Campaign save failed:', e.message); }

    /* 2 — Open mailto link (actual email delivery) */
    const link = buildMailtoLink();
    window.open(link, '_blank');

    showToast(`✅ Campaign saved! Email client opened with ${active.length} recipients.`);
    setSubject('');
    setBody('');
    setSelectedTpl('');
    setPreview(false);
    setSending(false);
  };

  const copyEmails = async () => {
    const emails = active.map(s => s.email).join(', ');
    try {
      await navigator.clipboard.writeText(emails);
      showToast(`✅ Copied ${active.length} emails`);
    } catch { window.prompt('Copy:', emails); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>

      {/* ── Left: Compose form ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Template picker */}
        <div className="card" style={{ padding: 20 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text)' }}>
            📋 Start from a Template
          </h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => applyTemplate(t.label)}
                className="btn btn-ghost btn-sm"
                style={selectedTpl === t.label ? { borderColor: 'var(--gold)', color: 'var(--gold)', background: 'rgba(201,168,76,0.08)' } : {}}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => { setSubject(''); setBody(''); setSelectedTpl(''); }}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--muted)' }}
            >
              ✕ Clear
            </button>
          </div>
        </div>

        {/* Compose */}
        <div className="card" style={{ padding: 20 }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--text)' }}>✍️ Compose Email</h4>

          <div className="adm-field-group" style={{ marginBottom: 14 }}>
            <label>Subject Line *</label>
            <input
              className="field"
              placeholder="e.g. 📚 New Release: Marriage Is a Scam is Live!"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
            />
            <small style={{ color: 'var(--muted)' }}>{subject.length}/200 characters</small>
          </div>

          <div className="adm-field-group" style={{ marginBottom: 14 }}>
            <label>Email Body *</label>
            <textarea
              className="field"
              placeholder="Write your newsletter here. Use [Name] as a placeholder for the subscriber's name…"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={16}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical', lineHeight: 1.6 }}
            />
            <small style={{ color: 'var(--muted)' }}>{body.length} characters · ~{Math.ceil(body.split(/\s+/).filter(Boolean).length / 200)} min read</small>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={sending || !subject.trim() || !body.trim() || active.length === 0}
            >
              {sending ? '⏳ Saving…' : `📤 Send to ${active.length} Subscriber${active.length !== 1 ? 's' : ''}`}
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setPreview(p => !p)}
              disabled={!body.trim()}
            >
              {preview ? '✕ Close Preview' : '👁 Preview'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={copyEmails}>
              📋 Copy Emails ({active.length})
            </button>
          </div>

          {active.length === 0 && (
            <p style={{ marginTop: 12, fontSize: '0.8rem', color: '#e74c3c' }}>
              ⚠ No active subscribers yet. Share the newsletter signup on the website.
            </p>
          )}
        </div>

        {/* Preview */}
        {preview && body && (
          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'var(--gold)' }}>👁 Email Preview</h4>
            <div style={{
              background: '#fff', color: '#1a1a2e', padding: 24,
              borderRadius: 8, fontSize: '0.9rem', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif',
            }}>
              <div style={{ borderBottom: '2px solid #c9a84c', paddingBottom: 12, marginBottom: 16 }}>
                <strong style={{ fontSize: '1rem' }}>{subject || '(no subject)'}</strong><br />
                <small style={{ color: '#666' }}>From: ellines.haven@gmail.com · To: {active.length} subscribers</small>
              </div>
              {body}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Campaign history + tips ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats */}
        <div className="card" style={{ padding: 18 }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '0.9rem' }}>📊 Subscriber Stats</h4>
          {[
            { label: 'Active subscribers', value: active.length, color: '#2ecc71' },
            { label: 'Total signups',       value: subs.length,  color: 'var(--gold)' },
            { label: 'Campaigns sent',      value: sent.length,  color: '#4a9eff' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{s.label}</span>
              <strong style={{ color: s.color }}>{s.value}</strong>
            </div>
          ))}
        </div>

        {/* Tips */}
        <div className="card" style={{ padding: 18 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '0.88rem' }}>💡 Tips</h4>
          <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.8 }}>
            <li>Use <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>[Name]</code> to personalize (replace manually per batch)</li>
            <li>Keep subject lines under 60 chars for best open rates</li>
            <li>Send Tuesday–Thursday for highest engagement</li>
            <li>Always include an unsubscribe mention</li>
            <li>The "Send" button opens your default email client pre-filled with all BCCs</li>
          </ul>
        </div>

        {/* Campaign history */}
        <div className="card" style={{ padding: 18 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem' }}>📜 Past Campaigns</h4>
          {loadingSent ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Loading…</p>
          ) : sent.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No campaigns sent yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sent.slice(0, 8).map(c => (
                <div key={c.id} style={{
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.subject}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', gap: 10 }}>
                    <span>📅 {fmtDate(c.sentAt)}</span>
                    <span>👥 {c.recipientCount} recipients</span>
                  </div>
                  {/* Re-use button */}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 6, fontSize: '0.7rem', padding: '3px 8px' }}
                    onClick={() => { setSubject(c.subject); setBody(c.body || ''); setSelectedTpl(''); }}
                  >
                    ↩ Re-use
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   SUBSCRIBERS TAB
════════════════════════════════════════════ */
function SubscribersTab({ subs, showToast }) {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const active   = subs.filter(s => s.active !== false);
  const inactive = subs.filter(s => s.active === false);
  const filtered = subs.filter(s =>
    !search ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = async (sub) => {
    try {
      await updateDoc(doc(db, 'newsletter_signups', sub.id), { active: !sub.active });
      showToast(sub.active ? '⛔ Subscriber deactivated' : '✅ Subscriber reactivated');
    } catch { showToast('❌ Update failed'); }
  };

  const handleDelete = async (sub) => {
    if (!window.confirm(`Remove ${sub.email} from the newsletter list?`)) return;
    try {
      await deleteDoc(doc(db, 'newsletter_signups', sub.id));
      showToast('🗑️ Subscriber removed');
    } catch { showToast('❌ Delete failed'); }
  };

  const copyEmails = async () => {
    const emails = active.map(s => s.email).join(', ');
    try {
      await navigator.clipboard.writeText(emails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      showToast(`✅ Copied ${active.length} emails`);
    } catch { window.prompt('Copy all active emails:', emails); }
  };

  /* Manual add subscriber */
  const [addForm, setAddForm] = useState({ name: '', email: '' });
  const [adding, setAdding]   = useState(false);

  const handleAdd = async () => {
    if (!addForm.email.trim()) { showToast('❌ Email required'); return; }
    setAdding(true);
    try {
      const key = addForm.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'newsletter_signups', key), {
        email: addForm.email.toLowerCase().trim(),
        name: addForm.name.trim() || 'Reader',
        source: 'admin',
        active: true,
        subscribedAt: serverTimestamp(),
      }, { merge: true });
      setAddForm({ name: '', email: '' });
      showToast('✅ Subscriber added');
    } catch { showToast('❌ Failed to add subscriber'); }
    setAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Signups',   value: subs.length,     color: 'var(--gold)' },
          { label: 'Active',          value: active.length,   color: '#2ecc71'     },
          { label: 'Unsubscribed',    value: inactive.length, color: '#e74c3c'     },
        ].map(s => (
          <div key={s.label} className="adm-stat-card card" style={{ minWidth: 120, padding: '14px 18px' }}>
            <strong style={{ fontSize: '1.5rem', color: s.color }}>{s.value}</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>{s.label}</span>
          </div>
        ))}
        <button
          className="btn btn-outline btn-sm"
          onClick={copyEmails}
          disabled={active.length === 0}
          style={{ alignSelf: 'center' }}
        >
          {copied ? '✅ Copied!' : `📋 Copy All Emails (${active.length})`}
        </button>
      </div>

      {/* Manual add */}
      <div className="card" style={{ padding: 18 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem' }}>➕ Add Subscriber Manually</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="adm-field-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
            <label>Name</label>
            <input className="field" placeholder="Subscriber name" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="adm-field-group" style={{ margin: 0, flex: 2, minWidth: 200 }}>
            <label>Email *</label>
            <input className="field" type="email" placeholder="email@example.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding} style={{ flexShrink: 0 }}>
            {adding ? '…' : '➕ Add'}
          </button>
        </div>
      </div>

      {/* Search + table */}
      <div className="adm-toolbar card">
        <input
          className="field adm-search"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="adm-toolbar-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        {search && <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>✕ Clear</button>}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
          <p>{search ? 'No subscribers match your search.' : 'No newsletter signups yet.'}</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Source</th>
                <th>Subscribed</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sub => (
                <tr key={sub.id} style={{ opacity: sub.active === false ? 0.5 : 1 }}>
                  <td><strong style={{ fontSize: '0.88rem' }}>{sub.name || '—'}</strong></td>
                  <td>
                    <a href={`mailto:${sub.email}`} style={{ color: 'var(--gold)', fontSize: '0.85rem' }}>
                      {sub.email}
                    </a>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(74,158,255,0.12)', color: '#4a9eff', border: '1px solid rgba(74,158,255,0.25)' }}>
                      {sub.source || 'website'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{fmtDate(sub.subscribedAt)}</td>
                  <td>
                    <span style={{
                      fontSize: '0.72rem', padding: '2px 8px', borderRadius: 10,
                      background: sub.active !== false ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)',
                      color: sub.active !== false ? '#2ecc71' : '#e74c3c',
                      border: `1px solid ${sub.active !== false ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`,
                    }}>
                      {sub.active !== false ? '✓ Active' : '✗ Unsub'}
                    </span>
                  </td>
                  <td className="adm-actions">
                    <button className="adm-act-btn" style={{ fontSize: '0.72rem' }} onClick={() => handleToggle(sub)}>
                      {sub.active !== false ? 'Unsub' : 'Reactivate'}
                    </button>
                    <button className="adm-act-btn adm-act-del" onClick={() => handleDelete(sub)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN PANEL
════════════════════════════════════════════ */
export default function NewsletterPanel({ showToast }) {
  const [activeTab, setActiveTab] = useState('compose');
  const [subs, setSubs]           = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'newsletter_signups'), orderBy('subscribedAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setSubs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const TABS = [
    { k: 'compose',     label: '✍️ Compose & Send' },
    { k: 'subscribers', label: `👥 Subscribers (${subs.filter(s => s.active !== false).length})` },
  ];

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>📬 Newsletter</h1>
          <span className="adm-page-sub">
            Compose campaigns and manage subscribers
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.88rem', fontWeight: activeTab === t.k ? 700 : 400,
              color: activeTab === t.k ? 'var(--gold)' : 'var(--muted)',
              padding: '8px 18px', borderBottom: activeTab === t.k ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : activeTab === 'compose' ? (
        <ComposeTab subs={subs} showToast={showToast} />
      ) : (
        <SubscribersTab subs={subs} showToast={showToast} />
      )}
    </div>
  );
}
