/**
 * Cloudflare Pages middleware — prevent sticky negative caching of missing
 * Vite hashed assets after a deploy.
 *
 * /assets/* 404s previously inherited CDN-Cache-Control: immutable from
 * _headers, so a transient miss could stick at the edge. Strip cache headers
 * on any non-2xx /assets/* response.
 */

export async function onRequest(context) {
  const response = await context.next();
  const { pathname } = new URL(context.request.url);

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
