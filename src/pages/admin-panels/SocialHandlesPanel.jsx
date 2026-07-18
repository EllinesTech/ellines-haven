/**
 * SocialHandlesPanel — Manage social media handles for the website
 * 
 * Allows admins to configure:
 * - Facebook, Instagram, X/Twitter, TikTok, LinkedIn, YouTube, Telegram
 * - Discord, Snapchat, Pinterest, Reddit
 * 
 * These are displayed in the Footer and on About/Contact pages
 */

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { getSocialLink } from '../../utils/socialLinks';

const SOCIAL_PLATFORMS = [
  { id: 'facebook',   name: 'Facebook',    icon: '📘', color: '#1877F2', placeholder: '@page-handle' },
  { id: 'instagram',  name: 'Instagram',   icon: '📸', color: '#E4405F', placeholder: '@handle' },
  { id: 'twitter',    name: 'X / Twitter', icon: '𝕏', color: '#000000', placeholder: '@handle' },
  { id: 'tiktok',     name: 'TikTok',      icon: '🎵', color: '#000000', placeholder: '@handle' },
  { id: 'youtube',    name: 'YouTube',     icon: '📺', color: '#FF0000', placeholder: '@channel or /c/channel' },
  { id: 'linkedin',   name: 'LinkedIn',    icon: '💼', color: '#0A66C2', placeholder: '/company/name or /in/profile' },
  { id: 'telegram',   name: 'Telegram',    icon: '✈️', color: '#0088cc', placeholder: '@handle or group link' },
  { id: 'discord',    name: 'Discord',     icon: '💬', color: '#5865F2', placeholder: 'https://discord.gg/invite' },
  { id: 'snapchat',   name: 'Snapchat',    icon: '👻', color: '#FFFC00', placeholder: '@handle' },
  { id: 'pinterest',  name: 'Pinterest',   icon: '📌', color: '#E60023', placeholder: '/handle' },
  { id: 'reddit',     name: 'Reddit',      icon: '🔴', color: '#FF4500', placeholder: 'r/subreddit or u/user' },
  { id: 'whatsapp',   name: 'WhatsApp',    icon: '💬', color: '#25D366', placeholder: '+254...' },
];

