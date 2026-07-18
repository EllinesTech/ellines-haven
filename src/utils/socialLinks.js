/**
 * socialLinks.js — Utility for generating social media URLs
 * 
 * This module exports functions for converting social media handles
 * to proper URLs for all supported platforms
 */

/**
 * Generate proper social media URLs from handles
 * @param {string} platform - Platform ID (facebook, instagram, twitter, etc.)
 * @param {string} handle - User handle or identifier
 * @returns {string} Full URL to the social media profile/page
 */
export function getSocialLink(platform, handle) {
  if (!handle || !handle.trim()) return '#';
  
  const cleanHandle = handle.trim();
  
  switch (platform) {
    case 'facebook':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      if (!cleanHandle.startsWith('/')) return `https://facebook.com/${cleanHandle}`;
      return `https://facebook.com${cleanHandle}`;
    
    case 'instagram':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      const igHandle = cleanHandle.startsWith('@') ? cleanHandle.slice(1) : cleanHandle;
      return `https://instagram.com/${igHandle}`;
    
    case 'twitter':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      const twitterHandle = cleanHandle.startsWith('@') ? cleanHandle.slice(1) : cleanHandle;
      return `https://x.com/${twitterHandle}`;
    
    case 'tiktok':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      const ttHandle = cleanHandle.startsWith('@') ? cleanHandle.slice(1) : cleanHandle;
      return `https://tiktok.com/@${ttHandle}`;
    
    case 'youtube':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      if (cleanHandle.startsWith('@')) return `https://youtube.com/${cleanHandle}`;
      if (cleanHandle.startsWith('/')) return `https://youtube.com${cleanHandle}`;
      return `https://youtube.com/c/${cleanHandle}`;
    
    case 'linkedin':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      if (cleanHandle.startsWith('/')) return `https://linkedin.com${cleanHandle}`;
      return `https://linkedin.com/company/${cleanHandle}`;
    
    case 'telegram':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      const tgHandle = cleanHandle.startsWith('@') ? cleanHandle.slice(1) : cleanHandle;
      return `https://t.me/${tgHandle}`;
    
    case 'discord':
      return cleanHandle; // Should already be full link
    
    case 'snapchat':
      const scHandle = cleanHandle.startsWith('@') ? cleanHandle.slice(1) : cleanHandle;
      return `https://snapchat.com/add/${scHandle}`;
    
    case 'pinterest':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      const pHandle = cleanHandle.startsWith('/') ? cleanHandle.slice(1) : cleanHandle;
      return `https://pinterest.com/${pHandle}`;
    
    case 'reddit':
      if (cleanHandle.startsWith('http')) return cleanHandle;
      if (cleanHandle.startsWith('r/')) return `https://reddit.com/${cleanHandle}`;
      if (cleanHandle.startsWith('u/')) return `https://reddit.com/${cleanHandle}`;
      return `https://reddit.com/r/${cleanHandle}`;
    
    case 'whatsapp':
      return `https://wa.me/${cleanHandle.replace(/\D/g, '')}`;
    
    default:
      return '#';
  }
}

/**
 * Get the emoji icon for a social platform
 * @param {string} platform - Platform ID
 * @returns {string} Emoji icon for the platform
 */
export function getSocialIcon(platform) {
  const icons = {
    facebook: '📘',
    instagram: '📸',
    twitter: '𝕏',
    tiktok: '🎵',
    youtube: '📺',
    linkedin: '💼',
    telegram: '✈️',
    discord: '💬',
    snapchat: '👻',
    pinterest: '📌',
    reddit: '🔴',
    whatsapp: '💬',
  };
  return icons[platform] || '🌐';
}

/**
 * Get the brand color for a platform
 * @param {string} platform - Platform ID
 * @returns {string} Hex color code for the platform
 */
export function getSocialColor(platform) {
  const colors = {
    facebook: '#1877F2',
    instagram: '#E4405F',
    twitter: '#000000',
    tiktok: '#000000',
    youtube: '#FF0000',
    linkedin: '#0A66C2',
    telegram: '#0088cc',
    discord: '#5865F2',
    snapchat: '#FFFC00',
    pinterest: '#E60023',
    reddit: '#FF4500',
    whatsapp: '#25D366',
  };
  return colors[platform] || '#999999';
}
