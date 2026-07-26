/**
 * Visitor Tracking Utility
 * Client writes the visit immediately; geo enrichment is server-side only
 * (ip-api.com blocks browser HTTPS → console 403 noise).
 */

const VISITOR_QUEUE_KEY = 'eh_visitor_queue';
const LAST_VISITOR_LOG = 'eh_last_visitor_log';
const GEO_ENRICH_URL = 'https://us-central1-ellines-haven-web.cloudfunctions.net/trackVisitorHttp';

/**
 * Track a visitor — Firestore write first, then silent server geo enrich.
 */
export async function trackVisitorReliable(trackData, options = {}) {
  const { isRetry = false } = options;

  try {
    const { db } = await import('../firebase');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

    const ua = trackData.userAgent || '';

    const visitData = {
      ip:          '',
      rawIp:       '',
      city:        '',
      region:      '',
      country:     '',
      countryCode: '',
      lat:         null,
      lon:         null,
      isp:         '',
      org:         '',
      timezone:    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      page:        (trackData.page     || '/').slice(0, 200),
      referrer:    (trackData.referrer || 'direct').slice(0, 200),
      userAgent:   ua.slice(0, 300),
      device:      trackData.device || 'Desktop',
      ...(trackData.userEmail ? { userEmail: trackData.userEmail, userName: trackData.userName || '' } : {}),
      visitedAt:   serverTimestamp(),
      visitedAtMs: Date.now(),
      _needsGeo:   true,
    };

    const docRef = await addDoc(collection(db, 'site_visitors'), visitData);

    // Server-side geo (ip-api over HTTP from Cloud Function) — never call ip-api from the browser
    enrichGeoViaCloudFunction(docRef.id, trackData).catch(() => {});

    clearVisitorQueue();
    return { success: true, data: { ok: true, docId: docRef.id } };

  } catch (error) {
    queueForRetry(trackData, isRetry ? 1 : 0);
    return { success: false, error: error.message };
  }
}

/** Fire-and-forget geo enrichment via Cloud Function (no console noise on failure). */
async function enrichGeoViaCloudFunction(docId, trackData) {
  try {
    const res = await fetch(GEO_ENRICH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _docId: docId,
        page: trackData.page || '/',
        referrer: trackData.referrer || 'direct',
        userAgent: trackData.userAgent || '',
        device: trackData.device || 'Desktop',
        userEmail: trackData.userEmail || '',
        userName: trackData.userName || '',
      }),
      signal: AbortSignal.timeout(12000),
    });
    // Swallow non-OK — visit is already recorded; geo is best-effort
    if (!res.ok) await res.text().catch(() => {});
  } catch {
    /* silent */
  }
}

function queueForRetry(trackData, retryCount = 0) {
  try {
    if (retryCount >= 3) return;

    let queue = [];
    const stored = sessionStorage.getItem(VISITOR_QUEUE_KEY);
    if (stored) {
      try { queue = JSON.parse(stored); } catch { queue = []; }
    }

    queue.push({
      ...trackData,
      queuedAt: Date.now(),
      retryCount: retryCount + 1,
    });

    if (queue.length > 10) queue.shift();
    sessionStorage.setItem(VISITOR_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* ignore */ }
}

/**
 * Process queued visitor tracking attempts
 */
export async function processVisitorQueue() {
  try {
    const stored = sessionStorage.getItem(VISITOR_QUEUE_KEY);
    if (!stored) return { processed: 0 };

    let queue = [];
    try { queue = JSON.parse(stored); } catch { return { processed: 0 }; }
    if (queue.length === 0) return { processed: 0 };

    let processed = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        const { queuedAt, retryCount, ...trackData } = item;
        if (Date.now() - queuedAt > 24 * 60 * 60 * 1000) continue;
        await new Promise((r) => setTimeout(r, 500));
        const result = await trackVisitorReliable(trackData, { isRetry: true });
        if (result.success) processed++;
        else remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length === 0) sessionStorage.removeItem(VISITOR_QUEUE_KEY);
    else sessionStorage.setItem(VISITOR_QUEUE_KEY, JSON.stringify(remaining));

    return { processed, remaining: remaining.length };
  } catch {
    return { processed: 0 };
  }
}

function clearVisitorQueue() {
  try { sessionStorage.removeItem(VISITOR_QUEUE_KEY); } catch { /* ignore */ }
}

export function getVisitorTrackingLogs() {
  try {
    const stored = sessionStorage.getItem(LAST_VISITOR_LOG);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function getVisitorQueueStatus() {
  try {
    const stored = sessionStorage.getItem(VISITOR_QUEUE_KEY);
    if (!stored) return { queued: 0, items: [] };
    const queue = JSON.parse(stored);
    return {
      queued: queue.length,
      items: queue.map((item) => ({
        page: item.page,
        device: item.device,
        retryCount: item.retryCount || 0,
      })),
    };
  } catch {
    return { queued: 0, items: [] };
  }
}
