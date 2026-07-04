import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import './Contact.css';

const WA_NUMBER = '254748255466';
const WA_LINK   = `https://wa.me/${WA_NUMBER}`;

const CONTACT_DEFAULTS = {
  page_title:      'Get in Touch',
  page_sub:        "We'd love to hear from you",
  details_heading: 'Contact Details',
  details_sub:     'Reach out with any questions, feedback, or partnership inquiries. Our team in Nairobi is happy to help.',
  wa_label:        'Chat on WhatsApp',
  wa_sub:          '0748 255 466 — We reply fast',
  phone:           '0748 255 466',
  email:           'ellines.haven@gmail.com',
  location:        'Nairobi, Kenya',
  response_wa:     'Usually within 1 hour',
  response_email:  'Within 24 hours',
  response_phone:  'Mon–Sat, 8am–8pm EAT',
  form_heading:    'Send a Message',
  form_btn:        'Send via WhatsApp',
  sent_heading:    'Message Sent via WhatsApp!',
  sent_sub:        "Your message has been forwarded to our WhatsApp. We'll reply shortly.",
};

export default function Contact() {
  const [form, setForm] = useState({ name:'', email:'', subject:'', message:'' });
  const [sent, setSent] = useState(false);
  const [c, setC] = useState(CONTACT_DEFAULTS);
  const editCtx = useEditMode();

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'contact_content')).then(snap => {
      const fsData = snap.exists() ? snap.data() : {};
      const merged = { ...CONTACT_DEFAULTS, ...fsData };
      setC(merged);
    }).catch(() => {});
  }, []);

  // Merge edit context on top when editing this page
  const cv = (editCtx?.editMode && editCtx?.pageKey === 'contact_content')
    ? { ...c, ...editCtx.pageData }
    : c;

  const submit = async e => {
    e.preventDefault();
    // 1. Save to Firestore so admin can see it in Messages panel
    try {
      const id = 'msg_' + Date.now();
      await setDoc(doc(db, 'contact_messages', id), {
        ...form,
        status:    'new',
        createdAt: serverTimestamp(),
      });
      
      // Track activity and notify admins
      try {
        const { trackActivity, NOTIFICATION_CATEGORIES } = await import('../utils/adminActivityTracker');
        await trackActivity({
          category: NOTIFICATION_CATEGORIES.CONTACT_MESSAGE,
          title: 'New Contact Message',
          message: `${form.name} sent a message: "${form.subject}"`,
          userEmail: form.email,
          userName: form.name,
          metadata: {
            subject: form.subject,
            messagePreview: form.message.substring(0, 100),
          },
          priority: 'normal',
        });
      } catch (err) {
        console.error('[trackActivity]', err);
      }
    } catch { /* silent — WhatsApp fallback still works */ }

    // 2. Open WhatsApp pre-filled as fallback
    const text = encodeURIComponent(
      `*Contact Form — Ellines Haven*\n\n*Name:* ${form.name}\n*Email:* ${form.email}\n*Subject:* ${form.subject}\n\n*Message:*\n${form.message}`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, '_blank');
    setSent(true);
  };

  const contactItems = [
    { icon:'📞', label:'Phone',     value: cv.phone,    href:`tel:+254${(cv.phone||'').replace(/\D/g,'')}` },
    { icon:'💬', label:'WhatsApp',  value: cv.wa_label, href: WA_LINK, highlight: true },
    { icon:'📧', label:'Email',     value: cv.email,    href:`mailto:${cv.email}` },
    { icon:'📍', label:'Location',  value: cv.location, href: null },
  ];

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1>Get in <span className="gold-text">Touch</span></h1>
          <p><EditableField field="page_sub">{cv.page_sub}</EditableField></p>
        </div>
      </div>

      {/* FAQ nudge */}
      <div className="container" style={{ paddingTop: 28, paddingBottom: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 'var(--r-sm)', padding: '12px 18px',
        }}>
          <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            Have a quick question? Check our{' '}
            <Link to="/faq" style={{ color: 'var(--gold)', fontWeight: 600 }}>FAQ page</Link>
            {' '}— most common questions about payments, book access, and accounts are answered there.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="container contact-grid">
          <div className="contact-info">
            <h2>Contact <span className="gold-text">Details</span></h2>
            <p><EditableField field="details_sub" multiline>{cv.details_sub}</EditableField></p>

            {/* WhatsApp CTA */}
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.35)', borderRadius:'var(--r-sm)', padding:'14px 18px', marginBottom:20, textDecoration:'none', transition:'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(37,211,102,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background='rgba(37,211,102,0.1)'}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#25D366" style={{flexShrink:0}}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <div>
                <strong style={{ color:'#25D366', display:'block', fontSize:'0.95rem' }}>{cv.wa_label}</strong>
                <span style={{ fontSize:'0.8rem', color:'var(--muted)' }}>{cv.wa_sub}</span>
              </div>
            </a>

            <div className="contact-cards">
              {contactItems.map(c => (
                <div key={c.label} className="contact-card card" style={c.highlight ? { borderColor:'rgba(37,211,102,0.3)' } : {}}>
                  <span className="contact-card__icon">{c.icon}</span>
                  <div>
                    <strong>{c.label}</strong>
                    {c.href
                      ? <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                          style={c.highlight ? { color:'#25D366' } : {}}>{c.value}</a>
                      : <span>{c.value}</span>
                    }
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:24, padding:'14px 18px', background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:'var(--r-sm)', fontSize:'0.82rem', color:'var(--muted)', lineHeight:1.7 }}>
              <strong style={{ color:'var(--gold)', display:'block', marginBottom:6 }}>Response Times</strong>
              WhatsApp: {cv.response_wa} · Email: {cv.response_email} · Phone: {cv.response_phone}
            </div>
          </div>

          <div className="contact-form card">
            {sent
              ? <div className="contact-sent">
                  <div style={{ fontSize:'3rem', marginBottom:16 }}>✅</div>
                  <h3><EditableField field="sent_heading">{cv.sent_heading}</EditableField></h3>
                  <p><EditableField field="sent_sub" multiline>{cv.sent_sub}</EditableField></p>
                  <p style={{ fontSize:'0.8rem', color:'var(--muted)', marginTop:8 }}>
                    If WhatsApp didn't open, message us directly at <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{ color:'#25D366' }}>0748 255 466</a>
                  </p>
                  <button className="btn btn-outline" style={{ marginTop:20 }} onClick={() => { setSent(false); setForm({ name:'', email:'', subject:'', message:'' }); }}>Send Another</button>
                </div>
              : <form onSubmit={submit}>
                  <h3 style={{ marginBottom:22 }}>
                    <EditableField field="form_heading">{cv.form_heading}</EditableField>
                  </h3>
                  {[
                    { k:'name',    label:'Your Name',  type:'text',  ph:'Amina Njeri' },
                    { k:'email',   label:'Email',       type:'email', ph:'your@email.com' },
                    { k:'subject', label:'Subject',     type:'text',  ph:'How can we help?' },
                  ].map(({ k, label, type, ph }) => (
                    <div key={k} className="form-group" style={{ marginBottom:14 }}>
                      <label>{label}</label>
                      <input className="field" type={type} placeholder={ph} value={form[k]}
                        onChange={e => setForm({ ...form, [k]: e.target.value })} required />
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom:20 }}>
                    <label>Message</label>
                    <textarea className="field" rows={5} placeholder="Your message here…" value={form.message}
                      onChange={e => setForm({ ...form, message: e.target.value })} required style={{ resize:'vertical' }} />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    {cv.form_btn}
                  </button>
                  <p style={{ fontSize:'0.75rem', color:'var(--muted)', textAlign:'center', marginTop:10 }}>
                    Opens WhatsApp with your message pre-filled
                  </p>
                </form>
            }
          </div>
        </div>
      </section>
    </main>
  );
}
