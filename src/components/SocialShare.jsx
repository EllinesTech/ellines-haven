import { useState } from 'react';

/**
 * SOCIAL SHARE COMPONENT (Phase 3)
 * 
 * Displays social sharing buttons for:
 * - WhatsApp
 * - Twitter
 * - Facebook
 * - Copy link to clipboard
 */

export default function SocialShare({ title, text, url, variant = 'horizontal' }) {
  const [copied, setCopied] = useState(false);

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}%20${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const containerStyle = {
    display: 'flex',
    gap: variant === 'horizontal' ? 8 : 0,
    flexDirection: variant === 'vertical' ? 'column' : 'row',
    alignItems: 'center',
  };

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: variant === 'horizontal' ? '8px 12px' : '10px 14px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)',
    borderRadius: 'var(--r-sm)',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
    transition: 'all 0.2s',
    width: variant === 'vertical' ? '100%' : 'auto',
  };

  return (
    <div style={containerStyle}>
      {title && (
        <span style={{
          fontSize: '0.78rem',
          color: 'var(--muted)',
          marginRight: variant === 'horizontal' ? 8 : 0,
          marginBottom: variant === 'vertical' ? 8 : 0,
        }}>
          {title}
        </span>
      )}

      {/* WhatsApp */}
      <a
        href={shareLinks.whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...buttonStyle,
          color: '#25d366',
          borderColor: 'rgba(37,211,102,0.3)',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(37,211,102,0.1)';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(255,255,255,0.04)';
        }}
      >
        <span style={{ fontSize: '1rem' }}>💬</span>
        WhatsApp
      </a>

      {/* Twitter */}
      <a
        href={shareLinks.twitter}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...buttonStyle,
          color: '#1DA1F2',
          borderColor: 'rgba(29,161,242,0.3)',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(29,161,242,0.1)';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(255,255,255,0.04)';
        }}
      >
        <span style={{ fontSize: '1rem' }}>𝕏</span>
        Twitter
      </a>

      {/* Facebook */}
      <a
        href={shareLinks.facebook}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...buttonStyle,
          color: '#1877F2',
          borderColor: 'rgba(24,119,242,0.3)',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(24,119,242,0.1)';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(255,255,255,0.04)';
        }}
      >
        <span style={{ fontSize: '1rem' }}>f</span>
        Facebook
      </a>

      {/* Copy Link */}
      <button
        onClick={copyToClipboard}
        style={{
          ...buttonStyle,
          cursor: 'pointer',
          background: copied ? 'rgba(46,204,113,0.1)' : 'rgba(255,255,255,0.04)',
          color: copied ? '#2ecc71' : 'var(--text)',
          borderColor: copied ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.2)',
        }}
      >
        <span style={{ fontSize: '1rem' }}>
          {copied ? '✓' : '🔗'}
        </span>
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}
