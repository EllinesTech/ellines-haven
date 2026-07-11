import { useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * ReferralDashboard — display user's referral code and earnings
 * Shows:
 * - Unique referral code (e.g., "MARK25")
 * - Earnings so far (KSh credit)
 * - Referral conversion table
 * - Share buttons to spread the code
 */
export default function ReferralDashboard({ user }) {
  const { referralData } = useApp();
  const [copied, setCopied] = useState(false);

  if (!referralData) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        Loading your referral program...
      </div>
    );
  }

  const referralLink = `https://haven.ellines.co.ke?ref=${referralData.code}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', referralLink);
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ── Referral Code Card ── */}
      <div className="card" style={{
        padding: 24,
        background: 'linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%)',
        border: '2px solid rgba(201,168,76,0.3)',
        marginBottom: 24,
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, color: 'var(--gold)' }}>🎁 Your Referral Program</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
          Share your code and earn 5% credit on every friend's purchase. They get 10% off.
        </p>

        {/* Code Display */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>
            Your Referral Code
          </div>
          <div style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: 'var(--gold)',
            letterSpacing: 2,
            fontFamily: 'monospace',
            marginBottom: 12,
          }}>
            {referralData.code}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: '0 0 12px' }}>
            KSh {(referralData.earnings || 0).toLocaleString()} earned so far
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={copyToClipboard}
            style={{ marginRight: 8, marginBottom: 8 }}
          >
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => window.print()}
            style={{ marginBottom: 8 }}
          >
            🖨️ Print
          </button>
        </div>

        {/* Share Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `📚 Join me on Ellines Haven! Use my code ${referralData.code} to get 10% off your first purchase.\n\n${referralLink}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'rgba(37,211,102,0.12)',
              border: '1px solid rgba(37,211,102,0.3)',
              color: '#25D366',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `📚 Get 10% off at Ellines Haven with my referral code: ${referralData.code}\n\n${referralLink}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'rgba(29,161,242,0.12)',
              border: '1px solid rgba(29,161,242,0.3)',
              color: '#1da1f2',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            𝕏 Tweet
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent('Join me on Ellines Haven!')}&body=${encodeURIComponent(
              `Hi!\n\nI've been enjoying reading on Ellines Haven. Use my code ${referralData.code} to get 10% off your first purchase.\n\n${referralLink}`
            )}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--muted)',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ✉️ Email
          </a>
        </div>
      </div>

      {/* ── Earnings & Referrals Table ── */}
      {(referralData.referrals || []).length > 0 && (
        <div className="card" style={{ padding: 20, overflow: 'auto' }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '1rem', color: 'var(--gold)' }}>
            💰 Your Referral Conversions
          </h3>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
          }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(201,168,76,0.3)' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 700, color: 'var(--gold)' }}>Person</th>
                <th style={{ textAlign: 'right', padding: '10px 0', fontWeight: 700, color: 'var(--gold)' }}>Order Value</th>
                <th style={{ textAlign: 'right', padding: '10px 0', fontWeight: 700, color: 'var(--gold)' }}>Your Credit</th>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 700, color: 'var(--gold)' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {referralData.referrals.map((ref, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: 'var(--text)' }}>
                    <div style={{ fontWeight: 600 }}>{ref.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{ref.email}</div>
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', color: 'var(--muted)' }}>
                    KSh {(ref.orderValue || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', color: 'var(--ok)', fontWeight: 600 }}>
                    +KSh {(ref.credit || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {new Date(ref.date).toLocaleDateString('en-KE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {(referralData.referrals || []).length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🚀</div>
          <h3 style={{ marginBottom: 8 }}>No conversions yet</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
            Share your code with friends and start earning credit when they make a purchase!
          </p>
        </div>
      )}
    </div>
  );
}
