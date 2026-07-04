/**
 * NewsletterSignup — email capture for new releases and author updates.
 * Stores signups in Firestore: newsletter_signups/{email_key}
 */
import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import './NewsletterSignup.css';

export default function NewsletterSignup({ compact = false }) {
  const { user } = useApp();
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName]   = useState(user?.name || '');
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [msg, setMsg]     = useState('');

  const validate = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate(email)) { setMsg('Please enter a valid email address.'); return; }
    setState('loading');
    setMsg('');
    try {
      const key = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'newsletter_signups', key), {
        email: email.toLowerCase(),
        name: name.trim() || 'Reader',
        userId: user?.email || null,
        subscribedAt: serverTimestamp(),
        source: 'website',
        active: true,
      }, { merge: true });
      // Also track locally so we don't show the widget again
      localStorage.setItem('eh_newsletter_' + key, '1');
      setState('done');
    } catch {
      setState('error');
      setMsg('Something went wrong. Please try again.');
    }
  };

  // Check if already signed up
  const alreadySigned = (() => {
    try {
      const key = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      return !!localStorage.getItem('eh_newsletter_' + key);
    } catch { return false; }
  })();

  if (state === 'done' || alreadySigned) {
    return (
      <div className={'nl-done' + (compact ? ' nl-done--compact' : '')}>
        <span className="nl-done-icon">📬</span>
        <div>
          <strong>You're on the list!</strong>
          <p>We'll let you know when new books and updates drop.</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <form className="nl-compact" onSubmit={handleSubmit}>
        <input
          type="email"
          className="nl-input"
          placeholder="Your email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          aria-label="Email for newsletter"
        />
        <button type="submit" className="btn btn-primary btn-sm nl-btn" disabled={state === 'loading'}>
          {state === 'loading' ? '…' : 'Notify Me'}
        </button>
        {msg && <span className="nl-msg nl-msg--err">{msg}</span>}
      </form>
    );
  }

  return (
    <section className="nl-section">
      <div className="nl-glow nl-glow--a" />
      <div className="nl-glow nl-glow--b" />
      <div className="nl-inner">
        <div className="nl-icon">📚</div>
        <h2 className="nl-title">Stay in the <span className="gold-text">Story</span></h2>
        <p className="nl-sub">
          Get notified when new books drop, chapters release, and exclusive content goes live.
          No spam — only stories.
        </p>
        <form className="nl-form" onSubmit={handleSubmit}>
          {!user && (
            <input
              type="text"
              className="field nl-field"
              placeholder="Your name (optional)"
              value={name}
              onChange={e => setName(e.target.value)}
              aria-label="Your name"
            />
          )}
          <div className="nl-row">
            <input
              type="email"
              className="field nl-field nl-field--email"
              placeholder="Enter your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              aria-label="Email address"
            />
            <button type="submit" className="btn btn-primary nl-submit" disabled={state === 'loading'}>
              {state === 'loading' ? 'Subscribing…' : '🔔 Subscribe'}
            </button>
          </div>
          {msg && <p className="nl-msg nl-msg--err">{msg}</p>}
          <p className="nl-note">Free · No spam · Unsubscribe any time</p>
        </form>
      </div>
    </section>
  );
}
