import { useState } from 'react';
import { Link } from 'react-router-dom';
import EditableField from '../components/EditableField';
import { useEditMode } from '../context/EditModeContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './FAQ.css';

const FAQS = [
  {
    category: 'Payments',
    icon: '💳',
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
    icon: '📚',
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
    icon: '👤',
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
    icon: '✍️',
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
    icon: '⚙️',
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
        <span>{q}</span>
        <span className="faq-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="faq-a"><p>{a}</p></div>}
    </div>
  );
}

export default function FAQ() {
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
      <div className="faq-hero">
        <div className="faq-hero__glow" />
        <div className="container faq-hero__inner">
          <span className="badge badge-gold">Help Centre</span>
          <h1>Frequently Asked <span className="gold-text">Questions</span></h1>
          <p><EditableField field="faq_sub">Everything you need to know about Ellines Haven — payments, reading, accounts, and more.</EditableField></p>

          {/* Search */}
          <div className="faq-search">
            <span className="faq-search__icon">🔍</span>
            <input
              className="faq-search__input"
              placeholder="Search questions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="faq-search__clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div className="faq-cats">
        <div className="container faq-cats__inner">
          <button
            className={`faq-cat-btn${!activeCategory ? ' faq-cat-btn--on' : ''}`}
            onClick={() => setActiveCategory('')}
          >All Topics</button>
          {FAQS.map(cat => (
            <button
              key={cat.category}
              className={`faq-cat-btn${activeCategory === cat.category ? ' faq-cat-btn--on' : ''}`}
              onClick={() => setActiveCategory(c => c === cat.category ? '' : cat.category)}
            >
              {cat.icon} {cat.category}
            </button>
          ))}
        </div>
      </div>

      {/* ── FAQ content ── */}
      <div className="container faq-body">
        {search && (
          <p className="faq-results-note">
            {totalMatches} result{totalMatches !== 1 ? 's' : ''} for "<strong>{search}</strong>"
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="faq-empty">
            <div className="faq-empty__icon">🤷</div>
            <h3>No results found</h3>
            <p>Try a different search term, or contact us directly.</p>
            <a href="https://wa.me/254748255466" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Ask on WhatsApp
            </a>
          </div>
        ) : (
          <div className="faq-sections">
            {filtered.map(cat => (
              <section key={cat.category} className="faq-section">
                <div className="faq-section__head">
                  <span className="faq-section__icon">{cat.icon}</span>
                  <h2>{cat.category}</h2>
                </div>
                <div className="faq-section__items">
                  {cat.items.map((item, i) => (
                    <FAQItem key={i} q={item.q} a={item.a} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Still need help */}
        <div className="faq-still-need-help">
          <div className="faq-snh__inner">
            <div className="faq-snh__icon">💬</div>
            <div className="faq-snh__copy">
              <h3>Still need help?</h3>
              <p>Our team in Nairobi is available on WhatsApp — we reply fast.</p>
            </div>
            <div className="faq-snh__actions">
              <a href="https://wa.me/254748255466" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                Chat on WhatsApp
              </a>
              <Link to="/contact" className="btn btn-outline">Contact Form</Link>
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}
