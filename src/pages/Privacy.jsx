import { Link } from 'react-router-dom';
import EditableField from '../components/EditableField';
import { usePageMeta } from '../hooks/usePageMeta';
import './Legal.css';

const LAST_UPDATED = 'July 2026';

export default function Privacy() {
  usePageMeta({ title: 'Privacy Policy', description: 'How Ellines Haven collects, uses, and protects your personal data. Read our full Privacy Policy.' });
  return (
    <main className="legal-page">
      <div className="legal-hero">
        <div className="container">
          <span className="badge badge-gold">Legal</span>
          <h1>Privacy <span className="gold-text">Policy</span></h1>
          <p>Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="container legal-body">

        <div className="legal-intro card">
          <p>
            <EditableField field="privacy_intro">At <strong>Ellines Haven</strong>, we take your privacy seriously. This Privacy Policy explains what information we collect, how we use it, and your rights regarding your personal data.</EditableField>
          </p>
          <p>
            Questions? Contact us at <a href="mailto:ellines.haven@gmail.com">ellines.haven@gmail.com</a> or WhatsApp <a href="https://wa.me/254748255466">0748 255 466</a>.
          </p>
        </div>

        <div className="legal-sections">

          <section className="legal-section">
            <h2>1. Who We Are</h2>
            <p>Ellines Haven is operated by Elijah Mwangi M under the Ellines Group, based in Nairobi, Kenya. We are the data controller for information collected through this platform.</p>
          </section>

          <section className="legal-section">
            <h2>2. Information We Collect</h2>
            <h3>Information you provide directly:</h3>
            <ul>
              <li><strong>Account information</strong> — your name, email address, and password when you register.</li>
              <li><strong>Payment information</strong> — your phone number (for M-Pesa), transaction reference codes, and the payment method you choose. We do not store card numbers, M-Pesa PINs, or PayPal passwords. Paystack and PayPal process card/PayPal data on their own secure platforms and we receive only a payment confirmation reference.</li>
              <li><strong>Profile information</strong> — optional phone number and bio you add to your profile.</li>
              <li><strong>Communications</strong> — messages you send us via our contact form or WhatsApp.</li>
              <li><strong>Notification requests</strong> — email addresses submitted to be notified about upcoming books.</li>
            </ul>
            <h3>Information collected automatically:</h3>
            <ul>
              <li><strong>Usage data</strong> — pages visited, books viewed, and reading activity on the platform.</li>
              <li><strong>Device information</strong> — browser type, operating system, and device type used to access the platform.</li>
              <li><strong>IP address and location</strong> — when you visit the site, your IP address and approximate geographic location (city, region, country) are recorded for security, fraud prevention, and anonymous analytics. This is stored securely in our Firebase database and is visible only to authorised administrators. Location data is derived from your IP address and is approximate — we do not use GPS or precise location tracking.</li>
              <li><strong>Local storage</strong> — we use your browser's local storage to keep you signed in and remember your cart and preferences between sessions.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. How We Use Your Information</h2>
            <ul>
              <li>To create and manage your account.</li>
              <li>To process and verify your purchases.</li>
              <li>To unlock book access in your library after payment confirmation.</li>
              <li>To send order confirmation and payment verification updates.</li>
              <li>To notify you about books you've requested notifications for.</li>
              <li>To respond to your support queries.</li>
              <li>To improve the platform — fixing bugs, improving performance, and enhancing the reading experience.</li>
              <li>To protect the platform against fraud and abuse.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. How We Store Your Data</h2>
            <p>Your account and library data is stored securely using <strong>Google Firebase Firestore</strong> — a cloud database operated by Google LLC. Firebase applies industry-standard security measures to protect your data.</p>
            <p>Some preferences and session data are stored in your browser's local storage on your device and are not transmitted to our servers.</p>
            <p>Payment transaction references (e.g., M-Pesa codes) are stored only for order verification purposes and are accessible only to authorised Ellines Haven staff.</p>
          </section>

          <section className="legal-section">
            <h2>5. Data Sharing</h2>
            <p>We do not sell, rent, or trade your personal information to any third party.</p>
            <p>We may share your data in the following limited circumstances:</p>
            <ul>
              <li><strong>Service providers</strong> — Google Firebase (data storage), Paystack (payment processing), PayPal (payment processing). These providers process your data only as needed to complete transactions and operate under strict confidentiality obligations.</li>
              <li><strong>Legal requirements</strong> — if required by Kenyan law, a court order, or government authority.</li>
              <li><strong>Business transfers</strong> — if Ellines Haven is acquired or merges with another entity, your data may transfer as part of that transaction. You will be notified of any such change.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>6. Digital Rights Management and Watermarking</h2>
            <p>Books purchased on Ellines Haven are watermarked with your name and email address. This is applied to protect the intellectual property of our author. The watermark is visible within the reader and on PDF downloads to discourage unauthorised sharing.</p>
            <p>This information is used solely for content protection and is not shared with third parties.</p>
          </section>

          <section className="legal-section">
            <h2>7. Cookies and Local Storage</h2>
            <p>Ellines Haven uses browser local storage (not traditional cookies) to:</p>
            <ul>
              <li>Keep you signed in between sessions.</li>
              <li>Remember your cart items.</li>
              <li>Save your reading preferences (font size, theme).</li>
              <li>Track notification requests for upcoming books (stored locally).</li>
            </ul>
            <p>You can clear this data at any time by signing out or clearing your browser's local storage. Clearing it will sign you out and reset your preferences.</p>
          </section>

          <section className="legal-section">
            <h2>8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
              <li><strong>Correction</strong> — update incorrect or incomplete data via your profile settings.</li>
              <li><strong>Deletion</strong> — request deletion of your account and associated data. Note that completed order records may be retained for financial record-keeping purposes.</li>
              <li><strong>Withdraw consent</strong> — opt out of notification emails at any time by contacting us.</li>
            </ul>
            <p>To exercise any of these rights, contact us at <a href="mailto:ellines.haven@gmail.com">ellines.haven@gmail.com</a>.</p>
          </section>

          <section className="legal-section">
            <h2>9. Children's Privacy</h2>
            <p>Ellines Haven is not intended for children under 13. We do not knowingly collect personal data from children under 13. If you believe a child under 13 has registered on our platform, please contact us and we will promptly delete the account.</p>
          </section>

          <section className="legal-section">
            <h2>10. Third-Party Links</h2>
            <p>Our platform may contain links to third-party websites such as Ellines Tech or social platforms. We are not responsible for the privacy practices of those sites and encourage you to review their privacy policies.</p>
          </section>

          <section className="legal-section">
            <h2>11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy periodically. We will notify you of material changes by posting a notice on the platform or sending an email to registered users. Continued use of the platform after changes constitutes acceptance.</p>
          </section>

          <section className="legal-section">
            <h2>12. Contact</h2>
            <p>For any privacy-related questions or requests:</p>
            <ul>
              <li>Email: <a href="mailto:ellines.haven@gmail.com">ellines.haven@gmail.com</a></li>
              <li>WhatsApp: <a href="https://wa.me/254748255466">0748 255 466</a></li>
              <li>Location: Nairobi, Kenya</li>
            </ul>
          </section>

        </div>

        <div className="legal-footer-nav">
          <Link to="/terms" className="btn btn-outline btn-sm">Terms of Service →</Link>
          <Link to="/faq" className="btn btn-ghost btn-sm">FAQ →</Link>
          <Link to="/contact" className="btn btn-ghost btn-sm">Contact Us →</Link>
        </div>

      </div>
    </main>
  );
}
