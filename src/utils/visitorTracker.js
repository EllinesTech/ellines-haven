/**
 * Visitor Tracking Utility
 *
 * Writes visit docs to Firestore only. Does NOT call trackVisitorHttp /
 * Cloud Functions from the browser — those 500s always show as red console
 * errors even when caught, and adblockers/network tools amplify the noise.
 *
 * Geo enrichment (if needed) belongs in Admin → Visitors (manual) or a
 * server-side trigger after functions are healthy.
 */

const VISITOR_QUEUE_KEY = 'eh_visitor_queue';
const LAST_VISITOR_LOG = 'eh_last_visitor_log';

function buildPayload(trackData) {
  return {
    page: (trackData.page || '/').slice(0, 200),
    referrer: (trackData.referrer || 'direct').slice(0, 200),
    userAgent: (trackData.userAgent || '').slice(0, 300),
    device: trackData.device || 'Desktop',
    userEmail: trackData.userEmail || '',
    userName: trackData.userName || '',
  };
}

/**
 * Track a visitor with zero Cloud Function HTTP from the browser.
 */
export async function trackVisitorReliable(trackData, options = {}) {
  const { isRetry = false } = options;
  const payload = buildPayload(trackData);

  try {
    const { db } = await import('../firebase');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

    await addDoc(collection(db, 'site_visitors'), {
      ip: '',
      rawIp: '',
      city: '',
      region: '',
      country: '',
      countryCode: '',
      lat: null,
      lon: null,
      isp: '',
      org: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      page: payload.page,
      referrer: payload.referrer,
      userAgent: payload.userAgent,
      device: payload.device,
      ...(payload.userEmail ? { userEmail: payload.userEmail, userName: payload.userName || '' } : {}),
      visitedAt: serverTimestamp(),
      visitedAtMs: Date.now(),
      _needsGeo: true,
    });

    clearVisitorQueue();
    return { success: true, data: { ok: true } };
  } catch (error) {
    queueForRetry(trackData, isRetry ? 1 : 0);
    return { success: false, error: error?.message || 'track_failed' };
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
        const { queuedAt, retryCount: _r, ...trackData } = item;
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
