import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, addDoc, collection, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import { usePageMeta } from '../hooks/usePageMeta';
import { getSocialLink } from '../utils/socialLinks';
import { HAVEN_EMAIL, INFO_EMAIL } from '../utils/ellinesEmails';
import './Contact.css';

const WA_NUMBER = '254748255466';
const WA_LINK   = `https://wa.me/${WA_NUMBER}`;

const EMAIL_DIRECTORY = [
  { email: INFO_EMAIL, label: 'Info', desc: 'General · group · careers' },
  { email: HAVEN_EMAIL, label: 'Haven', desc: 'Orders · leads · invoices · project requests' },
];

const CONTACT_DEFAULTS = {
  page_title:      'Get in Touch',
  page_sub:        "We'd love to hear from you",
  details_heading: 'Contact Details',
  details_sub:     'Reach out with any questions, feedback, or partnership inquiries. Our team in Nairobi is happy to help.',
  wa_label:        'Chat on WhatsApp',
  wa_sub:          '0748 255 466 — We reply fast',
  phone:           '0748 255 466',
  email:           HAVEN_EMAIL,
  location:        'Nairobi, Kenya',
  response_wa:     'Usually within 1 hour',
  response_email:  'Within 24 hours',
  response_phone:  'Mon–Sat, 8am–8pm EAT',
  form_heading:    'Send a Message',
  form_btn:        'Send via WhatsApp',
  sent_heading:    'Message Sent via WhatsApp!',
  sent_sub:        "Your message has been forwarded to our WhatsApp. We'll reply shortly.",
};

const IconPhone = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const IconMail = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconMap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconFaq = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IconCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconWa = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const SOCIAL_ICONS = {
  facebook: 'f', instagram: 'ig', twitter: '𝕏', tiktok: '♪', youtube: '▶',
  linkedin: 'in', telegram: '✈', discord: '◈', snapchat: '◈', pinterest: 'P',
  reddit: '◉', whatsapp: 'wa',
};

