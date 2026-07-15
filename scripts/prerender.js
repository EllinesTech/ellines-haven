/**
 * prerender.js — Static HTML pre-population for SEO
 *
 * Runs AFTER `vite build`. For each public route, it copies dist/index.html
 * into dist/<route>/index.html and patches the <head> with route-specific:
 *   - <title>
 *   - <meta name="description">
 *   - <meta property="og:*"> + twitter:*
 *   - <link rel="canonical">
 *   - JSON-LD structured data
 *
 * Googlebot gets real content in the initial HTML response — no JS needed.
 * React still hydrates normally for users.
 *
 * Usage: node scripts/prerender.js
 */

import fs   from 'fs';
import path from 'path';

const DIST   = path.resolve('dist');
const ORIGIN = 'https://haven.ellines.co.ke';
const SITE   = 'Ellines Haven';

// ── Route definitions ─────────────────────────────────────────────────────────
// Each entry: { path, title, description, image?, type?, schema? }
const ROUTES = [
  {
    path: '/',
    title: `${SITE} | Home For The Story Soul`,
    description: "Kenya's premier digital bookstore — original novels and short stories by Elijah Mwangi M, inspired by true East African stories. Buy once, read forever.",
    image: '/og-image.png',
    type: 'website',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE,
      url: ORIGIN,
      description: "Kenya's premier digital bookstore — original novels and short stories by Elijah Mwangi M.",
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/library?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  },
  {
    path: '/library',
    title: `The Library — ${SITE}`,
    description: 'Browse all original novels and short stories by Elijah Mwangi M — East African fiction. Buy, read online, and download forever.',
    image: '/og-image.png',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Book Library — ${SITE}`,
      url: `${ORIGIN}/library`,
      description: 'Browse all original novels and short stories by Elijah Mwangi M.',
    },
  },
  {
    path: '/about',
    title: `About Ellines Haven — ${SITE}`,
    description: 'A sanctuary for original African literature — stories born from real life, written in Kenya, read by the world. Learn about Ellines Haven and our mission.',
    image: '/og-image.png',
  },
  {
    path: '/founder',
    title: `Meet the Founder — Elijah Mwangi M | ${SITE}`,
    description: "Elijah Mwangi M is a Kenyan author, software engineer and AI developer — founder of Ellines Haven. Discover his story and the inspiration behind East Africa's premier literary platform.",
    image: '/mwangi.png',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Elijah Mwangi M',
      url: `${ORIGIN}/founder`,
      image: `${ORIGIN}/mwangi.png`,
      jobTitle: ['Author', 'Software Engineer', 'AI Developer'],
      description: 'Kenyan author, software engineer and AI developer. Founder of Ellines Haven.',
      worksFor: { '@type': 'Organization', name: 'Ellines Haven', url: ORIGIN },
      nationality: { '@type': 'Country', name: 'Kenya' },
    },
  },
  {
    path: '/contact',
    title: `Contact Us — ${SITE}`,
    description: 'Get in touch with Ellines Haven — chat on WhatsApp, email us, or use the contact form. We reply fast.',
    image: '/og-image.png',
  },
  {
    path: '/faq',
    title: `FAQ — Frequently Asked Questions | ${SITE}`,
    description: 'Answers to common questions about payments (M-Pesa, Paystack, PayPal), reading, downloads, account access, and more on Ellines Haven.',
    image: '/og-image.png',
  },
  {
    path: '/login',
    title: `Sign In — ${SITE}`,
    description: 'Sign in to Ellines Haven to access your library, purchase history, and reading progress.',
    image: '/og-image.png',
  },
  {
    path: '/register',
    title: `Create Account — ${SITE}`,
    description: 'Join Ellines Haven — create your free account to buy original East African novels, read online, and download books forever.',
    image: '/og-image.png',
  },
  {
    path: '/privacy',
    title: `Privacy Policy — ${SITE}`,
    description: 'How Ellines Haven collects, uses, and protects your personal data. Read our full Privacy Policy.',
  },
  {
    path: '/terms',
    title: `Terms of Service — ${SITE}`,
    description: 'Read the Ellines Haven Terms of Service — covering purchases, refunds, digital content licensing, and your rights as a reader.',
  },

  // ── Book pages ──────────────────────────────────────────────────────────────
  ...buildBookRoutes(),
];

function buildBookRoutes() {
  return [
    {
      slug: 'marriage-is-a-scam',
      title: 'Marriage Is a Scam',
      genre: 'Drama',
      description: 'A deeply emotional novel about love, betrayal, and the hidden battles inside modern marriage. Set in Nairobi, Kenya. By Elijah Mwangi M.',
      image: '/cover-marriage-is-a-scam.webp',
      price: 400,
      pages: 250,
      rating: 4.8,
      reviews: 187,
      date: '2024-08-01',
    },
    {
      slug: 'pain',
      title: 'Pain',
      genre: 'Drama',
      description: "Elijah Mwangi M's most personal work — a raw, honest novel about grief, trauma, and the long road back to yourself. Set in Nairobi, Kenya.",
      image: '/cover-pain.webp',
      price: 320,
      pages: 278,
      rating: 4.8,
      reviews: 143,
      date: '2024-10-15',
    },
    {
      slug: 'echoes-of-the-savanna',
      title: 'Echoes of the Savanna',
      genre: 'Historical Fiction',
      description: 'A sweeping historical novel set in colonial Kenya, following a young woman fighting for her family\'s land and dignity. By Elijah Mwangi M.',
      image: '/cover-echoes-savanna.svg',
      price: 250,
      pages: 342,
      rating: 4.8,
      reviews: 124,
      date: '2024-01-15',
    },
    {
      slug: 'seven-sunsets',
      title: 'Seven Sunsets',
      genre: 'Short Stories',
      description: 'Seven lives, seven sunsets — short stories unfolding across unforgettable evenings in East Africa. By Elijah Mwangi M.',
      image: '/cover-seven-sunsets.svg',
      price: 150,
      pages: 98,
      rating: 4.9,
      reviews: 201,
      date: '2023-09-20',
    },
    {
      slug: 'midnight-in-mombasa',
      title: 'Midnight in Mombasa',
      genre: 'Mystery',
      description: 'A gripping mystery thriller soaked in the heat and intrigue of the Swahili coast. By Elijah Mwangi M.',
      image: '/cover-midnight-mombasa.svg',
      price: 280,
      pages: 289,
      rating: 4.6,
      reviews: 89,
      date: '2024-06-01',
    },
    {
      slug: 'the-acacia-road',
      title: 'The Acacia Road',
      genre: 'Romance',
      description: 'A tender romance about two strangers on a dusty Rift Valley road — second chances, secrets, and the courage to be vulnerable. By Elijah Mwangi M.',
      image: '/cover-acacia-road.svg',
      price: 230,
      pages: 310,
      rating: 4.7,
      reviews: 156,
      date: '2024-05-10',
    },
    {
      slug: 'children-of-thunder',
      title: 'Children of Thunder',
      genre: 'Fantasy',
      description: 'An epic fantasy rooted in East African mythology — a world where lightning speaks and one girl must learn its language before darkness consumes the land. By Elijah Mwangi M.',
      image: '/cover-children-thunder.svg',
      price: 300,
      pages: 420,
      rating: 4.5,
      reviews: 67,
      date: '2024-06-20',
    },
    {
      slug: 'nairobi-nights',
      title: 'Nairobi Nights',
      genre: 'Short Stories',
      description: 'Three raw tales of love, ambition and midnight decisions in Nairobi — the city that never sleeps. By Elijah Mwangi M.',
      image: '/cover-nairobi-nights.svg',
      price: 120,
      pages: 75,
      rating: 4.4,
      reviews: 43,
      date: '2023-11-05',
    },
    {
      slug: 'chasing-ghosts-and-supercars',
      title: 'Chasing Ghosts and Supercars',
      genre: 'Drama',
      description: 'A gripping novel of speed, obsession, and the ghosts we chase in the dark — through the streets of Nairobi. By Elijah Mwangi M.',
      image: '/cover-chasing-her-ghosts.webp',
      price: 250,
      date: '2025-01-01',
    },
    {
      slug: '19-days',
      title: '19 Days',
      genre: 'Drama',
      description: 'Nineteen relentless days in the life of one man caught between who he was and who he must become. Inspired by true events. By Elijah Mwangi M.',
      image: '/cover-19-days.webp',
      price: 350,
      date: '2025-06-01',
    },
    {
      slug: 'the-last-chapter',
      title: 'The Last Chapter',
      genre: 'Drama',
      description: 'A haunting novel about closure, loss, and the stories we tell ourselves to survive — coming soon from Elijah Mwangi M.',
      image: '/cover-the-last-chapter.webp',
      date: '2025-01-01',
    },
    {
      slug: 'letters-from-lamu',
      title: 'Letters from Lamu',
      genre: 'Romance',
      description: 'A love story written in letters across the Indian Ocean — set on Lamu Island, Kenya. Coming soon from Elijah Mwangi M.',
      date: '2025-09-01',
    },
    {
      slug: 'the-nairobi-hustle',
      title: 'The Nairobi Hustle',
      genre: 'Drama',
      description: "A raw portrait of ambition, desperation, and survival in Nairobi — three young men chasing the same dream through different games. Coming soon from Elijah Mwangi M.",
      date: '2025-10-15',
    },
    {
      slug: 'roots-of-the-rift',
      title: 'Roots of the Rift',
      genre: 'Historical Fiction',
      description: "A sweeping generational saga set in Kenya's Great Rift Valley, tracing one family from the 1940s to today. Coming soon from Elijah Mwangi M.",
      date: '2025-11-20',
    },
  ].map(b => ({
    path: `/book/${b.slug}`,
    title: `${b.title} by Elijah Mwangi M — ${SITE}`,
    description: b.description,
    image: b.image || '/og-image.png',
    type: 'book',
    schema: b.rating ? {
      '@context': 'https://schema.org',
      '@type': 'Book',
      name: b.title,
      author: { '@type': 'Person', name: 'Elijah Mwangi M', url: `${ORIGIN}/founder` },
      url: `${ORIGIN}/book/${b.slug}`,
      description: b.description,
      genre: b.genre,
      inLanguage: 'en',
      ...(b.pages && { numberOfPages: b.pages }),
      ...(b.image && !b.image.endsWith('.svg') && { image: `${ORIGIN}${b.image}` }),
      ...(b.date && { datePublished: b.date }),
      ...(b.reviews && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: b.rating,
          reviewCount: b.reviews,
          bestRating: 5,
          worstRating: 1,
        },
      }),
      publisher: { '@type': 'Organization', name: SITE, url: ORIGIN },
      offers: b.price ? {
        '@type': 'Offer',
        price: b.price,
        priceCurrency: 'KES',
        availability: 'https://schema.org/InStock',
        url: `${ORIGIN}/book/${b.slug}`,
        seller: { '@type': 'Organization', name: SITE },
      } : undefined,
    } : undefined,
  }));
}

// ── HTML patching ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function patchHtml(template, route) {
  const { path: routePath, title, description, image, type = 'website', schema } = route;

  const absImage   = image
    ? (image.startsWith('http') ? image : `${ORIGIN}${image}`)
    : `${ORIGIN}/og-image.png`;
  const canonical  = `${ORIGIN}${routePath === '/' ? '' : routePath}`;
  const safeTitle  = escapeHtml(title);
  const safeDesc   = escapeHtml(description.slice(0, 200));
  const safeImg    = escapeHtml(absImage);
  const safeUrl    = escapeHtml(canonical);
  const safeType   = escapeHtml(type);

  let html = template;

  // 1. Page title
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${safeTitle}</title>`
  );

  // 2. Meta description
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${safeDesc}$2`
  );

  // 3. Canonical
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${safeUrl}$2`
  );

  // 4. OG tags — update content= on existing tags
  const ogPatch = (property, value) => {
    const safe = escapeHtml(value);
    const re   = new RegExp(`(<meta\\s+property="${property.replace(':', '\\:')}?"\\s+content=")[^"]*(")`);
    if (re.test(html)) {
      html = html.replace(re, `$1${safe}$2`);
    } else {
      // Insert before </head>
      html = html.replace('</head>', `  <meta property="${property}" content="${safe}" />\n</head>`);
    }
  };

  ogPatch('og:title',       title);
  ogPatch('og:description', description.slice(0, 200));
  ogPatch('og:type',        type);
  ogPatch('og:url',         canonical);
  ogPatch('og:image',       absImage);

  // 5. Twitter tags
  const twPatch = (name, value) => {
    const safe = escapeHtml(value);
    const re   = new RegExp(`(<meta\\s+name="${name.replace(':', '\\:')}?"\\s+content=")[^"]*(")`);
    if (re.test(html)) {
      html = html.replace(re, `$1${safe}$2`);
    } else {
      html = html.replace('</head>', `  <meta name="${name}" content="${safe}" />\n</head>`);
    }
  };

  twPatch('twitter:title',       title);
  twPatch('twitter:description', description.slice(0, 200));
  twPatch('twitter:image',       absImage);

  // 6. JSON-LD structured data — inject per-route schema replacing the generic WebSite one
  if (schema) {
    const schemaJson = JSON.stringify(schema, null, 2);
    // Insert just before </head>
    html = html.replace(
      '</head>',
      `  <script type="application/ld+json" id="eh-route-schema">\n${schemaJson}\n  </script>\n</head>`
    );
  }

  return html;
}

// ── Write pre-rendered files ──────────────────────────────────────────────────

function run() {
  const templatePath = path.join(DIST, 'index.html');
  if (!fs.existsSync(templatePath)) {
    console.error('[prerender] dist/index.html not found — run vite build first');
    process.exit(1);
  }

  const template = fs.readFileSync(templatePath, 'utf-8');
  let   count    = 0;

  for (const route of ROUTES) {
    const patched = patchHtml(template, route);

    if (route.path === '/') {
      // Overwrite root index.html in place
      fs.writeFileSync(templatePath, patched);
      console.log(`[prerender] ✓ /  → dist/index.html`);
    } else {
      // Create dist/<route>/index.html
      const dir = path.join(DIST, route.path);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), patched);
      console.log(`[prerender] ✓ ${route.path}  → dist${route.path}/index.html`);
    }
    count++;
  }

  console.log(`\n[prerender] ✅ Pre-rendered ${count} routes`);
}

run();
