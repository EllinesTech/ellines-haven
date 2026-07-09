import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NewsletterSignup from './NewsletterSignup';
import './Footer.css';

const GENRES = ['Romance', 'Mystery', 'Drama', 'Historical', 'Short Stories', 'Fantasy'];

export default function Footer() {
  const [navLogo, setNavLogo] = useState('/logo-nobg3.png');
  useEffect(() => {
    import('../firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, getDoc }) => {
        getDoc(doc(db, 'site_data', 'design_settings')).then(snap => {
          if (snap.exists() && snap.data().navLogo) setNavLogo(snap.data().navLogo);
        }).catch(() => {});
      });
    });
  }, []);
  return (
    <footer className="footer">

      {/* ── Decorative top band ── */}
      <div className="footer__topband" aria-hidden="true">
        <div className="footer__topband-line" />
        <span className="footer__topband-mark">✦</span>
        <div className="footer__topband-line" />
      </div>

      {/* ── Main grid ── */}
      <div className="footer__main">
        <div className="container footer__grid">

          {/* Brand column */}
          <div className="footer__brand">
            <Link to="/" className="footer__logo-link">
              <img src={navLogo} alt="Ellines Haven" className="footer__logo" />
            </Link>
            <p className="footer__tagline">
              A sanctuary for original African literature — stories born from real life, written in Kenya, read by the world.
            </p>
            {/* Contact chips */}
            <div className="footer__contacts">
              <a href="https://wa.me/254748255466" target="_blank" rel="noopener noreferrer" className="footer__contact-chip footer__contact-chip--wa">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
              <a href="tel:+254748255466" className="footer__contact-chip">📞 0748 255 466</a>
              <a href="tel:+254728807213" className="footer__contact-chip">📞 0728 807 213</a>
              <a href="mailto:ellines.haven@gmail.com" className="footer__contact-chip">📧 ellines.haven@gmail.com</a>
              <span className="footer__contact-chip footer__contact-chip--loc">📍Kenya</span>
            </div>
            {/* Payment badges */}
            <div className="footer__payments">
              <span className="footer__pay-label">We accept:</span>
              {['M-Pesa', 'Airtel Money', 'Visa / MC', 'PayPal'].map(p => (
                <span key={p} className="footer__pay-chip">{p}</span>
              ))}
            </div>
          </div>

          {/* Library column */}
          <div className="footer__col">
            <h4 className="footer__col-heading">Library</h4>
            <Link to="/library" className="footer__link">All Books</Link>
            {GENRES.map(g => (
              <Link key={g} to={`/library?genre=${g}`} className="footer__link">{g}</Link>
            ))}
          </div>

          {/* Account column */}
          <div className="footer__col">
            <h4 className="footer__col-heading">Account</h4>
            <Link to="/register" className="footer__link">Create Account</Link>
            <Link to="/login" className="footer__link">Sign In</Link>
            <Link to="/my-library" className="footer__link">My Library</Link>
            <Link to="/wishlist" className="footer__link">🔖 My Wishlist</Link>
            <Link to="/cart" className="footer__link">Cart</Link>
          </div>

          {/* Info column */}
          <div className="footer__col">
            <h4 className="footer__col-heading">Ellines Haven</h4>
            <Link to="/about" className="footer__link">About Us</Link>
            <Link to="/founder" className="footer__link">The Founder</Link>
            <Link to="/contact" className="footer__link">Contact Us</Link>
            <Link to="/faq" className="footer__link">FAQ / Help</Link>
            <a href="mailto:ellines.haven@gmail.com" className="footer__link">Support</a>
            <a href="https://ellinestech.co.ke" target="_blank" rel="noopener noreferrer" className="footer__link footer__link--ext">
              Ellines Tech ↗
            </a>
          </div>

        </div>
      </div>

      {/* ── Newsletter strip ── */}
      <div className="footer__newsletter">
        <div className="container footer__newsletter-inner">
          <div className="footer__newsletter-text">
            <strong>New releases, straight to your inbox</strong>
            <span>No spam. Just stories.</span>
          </div>
          <div className="footer__newsletter-form">
            <NewsletterSignup compact />
          </div>
        </div>
      </div>

      {/* ── Quote strip ── */}
      <div className="footer__quote-strip">
        <div className="container">
          <blockquote className="footer__quote">
            "Every story on this platform was written for someone who has never seen themselves as the hero before."
            <cite>— Elijah Mwangi M</cite>
          </blockquote>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="footer__bottom">
        <div className="container footer__bottom-inner">
          <p className="footer__copy">
            &copy; {new Date().getFullYear()} Ellines Haven. All rights reserved.
          </p>
          <div className="footer__legal-links">
            <Link to="/terms" className="footer__legal-link">Terms of Service</Link>
            <span className="footer__legal-sep">·</span>
            <Link to="/privacy" className="footer__legal-link">Privacy Policy</Link>
            <span className="footer__legal-sep">·</span>
            <Link to="/faq" className="footer__legal-link">FAQ</Link>
          </div>
          <p className="footer__devby">
            Designed &amp; developed by{' '}
            <a href="https://ellinestech.co.ke" target="_blank" rel="noopener noreferrer">Ellines Tech</a>
          </p>
        </div>
      </div>

    </footer>
  );
}