export default function Contact() {
  usePageMeta({
    title: 'Contact Us',
    description: 'Get in touch with Ellines Haven. Chat on WhatsApp, send an email, or use the contact form — we reply fast.',
  });
  const [form, setForm] = useState({ name:'', email:'', subject:'', message:'' });
  const [sent, setSent] = useState(false);
  const [c, setC] = useState(CONTACT_DEFAULTS);
  const [socialHandles, setSocialHandles] = useState({});
  const editCtx = useEditMode();

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'contact_content')).then(snap => {
      const fsData = snap.exists() ? snap.data() : {};
      setC({ ...CONTACT_DEFAULTS, ...fsData });
    }).catch(() => {});

    getDoc(doc(db, 'site_data', 'site_controls')).then(snap => {
      if (snap.exists() && snap.data().socialHandles) setSocialHandles(snap.data().socialHandles);
    }).catch(() => {});
  }, []);

  const cv = (editCtx?.editMode && editCtx?.pageKey === 'contact_content')
    ? { ...c, ...editCtx.pageData }
    : c;

  const submit = async e => {
    e.preventDefault();
    try {
      const id = 'msg_' + Date.now();
      await setDoc(doc(db, 'contact_messages', id), {
        name:       form.name,
        email:      form.email.toLowerCase().trim(),
        subject:    form.subject,
        message:    form.message,
        type:       'direct',
        status:     'new',
        threadId:   id,
        createdAt:  serverTimestamp(),
        lastMsg:    form.message.slice(0, 80),
        lastMsgAt:  serverTimestamp(),
        lastSender: 'user',
        userRead:   true,
      });

      await addDoc(collection(db, 'contact_messages', id, 'messages'), {
        text:        form.message,
        sender:      'user',
        senderName:  form.name,
        senderEmail: form.email.toLowerCase().trim(),
        createdAt:   serverTimestamp(),
      });

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
    } catch { /* WhatsApp fallback still works */ }

    const text = encodeURIComponent(
      `*Contact Form — Ellines Haven*\n\n*Name:* ${form.name}\n*Email:* ${form.email}\n*Subject:* ${form.subject}\n\n*Message:*\n${form.message}`
    );
    window.open(`https://wa.me/${WA_NUMBER}?text=${text}`, '_blank');
    setSent(true);
  };

  const phoneHref = `tel:+254${(cv.phone || '').replace(/\D/g, '')}`;

  return (
    <main className="contact-page">
      <header className="contact-hero">
        <div className="contact-hero__glow" aria-hidden="true" />
        <div className="contact-hero__orb contact-hero__orb--1" aria-hidden="true" />
        <div className="contact-hero__orb contact-hero__orb--2" aria-hidden="true" />
        <div className="container contact-hero__inner">
          <p className="contact-hero__brand">Ellines Haven</p>
          <h1>Get in <span className="gold-text">Touch</span></h1>
          <p><EditableField field="page_sub">{cv.page_sub}</EditableField></p>
        </div>
      </header>

      <div className="container">
        <div className="contact-nudge">
          <span className="contact-nudge__icon"><IconFaq /></span>
          <p>
            Have a quick question? Check our{' '}
            <Link to="/faq">FAQ page</Link>
            {' '}— payments, book access, and accounts are covered there.
          </p>
        </div>
      </div>

      <section className="contact-main">
        <div className="container contact-grid">
          <div className="contact-info">
            <h2>Contact <span className="gold-text">Details</span></h2>
            <p className="contact-lede">
              <EditableField field="details_sub" multiline>{cv.details_sub}</EditableField>
            </p>

            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="contact-wa"
            >
              <span className="contact-wa__icon" style={{ color: '#25D366' }}>
                <IconWa size={26} />
              </span>
              <div>
                <strong>{cv.wa_label}</strong>
                <span>{cv.wa_sub}</span>
              </div>
              <span className="contact-wa__arrow" aria-hidden="true">→</span>
            </a>

            <div className="contact-channels">
              <a href={phoneHref} className="contact-channel">
                <span className="contact-channel__icon"><IconPhone /></span>
                <div>
                  <strong>Phone</strong>
                  <span>{cv.phone}</span>
                </div>
              </a>
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="contact-channel">
                <span className="contact-channel__icon contact-channel__icon--wa"><IconWa size={18} /></span>
                <div>
                  <strong>WhatsApp</strong>
                  <span style={{ color: '#25D366' }}>{cv.wa_label}</span>
                </div>
              </a>
              <div className="contact-channel contact-channel--static">
                <span className="contact-channel__icon"><IconMap /></span>
                <div>
                  <strong>Location</strong>
                  <span>{cv.location}</span>
                </div>
              </div>
            </div>

            <div className="contact-email-dir" style={{ marginTop: 18 }}>
              <span className="contact-times__label">Email directory</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {EMAIL_DIRECTORY.map(({ email, label, desc }) => (
                  <a
                    key={email}
                    href={`mailto:${email}`}
                    className="contact-channel"
                    style={{ padding: '10px 12px' }}
                  >
                    <span className="contact-channel__icon"><IconMail /></span>
                    <div>
                      <strong>{label} · {email}</strong>
                      <span>{desc}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div className="contact-times">
              <span className="contact-times__label">Response Times</span>
              <div className="contact-times__row">
                <div className="contact-times__item">
                  <span>WhatsApp</span>
                  <b>{cv.response_wa}</b>
                </div>
                <div className="contact-times__item">
                  <span>Email</span>
                  <b>{cv.response_email}</b>
                </div>
                <div className="contact-times__item">
                  <span>Phone</span>
                  <b>{cv.response_phone}</b>
                </div>
              </div>
            </div>
          </div>

          <div className="contact-form-panel card">
            {sent ? (
              <div className="contact-sent">
                <div className="contact-sent__check"><IconCheck /></div>
                <h3><EditableField field="sent_heading">{cv.sent_heading}</EditableField></h3>
                <p><EditableField field="sent_sub" multiline>{cv.sent_sub}</EditableField></p>
                <p className="contact-sent__fallback">
                  If WhatsApp didn&apos;t open, message us at{' '}
                  <a href={WA_LINK} target="_blank" rel="noopener noreferrer">0748 255 466</a>
                </p>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setSent(false);
                    setForm({ name:'', email:'', subject:'', message:'' });
                  }}
                >
                  Send Another
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h3>
                  <EditableField field="form_heading">{cv.form_heading}</EditableField>
                </h3>
                {[
                  { k:'name',    label:'Your Name',  type:'text',  ph:'Amina Njeri' },
                  { k:'email',   label:'Email',       type:'email', ph:'your@email.com' },
                  { k:'subject', label:'Subject',     type:'text',  ph:'How can we help?' },
                ].map(({ k, label, type, ph }) => (
                  <div key={k} className="form-group">
                    <label htmlFor={`contact-${k}`}>{label}</label>
                    <input
                      id={`contact-${k}`}
                      className="field"
                      type={type}
                      placeholder={ph}
                      value={form[k]}
                      onChange={e => setForm({ ...form, [k]: e.target.value })}
                      required
                    />
                  </div>
                ))}
                <div className="form-group">
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    className="field"
                    rows={5}
                    placeholder="Your message here…"
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary contact-submit">
                  <IconWa size={18} />
                  {cv.form_btn}
                </button>
                <p className="contact-submit-hint">
                  Opens WhatsApp with your message pre-filled — and saves a copy for our team.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {Object.keys(socialHandles).length > 0 && (
        <section className="contact-social">
          <div className="container">
            <h2>Follow <span className="gold-text">Us</span></h2>
            <p>
              Stay connected with Ellines Haven for new releases, behind-the-scenes notes, and community stories.
            </p>
            <div className="contact-social__links">
              {Object.entries(socialHandles).map(([platform, handle]) => {
                if (!handle || !handle.trim()) return null;
                const label = platform.charAt(0).toUpperCase() + platform.slice(1);
                return (
                  <a
                    key={platform}
                    href={getSocialLink(platform, handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Follow us on ${label}`}
                    className="contact-social__link"
                  >
                    <span className="contact-social__glyph">{SOCIAL_ICONS[platform] || '•'}</span>
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
