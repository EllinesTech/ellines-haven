import { Link } from 'react-router-dom';
import EditableField from '../components/EditableField';
import { usePageMeta } from '../hooks/usePageMeta';
import './Legal.css';

const LAST_UPDATED = 'July 2026';

const TOC = [
  { id: 'about', label: 'About' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'account', label: 'Account' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'refund', label: 'Refunds' },
  { id: 'ip', label: 'Licence' },
  { id: 'conduct', label: 'Conduct' },
  { id: 'disclaimer', label: 'Disclaimer' },
  { id: 'availability', label: 'Availability' },
  { id: 'liability', label: 'Liability' },
  { id: 'changes', label: 'Changes' },
  { id: 'law', label: 'Governing Law' },
  { id: 'contact', label: 'Contact' },
];

export default function Terms() {
  usePageMeta({ title: 'Terms of Service', description: 'Read the Ellines Haven Terms of Service — covering purchases, refunds, digital content licensing, and your rights as a reader.' });
  return (
    <main className="legal-page">
      <header className="legal-hero">
        <div className="legal-hero__glow" aria-hidden="true" />
        <div className="legal-hero__orb legal-hero__orb--1" aria-hidden="true" />
        <div className="legal-hero__orb legal-hero__orb--2" aria-hidden="true" />
        <div className="container legal-hero__inner">
          <p className="legal-hero__brand">Ellines Haven</p>
          <h1>Terms of <span className="gold-text">Service</span></h1>
          <p className="legal-hero__meta">
            <span>Legal</span>
            <span className="legal-hero__meta-dot" aria-hidden="true" />
            <span>Last updated {LAST_UPDATED}</span>
          </p>
          <div className="legal-hero__rule" aria-hidden="true" />
        </div>
      </header>

      <div className="container legal-body">

        <div className="legal-intro">
          <p>
            <EditableField field="terms_intro">Welcome to <strong>Ellines Haven</strong>. By accessing or using our platform — including browsing, creating an account, or purchasing any content — you agree to be bound by these Terms of Service. Please read them carefully.</EditableField>
          </p>
          <p>
            If you have questions, contact us at <a href="mailto:info@ellines.co.ke">info@ellines.co.ke</a> or on WhatsApp at <a href="https://wa.me/254748255466">0748 255 466</a>.
          </p>
        </div>

        <nav className="legal-toc" aria-label="On this page">
          <span className="legal-toc__label">On this page</span>
          <ul className="legal-toc__list">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="legal-sections">

          <section className="legal-section" id="about">
            <span className="legal-section__num">Section 01</span>
            <h2>About Ellines Haven</h2>
            <p>Ellines Haven is a digital literary platform based in Nairobi, Kenya, operated by Elijah Mwangi M under the Ellines Group. We provide original novels and short stories for purchase and reading online and offline.</p>
          </section>

          <section className="legal-section" id="eligibility">
            <span className="legal-section__num">Section 02</span>
            <h2>Eligibility</h2>
            <p>You must be at least 13 years of age to create an account on Ellines Haven. By registering, you confirm that you meet this requirement. Parental guidance is advised for readers under 18, as some content deals with mature themes including adult relationships, violence, and social issues.</p>
          </section>

          <section className="legal-section" id="account">
            <span className="legal-section__num">Section 03</span>
            <h2>Account Responsibilities</h2>
            <ul>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You must provide accurate information when registering.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
              <li>You must notify us immediately if you suspect unauthorised access to your account.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
            </ul>
          </section>

          <section className="legal-section" id="purchases">
            <span className="legal-section__num">Section 04</span>
            <h2>Purchases and Payments</h2>
            <ul>
              <li>All prices are displayed in Kenyan Shillings (KSh) and include applicable taxes.</li>
              <li>Payment is accepted via M-Pesa (STK push), Airtel Money, Paystack (Visa, Mastercard, bank transfer, M-Pesa), and PayPal.</li>
              <li>Paystack and PayPal payments are verified automatically — books unlock instantly upon confirmation.</li>
              <li>Airtel Money payments are verified manually, typically within minutes during business hours (8am–8pm EAT, Mon–Sat).</li>
              <li>PayPal charges are processed in USD; the approximate KES equivalent is displayed at checkout.</li>
              <li>We reserve the right to cancel orders where payment cannot be verified.</li>
              <li>Prices may change at any time without prior notice.</li>
            </ul>
          </section>

          <section className="legal-section" id="refund">
            <span className="legal-section__num">Section 05</span>
            <h2>Refund Policy</h2>
            <div className="legal-callout">
              <span className="legal-callout__mark" aria-hidden="true" />
              <strong>All digital book purchases on Ellines Haven are strictly non-refundable.</strong>
            </div>
            <p>
              When you purchase a book, it is <strong>unlocked and delivered to your personal library immediately</strong> upon payment confirmation. Because digital content is delivered instantly and cannot be "returned" — unlike a physical product — we do not offer refunds once access has been granted.
            </p>
            <p>By completing a purchase, you explicitly acknowledge and agree that:</p>
            <ul>
              <li>You have had the opportunity to read the book description, excerpt, and details before purchasing.</li>
              <li>Digital content is non-returnable once unlocked and accessible in your library.</li>
              <li>No refund will be issued on the basis of disliking the content, changing your mind, or having already read the book.</li>
              <li>This no-refund policy applies to all payment methods including M-Pesa, card, and PayPal.</li>
            </ul>
            <p>
              <strong>Exceptions — we will investigate and remedy the following:</strong>
            </p>
            <ul>
              <li>You were charged but the book was <strong>not unlocked</strong> in your library due to a technical fault on our platform.</li>
              <li>You were charged <strong>more than once</strong> for the same order.</li>
              <li>You were charged an <strong>incorrect amount</strong> that does not match the displayed price at checkout.</li>
            </ul>
            <p>
              To raise a dispute under the above exceptions, contact us <strong>within 7 days of purchase</strong> via WhatsApp at <a href="https://wa.me/254748255466">0748 255 466</a> with your order reference number and M-Pesa or transaction code. We will review and respond within 24 hours.
            </p>
          </section>

          <section className="legal-section" id="ip">
            <span className="legal-section__num">Section 06</span>
            <h2>Intellectual Property and Licence</h2>
            <p>All content on Ellines Haven — including but not limited to novels, short stories, cover artwork, brand assets, and website design — is the intellectual property of Elijah Mwangi M and the Ellines Group.</p>
            <p>When you purchase a book, you are granted a <strong>personal, non-exclusive, non-transferable licence</strong> to read that book for your own personal use. This licence does not permit you to:</p>
            <ul>
              <li>Share, distribute, reproduce, or re-publish the content in any form.</li>
              <li>Sell or transfer your purchased access to another person.</li>
              <li>Use any content for commercial purposes without written permission.</li>
              <li>Remove or bypass any digital rights management (DRM) or watermarks applied to the content.</li>
            </ul>
          </section>

          <section className="legal-section" id="conduct">
            <span className="legal-section__num">Section 07</span>
            <h2>Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the platform for any unlawful purpose.</li>
              <li>Attempt to gain unauthorised access to any part of the platform or its systems.</li>
              <li>Scrape, copy, or extract content from the platform using automated means.</li>
              <li>Post or transmit harmful, defamatory, or fraudulent content.</li>
              <li>Impersonate any person or organisation.</li>
              <li>Interfere with the operation of the platform.</li>
            </ul>
          </section>

          <section className="legal-section" id="disclaimer">
            <span className="legal-section__num">Section 08</span>
            <h2>Content Disclaimer</h2>
            <p>The books and stories on Ellines Haven are works of fiction inspired by real events. Any resemblance to specific living individuals is incidental. The views expressed in the stories are those of the characters and do not necessarily represent the views of Ellines Haven or its founder.</p>
          </section>

          <section className="legal-section" id="availability">
            <span className="legal-section__num">Section 09</span>
            <h2>Platform Availability</h2>
            <p>We strive to keep Ellines Haven available at all times, but we do not guarantee uninterrupted access. We may perform maintenance, updates, or experience technical issues that temporarily affect availability. We are not liable for any losses caused by downtime.</p>
          </section>

          <section className="legal-section" id="liability">
            <span className="legal-section__num">Section 10</span>
            <h2>Limitation of Liability</h2>
            <p>To the maximum extent permitted by Kenyan law, Ellines Haven and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform. Our total liability for any claim shall not exceed the amount you paid for the specific book or service that gives rise to the claim.</p>
          </section>

          <section className="legal-section" id="changes">
            <span className="legal-section__num">Section 11</span>
            <h2>Changes to These Terms</h2>
            <p>We may update these Terms of Service from time to time. We will notify registered users of significant changes via email or a notice on the platform. Continued use of the platform after changes constitutes acceptance of the new terms.</p>
          </section>

          <section className="legal-section" id="law">
            <span className="legal-section__num">Section 12</span>
            <h2>Governing Law</h2>
            <p>These Terms are governed by the laws of the Republic of Kenya. Any disputes shall be subject to the exclusive jurisdiction of the courts of Kenya.</p>
          </section>

          <section className="legal-section" id="contact">
            <span className="legal-section__num">Section 13</span>
            <h2>Contact</h2>
            <p>For questions about these Terms, reach us at:</p>
            <ul>
              <li>Email: <a href="mailto:info@ellines.co.ke">info@ellines.co.ke</a></li>
              <li>WhatsApp: <a href="https://wa.me/254748255466">0748 255 466</a></li>
              <li>Location: Nairobi, Kenya</li>
            </ul>
          </section>

        </div>

        <div className="legal-footer-nav">
          <Link to="/privacy" className="btn btn-outline btn-sm">Privacy Policy</Link>
          <Link to="/faq" className="btn btn-ghost btn-sm">FAQ</Link>
          <Link to="/contact" className="btn btn-ghost btn-sm">Contact</Link>
        </div>

      </div>
    </main>
  );
}
