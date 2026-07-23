/**
 * usePageMeta — sets document title + OG/Twitter meta tags + canonical link.
 * Resets to defaults on unmount so navigating away clears stale tags.
 *
 * Usage:
 *   usePageMeta({ title: 'Library', description: '...' });
 */
import { useEffect } from 'react';

const SITE   = 'Ellines Haven';
const ORIGIN = 'https://haven.ellines.co.ke';
const DEFAULT_DESC = 'Original East African novels and short stories by Elijah Mwangi M — buy, read online, and download.';
const DEFAULT_IMG  = `${ORIGIN}/og-image.png`;

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

function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function usePageMeta({ 
  title, 
  description, 
  image, 
  url, 
  type = 'website',
  // Book-specific schema fields
  bookData = null,
} = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : SITE;
    const desc      = description || DEFAULT_DESC;
    const img       = image
      ? (image.startsWith('http') ? image : `${ORIGIN}${image}`)
      : DEFAULT_IMG;

    // Canonical: prefer explicit url, else strip query/hash from current path
    const canonical = url
      ? (url.startsWith('http') ? url : `${ORIGIN}${url}`)
      : `${ORIGIN}${window.location.pathname}`;

    document.title = fullTitle;

    setCanonical(canonical);

    setMeta('og:title',       fullTitle);
    setMeta('og:description', desc.slice(0, 200));
    setMeta('og:type',        type);
    setMeta('og:url',         canonical);
    setMeta('og:image',       img);
    setMeta('og:site_name',   SITE);

    setMetaName('description',         desc.slice(0, 200));
    setMetaName('twitter:card',        'summary_large_image');
    setMetaName('twitter:title',       fullTitle);
    setMetaName('twitter:description', desc.slice(0, 200));
    setMetaName('twitter:image',       img);

    // Add Book schema markup if bookData provided
    if (bookData) {
      const bookSchema = {
        '@context': 'https://schema.org',
        '@type': 'Book',
        '@id': canonical,
        'name': bookData.title,
        'description': bookData.description || desc,
        'author': {
          '@type': 'Person',
          'name': 'Elijah Mwangi M',
          'url': `${ORIGIN}/founder`,
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'Ellines Haven',
          'url': ORIGIN,
        },
        'image': img,
        'isbn': bookData.isbn || undefined,
        'url': canonical,
        'bookEdition': bookData.edition || 'Digital Edition',
        'genre': bookData.genre || 'Fiction',
        'inLanguage': 'en',
        'datePublished': bookData.datePublished || '2024-01-01',
        'offers': {
          '@type': 'Offer',
          'availability': bookData.status === 'coming-soon' ? 'PreOrder' : 'InStock',
          'price': String(bookData.price || 0),
          'priceCurrency': 'KES',
          'url': canonical,
        },
      };

      // Add rating if available
      if (bookData.rating && bookData.reviews) {
        bookSchema.aggregateRating = {
          '@type': 'AggregateRating',
          'ratingValue': String(bookData.rating),
          'bestRating': '5',
          'worstRating': '1',
          'ratingCount': String(bookData.reviews),
        };
      }

      // Remove undefined fields
      Object.keys(bookSchema).forEach(key => 
        bookSchema[key] === undefined && delete bookSchema[key]
      );

      let scriptEl = document.querySelector('script[data-book-schema="true"]');
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.setAttribute('type', 'application/ld+json');
        scriptEl.setAttribute('data-book-schema', 'true');
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(bookSchema);
    }

    return () => {
      document.title = SITE;
      // Reset canonical to homepage on unmount
      setCanonical(ORIGIN + '/');
      // Remove book schema on unmount
      const bookScript = document.querySelector('script[data-book-schema="true"]');
      if (bookScript) bookScript.remove();
    };
  }, [title, description, image, url, type, bookData]); // eslint-disable-line
}
