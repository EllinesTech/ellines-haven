/**
 * Cloudflare Pages middleware — prevent sticky negative caching of missing
 * Vite hashed assets after a deploy.
 *
 * /assets/* 404s previously inherited CDN-Cache-Control: immutable from
 * _headers, so a transient miss could stick at the edge. Strip cache headers
 * on any non-2xx /assets/* response.
 *
 * Also serves Google Search Console HTML verification files with HTTP 200
 * (no redirect). Cloudflare Pages "Pretty URLs" otherwise 308-strips .html,
 * which breaks GSC HTML-file verification.
 */

/** Exact body Google expects for HTML-file ownership checks. */
const GSC_HTML_VERIFICATION = {
  '/google17caeb8194dadb8a.html':
    'google-site-verification: google17caeb8194dadb8a.html',
};

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);

  // Serve GSC verification at the exact .html URL Google requests (200, no 308).
  const gscBody = GSC_HTML_VERIFICATION[pathname];
  if (gscBody != null) {
    return new Response(gscBody + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'CDN-Cache-Control': 'public, max-age=3600, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const response = await context.next();

  if (!pathname.startsWith('/assets/')) {
    return response;
  }

  if (response.ok) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  headers.delete('ETag');
  headers.delete('Age');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
