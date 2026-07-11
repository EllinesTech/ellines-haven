/**
 * usePageMeta — sets document title + OG/Twitter meta tags.
 * Resets to defaults on unmount so navigating away clears stale tags.
 *
 * Usage:
 *   usePageMeta({ title: 'Library', description: '...' });
 */
import { useEffect } from 'react';

const SITE = 'Ellines Haven';
const DEFAULT_DESC = 'Original East African novels and short stories by Elijah Mwangi M — buy, read online, and download.';
const DEFAULT_IMG  = '/logo-nobg3.png';
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'https://haven.ellines.co.ke';

function setMeta(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setMetaName(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function usePageMeta({ title, description, image, url, type = 'website' } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : SITE;
    const desc      = description || DEFAULT_DESC;
    const img       = image || `${ORIGIN}${DEFAULT_IMG}`;
    const pageUrl   = url || (typeof window !== 'undefined' ? window.location.href : ORIGIN);

    document.title = fullTitle;

    setMeta('og:title',       fullTitle);
    setMeta('og:description', desc.slice(0, 200));
    setMeta('og:type',        type);
    setMeta('og:url',         pageUrl);
    setMeta('og:image',       img);
    setMeta('og:site_name',   SITE);

    setMetaName('description',         desc.slice(0, 200));
    setMetaName('twitter:card',        'summary_large_image');
    setMetaName('twitter:title',       fullTitle);
    setMetaName('twitter:description', desc.slice(0, 200));
    setMetaName('twitter:image',       img);

    return () => {
      document.title = SITE;
    };
  }, [title, description, image, url, type]); // eslint-disable-line
}
