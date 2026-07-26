import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import EditableField from '../components/EditableField';
import { usePageMeta } from '../hooks/usePageMeta';
import './FAQ.css';

const IconCard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
  </svg>
);
const IconBook = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);
const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconPen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);
const IconGear = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IconSearchEmpty = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);
const IconChat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconWa = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const CATEGORY_ICONS = {
  Payments: IconCard,
  'Accessing Your Books': IconBook,
  Accounts: IconUser,
  'Books & Content': IconPen,
  Technical: IconGear,
};

const FAQS = [
  {
    category: 'Payments',
    items: [
      {
        q: 'How do I pay for a book?',
        a: 'We accept M-Pesa (STK push), Airtel Money, Paystack (Visa, Mastercard, bank transfer, M-Pesa), and PayPal. Choose your preferred method at checkout. Paystack and PayPal unlock your books instantly and automatically. Airtel Money requires submitting a transaction code for manual verification.',
      },
      {
        q: 'What is the fastest way to pay?',
        a: 'Paystack and PayPal are the fastest — books unlock automatically within seconds of payment confirmation. Paystack supports M-Pesa, Visa, Mastercard, and bank transfers. PayPal works great for international payments.',
      },
      {
        q: 'Can I pay with a Visa or Mastercard?',
        a: 'Yes. Choose "Pay Online" at checkout (powered by Paystack) or PayPal. Both accept Visa, Mastercard, and other major cards.',
      },
      {
        q: 'Can I pay via PayPal?',
        a: "Yes! Select PayPal at checkout. You'll be taken to PayPal's secure portal where you can pay using your PayPal balance, linked bank, or any card on your PayPal account. Payments are processed in USD — the approximate KES equivalent is shown before you confirm.",
      },
      {
        q: 'What is the M-Pesa till number or paybill?',
        a: 'Our M-Pesa details are shown at checkout. You can also send directly to 0748 255 466 (Ellines Haven). For instant STK push, simply select "Pay Online" — M-Pesa is included as a Paystack payment option.',
      },
      {
        q: 'How long does payment verification take?',
        a: 'Paystack and PayPal verify instantly — books unlock in seconds. Airtel Money is verified manually, usually within minutes during business hours (8am–8pm EAT, Mon–Sat).',
      },
      {
        q: 'Can I pay via WhatsApp instead?',
        a: 'Yes! Click "Order via WhatsApp" on any book or at checkout. This opens a pre-filled message to our team who will guide you through payment manually.',
      },
      {
        q: 'Do you offer refunds?',
        a: 'Because our books are digital and delivered instantly, we generally do not offer refunds after access has been granted. If there is a technical issue preventing you from accessing your book, contact us on WhatsApp at 0748 255 466 and we will resolve it.',
      },
    ],
  },
  {
    category: 'Accessing Your Books',
    items: [
      {
        q: 'How do I access a book after purchasing?',
        a: 'Once your payment is verified, your book appears in My Library (accessible from the top navigation or your profile dropdown). Click "Read Online" to open it in our built-in reader, or "Download PDF" to save it to your device.',
      },
      {
        q: 'Can I read on my phone?',
        a: 'Yes — Ellines Haven works on any device with a browser. No app download needed. Our reader is fully optimised for phones, tablets, and desktops.',
      },
      {
        q: 'Can I download the book as a PDF?',
        a: 'Yes, for books that have their PDF uploaded, you will see a "Download PDF" button in My Library. This gives you a copy to read offline at any time.',
      },
      {
        q: 'Do my books expire?',
        a: 'Never. Once you purchase a book it is yours permanently. There are no subscriptions, no renewals, and no expiry dates. Your library stays with you as long as your account exists.',
      },
      {
        q: 'What is the difference between "Read Online" and "Download PDF"?',
        a: '"Read Online" opens the book in our beautiful built-in reader — great for reading in the browser on any device. "Download PDF" saves the full book file to your device for offline reading with any PDF reader.',
      },
      {
        q: 'I paid but my book is not showing in my library — what do I do?',
        a: 'This usually means your payment is still being verified (typically a few minutes). If it has been more than 2 hours, contact us on WhatsApp at 0748 255 466 with your order ID and M-Pesa transaction code. We will unlock it manually right away.',
      },
    ],
  },
  {
    category: 'Accounts',
    items: [
      {
        q: 'Do I need an account to browse books?',
        a: 'No — you can browse the library, read excerpts, and view all book details without signing in. You only need an account to purchase and access books.',
      },
      {
        q: 'Is creating an account free?',
        a: 'Yes, completely free. There are no fees to create or maintain an account on Ellines Haven.',
      },
      {
        q: 'How do I reset my password?',
        a: 'On the Sign In page, click "Forgot password?" and enter your email. You will receive a reset code to create a new password.',
      },
      {
        q: 'Can I change my email address?',
        a: 'Email addresses cannot currently be changed as they are used as your unique account identifier. If you need assistance, contact our support team on WhatsApp.',
      },
    ],
  },
  {
    category: 'Books & Content',
    items: [
      {
        q: 'Who writes the books on Ellines Haven?',
        a: 'Every book on Ellines Haven is written by Elijah Mwangi M — a Kenyan author, software engineer, and founder of the Ellines Group. All stories are original works drawn from real life, real people, and real events across East Africa.',
      },
      {
        q: 'Are the stories based on real events?',
        a: 'Yes. Every novel and short story on this platform is inspired by true events, real relationships, and real people Elijah has encountered on his journey. The names and details may be changed — the truth at the core does not.',
      },
      {
        q: 'What genres are available?',
        a: 'The library includes Drama, Romance, Mystery, Historical Fiction, Fantasy, Short Stories, Sci-Fi, and Adventure. Most titles fall under Drama and are deeply rooted in Kenyan and East African life.',
      },
      {
        q: 'What does "Coming Soon" mean?',
        a: 'Coming Soon titles are books that Elijah is currently writing or preparing for release. You can register for notifications on any Coming Soon book and we will email you the moment it launches.',
      },
      {
        q: 'What does "Ongoing" mean?',
        a: 'Ongoing books are being released in chapters — you can purchase access and read the chapters already published, with new chapters added regularly as the story progresses.',
      },
      {
        q: 'Can I share a book I purchased with someone else?',
        a: 'Books purchased on Ellines Haven are licensed for personal use only. Sharing, redistributing, or re-selling purchased content is not permitted. Each book is watermarked with your account details.',
      },
    ],
  },
  {
    category: 'Technical',
    items: [
      {
        q: 'Which browsers are supported?',
        a: 'Ellines Haven works on all modern browsers — Chrome, Firefox, Safari, Edge, and mobile browsers. We recommend keeping your browser updated for the best reading experience.',
      },
      {
        q: 'The reader is not loading — what should I do?',
        a: 'Try refreshing the page. If the PDF reader does not load, check your internet connection, try a different browser, or switch to "Text View" mode in the reader toolbar. If the issue persists, contact us on WhatsApp.',
      },
      {
        q: 'Can I adjust the text size in the reader?',
        a: 'Yes. In Text View mode, use the "A−" and "A+" buttons in the reader toolbar to decrease or increase the font size. In PDF View mode, use the zoom controls.',
      },
      {
        q: 'Is my payment and personal information secure?',
        a: 'Yes. We do not store card numbers or M-Pesa PINs. Payment transaction codes are used only for verification. Your account data is protected and we do not sell or share personal information with third parties.',
      },
    ],
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item${open ? ' faq-item--open' : ''}`}>
      <button className="faq-q" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="faq-q__text">{q}</span>
        <span className="faq-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="faq-a">
          <p>{a}</p>
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  usePageMeta({
    title: 'FAQ — Frequently Asked Questions',
    description: 'Answers to common questions about payments, reading, downloads, account access, and more on Ellines Haven.',
  });

  // Generate FAQPage schema for Google rich snippets
  useEffect(() => {
    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': FAQS.flatMap(cat =>
        cat.items.map(item => ({
          '@type': 'Question',
          'name': item.q,
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': item.a,
          },
        }))
      ),
    };

    let schemaScript = document.querySelector('script[data-faq-schema="true"]');
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.setAttribute('type', 'application/ld+json');
      schemaScript.setAttribute('data-faq-schema', 'true');
      document.head.appendChild(schemaScript);
    }
    schemaScript.textContent = JSON.stringify(faqSchema);

    return () => {
      if (schemaScript) schemaScript.remove();
    };
  }, []);

  const [activeCategory, setActiveCategory] = useState('');
  const [search, setSearch] = useState('');

  const filtered = FAQS.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !search ||
      item.q.toLowerCase().includes(search.toLowerCase()) ||
      item.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat =>
    (!activeCategory || cat.category === activeCategory) &&
    cat.items.length > 0
  );

  const totalMatches = filtered.reduce((s, c) => s + c.items.length, 0);

  return (
    <main className="faq-page">

      {/* ── Hero ── */}
      <header className="faq-hero">
        <div className="faq-hero__glow" aria-hidden="true" />
        <div className="faq-hero__orb faq-hero__orb--1" aria-hidden="true" />
        <div className="faq-hero__orb faq-hero__orb--2" aria-hidden="true" />
        <div className="container faq-hero__inner">
          <p className="faq-hero__brand">Ellines Haven</p>
          <h1>Frequently Asked <span className="gold-text">Questions</span></h1>
          <p><EditableField field="faq_sub">Everything you need to know about Ellines Haven — payments, reading, accounts, and more.</EditableField></p>

          <div className="faq-search">
            <span className="faq-search__icon"><IconSearch /></span>
            <input
              className="faq-search__input"
              placeholder="Search questions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search FAQ questions"
            />
            {search && (
              <button type="button" className="faq-search__clear" onClick={() => setSearch('')} aria-label="Clear search">✕</button>
            )}
          </div>
        </div>
      </header>

      {/* ── Category tabs ── */}
      <div className="faq-cats">
        <div className="container faq-cats__inner">
          <button
            type="button"
            className={`faq-cat-btn${!activeCategory ? ' faq-cat-btn--on' : ''}`}
            onClick={() => setActiveCategory('')}
          >All Topics</button>
          {FAQS.map(cat => {
            const CatIcon = CATEGORY_ICONS[cat.category];
            return (
              <button
                type="button"
                key={cat.category}
                className={`faq-cat-btn${activeCategory === cat.category ? ' faq-cat-btn--on' : ''}`}
                onClick={() => setActiveCategory(c => c === cat.category ? '' : cat.category)}
              >
                {CatIcon && <span className="faq-cat-btn__icon"><CatIcon /></span>}
                {cat.category}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── FAQ content ── */}
      <div className="container faq-body">
        {search && (
          <p className="faq-results-note">
            {totalMatches} result{totalMatches !== 1 ? 's' : ''} for “<strong>{search}</strong>”
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="faq-empty">
            <div className="faq-empty__icon"><IconSearchEmpty /></div>
            <h3>No results found</h3>
            <p>Try a different search term, or contact us directly.</p>
            <a href="https://wa.me/254748255466" target="_blank" rel="noopener noreferrer" className="btn btn-primary faq-empty__cta">
              <IconWa size={16} /> Ask on WhatsApp
            </a>
          </div>
        ) : (
          <div className="faq-sections">
            {filtered.map(cat => {
              const CatIcon = CATEGORY_ICONS[cat.category];
              return (
                <section key={cat.category} className="faq-section">
                  <div className="faq-section__head">
                    <span className="faq-section__icon">{CatIcon && <CatIcon />}</span>
                    <h2>{cat.category}</h2>
                  </div>
                  <div className="faq-section__items">
                    {cat.items.map((item, i) => (
                      <FAQItem key={i} q={item.q} a={item.a} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Still need help */}
        <div className="faq-cta">
          <div className="faq-cta__glow" aria-hidden="true" />
          <div className="faq-cta__inner">
            <span className="faq-cta__icon"><IconChat /></span>
            <div className="faq-cta__copy">
              <h3>Still need help?</h3>
              <p>Our team in Nairobi is available on WhatsApp — we reply fast. Or send a note through the contact form.</p>
            </div>
            <div className="faq-cta__actions">
              <a href="https://wa.me/254748255466" target="_blank" rel="noopener noreferrer" className="faq-cta__wa">
                <IconWa size={18} />
                Chat on WhatsApp
              </a>
              <Link to="/contact" className="faq-cta__contact">Contact Form</Link>
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}