export default function SocialHandlesPanel({ showToast, isSuper }) {
  const { siteControls, saveSiteControls } = useApp();
  const [handles, setHandles] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  // Load social handles from site_data/site_controls
  useEffect(() => {
    const socialHandles = siteControls?.socialHandles || {};
    setHandles(socialHandles);
    setLoading(false);
    setDirty(false);
  }, [siteControls]);

  const updateHandle = (platform, value) => {
    const trimmed = value.trim();
    setHandles(prev => ({
      ...prev,
      [platform]: trimmed || undefined,
    }));
    setDirty(true);
  };

  const saveHandles = async () => {
    setSaving(true);
    try {
      const updated = {
        ...siteControls,
        socialHandles: handles,
        updatedAt: new Date().toISOString(),
      };
      await saveSiteControls(updated);
      showToast('✅ Social handles saved');
      setDirty(false);
    } catch (e) {
      console.error('[SocialHandlesPanel] save failed:', e);
      showToast('❌ Save failed — check console');
    } finally {
      setSaving(false);
    }
  };

  const clearAll = () => {
    if (!window.confirm('Clear all social media handles? This cannot be undone.')) return;
    setHandles({});
    setDirty(true);
  };

  const activeCount = Object.values(handles).filter(h => h && h.trim()).length;

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div className="adm-page">
      {/* ── Header ── */}
      <div className="adm-page-head">
        <div>
          <h1>🌐 Social Media Handles</h1>
          <span className="adm-page-sub">
            Manage Ellines Haven social media accounts. Changes appear on the footer and throughout the site automatically.
          </span>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div style={{
        background: 'rgba(201,168,76,0.07)',
        border: '1px solid rgba(201,168,76,0.25)',
        borderRadius: 'var(--r-sm)',
        padding: '12px 18px',
        marginBottom: 24,
        fontSize: '0.84rem',
      }}>
        ⚡ <strong style={{ color: 'var(--gold)' }}>Live on site:</strong>&nbsp;
        Social handles update instantly across the footer, About page, and all share buttons.
        Leave blank to hide a platform.
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Active Platforms', value: activeCount, icon: '✓', color: 'var(--gold)' },
          { label: 'Total Platforms', value: SOCIAL_PLATFORMS.length, icon: '🌐', color: '#4a9eff' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>{stat.icon}</span>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: stat.color }}>
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {SOCIAL_PLATFORMS.map(platform => (
          <div key={platform.id} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '1.8rem' }}>{platform.icon}</span>
              <div>
                <strong style={{ fontSize: '0.88rem', display: 'block' }}>{platform.name}</strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                  {handles[platform.id] ? '🟢 Active' : '⚪ Inactive'}
                </span>
              </div>
            </div>
            <input
              className="field"
              type="text"
              value={handles[platform.id] || ''}
              onChange={e => updateHandle(platform.id, e.target.value)}
              placeholder={platform.placeholder}
              style={{ marginBottom: 8, fontSize: '0.85rem' }}
              autoComplete="off"
            />
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted)' }}>
              {platform.id === 'facebook' && 'Enter page name or numeric ID'}
              {platform.id === 'instagram' && 'Your Instagram username'}
              {platform.id === 'twitter' && 'Your Twitter/X handle'}
              {platform.id === 'tiktok' && 'Your TikTok username'}
              {platform.id === 'youtube' && 'Channel handle or full URL'}
              {platform.id === 'linkedin' && 'Company page URL or profile handle'}
              {platform.id === 'telegram' && 'Channel/group handle or invite link'}
              {platform.id === 'discord' && 'Full Discord server invite link'}
              {platform.id === 'snapchat' && 'Your Snapchat username'}
              {platform.id === 'pinterest' && 'Your Pinterest username'}
              {platform.id === 'reddit' && 'Subreddit or user profile'}
              {platform.id === 'whatsapp' && 'Phone number with country code'}
            </p>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <button
          className="btn btn-primary"
          onClick={saveHandles}
          disabled={saving || !dirty}
          style={{
            opacity: (!dirty || saving) ? 0.55 : 1,
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '💾 Saving…' : dirty ? '💾 Save All Handles' : '✓ Saved'}
        </button>
        
        {activeCount > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={clearAll}
            style={{
              background: 'rgba(231,76,60,0.08)',
              color: '#e74c3c',
              border: '1px solid rgba(231,76,60,0.3)',
            }}
          >
            🗑 Clear All
          </button>
        )}

        {dirty && (
          <span style={{ fontSize: '0.75rem', color: 'var(--gold)', alignSelf: 'center', fontWeight: 600 }}>
            Unsaved changes
          </span>
        )}
      </div>

      {/* ── Preview ── */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: 'var(--gold)' }}>
          📋 Preview: How they appear on footer
        </h3>
        
        {activeCount === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>
            No social handles configured yet. Add some above!
          </p>
        ) : (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            {SOCIAL_PLATFORMS.map(platform => {
              const value = handles[platform.id];
              if (!value) return null;
              return (
                <a
                  key={platform.id}
                  href={getSocialLink(platform.id, value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 'var(--r-sm)',
                    background: `${platform.color}22`,
                    color: platform.color,
                    border: `1px solid ${platform.color}44`,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.target.style.background = `${platform.color}33`;
                    e.target.style.borderColor = `${platform.color}66`;
                  }}
                  onMouseLeave={e => {
                    e.target.style.background = `${platform.color}22`;
                    e.target.style.borderColor = `${platform.color}44`;
                  }}
                >
                  <span>{platform.icon}</span>
                  {value}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
