/**
 * Visitor Tracking Utility
 * Ensures reliable visitor tracking with retry logic and debugging
 */

const VISITOR_QUEUE_KEY = 'eh_visitor_queue';
const LAST_VISITOR_LOG = 'eh_last_visitor_log';

/**
 * Track a visitor by calling the Cloud Function
 * Returns success/failure and logs for debugging
 */
export async function trackVisitorReliable(trackData, options = {}) {
  const { isRetry = false } = options;
  
  try {
    console.log('[visitorTracker] 📤 Tracking visitor:', trackData.page);
    
    const { db } = await import('../firebase');
    const { collection, addDoc, serverTimestamp, updateDoc, doc } = await import('firebase/firestore');
    
    const ua = trackData.userAgent || '';

    // Step 1: Get real IP from client (fast, free service)
    let clientIp = '';
    let geo = {};
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
      const ipData = await ipRes.json();
      clientIp = ipData.ip || '';
    } catch { /* silent — still record visit without IP */ }

    // Step 2: Write visit to Firestore immediately (with IP if available)
    const visitData = {
      ip:          clientIp,
      rawIp:       clientIp,
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
      _needsGeo:   !!clientIp,  // only needs geo if we got an IP
    };
    
    const docRef = await addDoc(collection(db, 'site_visitors'), visitData);
    console.log('[visitorTracker] ✅ Visit recorded:', docRef.id, clientIp ? `(IP: ${clientIp})` : '(no IP)');
    
    // Step 3: Enrich with geo data if we have an IP (non-blocking)
    if (clientIp) {
      (async () => {
        try {
          const geoRes = await fetch(
            `https://ip-api.com/json/${clientIp}?fields=status,country,countryCode,regionName,city,lat,lon,isp,org,timezone,query`,
            { signal: AbortSignal.timeout(5000) }
          );
          const geoData = await geoRes.json();
          if (geoData.status === 'success') {
            await updateDoc(doc(db, 'site_visitors', docRef.id), {
              ip:          geoData.query || clientIp,
              city:        geoData.city || '',
              region:      geoData.regionName || '',
              country:     geoData.country || '',
              countryCode: geoData.countryCode || '',
              lat:         geoData.lat || null,
              lon:         geoData.lon || null,
              isp:         geoData.isp || geoData.org || '',
              org:         geoData.org || '',
              timezone:    geoData.timezone || '',
              _needsGeo:   false,
            });
            console.log('[visitorTracker] 🌍 Geo enriched:', geoData.city, geoData.country);
          }
        } catch { /* silent — geo is best-effort */ }
      })();
    }
    
    clearVisitorQueue();
    return { success: true, data: { ok: true, docId: docRef.id, ip: clientIp } };
    
  } catch (error) {
    console.error('[visitorTracker] ❌ Failed:', error.message);
    queueForRetry(trackData, isRetry ? 1 : 0);
    return { success: false, error: error.message };
  }
}

/**
 * Queue visitor tracking for retry
 */
function queueForRetry(trackData, retryCount = 0) {
  try {
    if (retryCount >= 3) {
      console.warn('[visitorTracker] Max retries reached, discarding tracking');
      return;
    }
    
    let queue = [];
    const stored = sessionStorage.getItem(VISITOR_QUEUE_KEY);
    if (stored) {
      try {
        queue = JSON.parse(stored);
      } catch (e) {
        console.warn('[visitorTracker] Failed to parse queue:', e);
        queue = [];
      }
    }
    
    queue.push({
      ...trackData,
      queuedAt: Date.now(),
      retryCount: retryCount + 1,
    });
    
    // Keep queue size manageable
    if (queue.length > 10) {
      queue.shift();
    }
    
    sessionStorage.setItem(VISITOR_QUEUE_KEY, JSON.stringify(queue));
    console.log('[visitorTracker] Queued for retry, attempt', retryCount + 1);
  } catch (e) {
    console.warn('[visitorTracker] Failed to queue for retry:', e);
  }
}

/**
 * Process queued visitor tracking attempts
 * Call this on app load to retry failed tracking
 */
export async function processVisitorQueue() {
  try {
    const stored = sessionStorage.getItem(VISITOR_QUEUE_KEY);
    if (!stored) return { processed: 0 };
    
    let queue = [];
    try {
      queue = JSON.parse(stored);
    } catch (e) {
      console.warn('[visitorTracker] Failed to parse queue for processing:', e);
      return { processed: 0 };
    }
    
    if (queue.length === 0) return { processed: 0 };
    
    console.log('[visitorTracker] Processing', queue.length, 'queued visitor tracking attempts');
    
    let processed = 0;
    let remaining = [];
    
    for (const item of queue) {
      try {
        const { queuedAt, retryCount, ...trackData } = item;
        
        // Don't retry too old items (older than 24 hours)
        if (Date.now() - queuedAt > 24 * 60 * 60 * 1000) {
          console.warn('[visitorTracker] Skipping too-old queued item from', new Date(queuedAt));
          continue;
        }
        
        // Add delay between retries to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const result = await trackVisitorReliable(trackData, {
          isRetry: true,
          maxRetries: retryCount,
        });
        
        if (result.success) {
          processed++;
        } else {
          // If still failed, keep in queue
          remaining.push(item);
        }
      } catch (e) {
        console.warn('[visitorTracker] Error processing queued item:', e.message);
        remaining.push(item);
      }
    }
    
    // Update queue with remaining items
    if (remaining.length === 0) {
      sessionStorage.removeItem(VISITOR_QUEUE_KEY);
      console.log('[visitorTracker] ✅ All queued items processed successfully');
    } else {
      sessionStorage.setItem(VISITOR_QUEUE_KEY, JSON.stringify(remaining));
      console.warn('[visitorTracker] ⚠️ Some items still queued:', remaining.length);
    }
    
    return { processed, remaining: remaining.length };
  } catch (e) {
    console.error('[visitorTracker] Error processing queue:', e);
    return { processed: 0, error: e.message };
  }
}

/**
 * Clear the visitor queue
 */
function clearVisitorQueue() {
  try {
    sessionStorage.removeItem(VISITOR_QUEUE_KEY);
  } catch (e) {
    console.warn('[visitorTracker] Failed to clear queue:', e);
  }
}

/**
 * Log successful tracking for debugging
 */
function logSuccessfulTracking(data) {
  try {
    const logs = [];
    const stored = sessionStorage.getItem(LAST_VISITOR_LOG);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          logs.push(...parsed);
        }
      } catch {}
    }
    
    logs.push({
      timestamp: Date.now(),
      page: data.page,
      ip: data.ip,
      country: data.country,
      device: data.device,
    });
    
    // Keep last 20 log entries
    if (logs.length > 20) {
      logs.shift();
    }
    
    sessionStorage.setItem(LAST_VISITOR_LOG, JSON.stringify(logs));
  } catch (e) {
    console.warn('[visitorTracker] Failed to log tracking:', e);
  }
}

/**
 * Get visitor tracking logs for debugging
 */
export function getVisitorTrackingLogs() {
  try {
    const stored = sessionStorage.getItem(LAST_VISITOR_LOG);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.warn('[visitorTracker] Failed to get logs:', e);
    return [];
  }
}

/**
 * Get visitor queue status
 */
export function getVisitorQueueStatus() {
  try {
    const stored = sessionStorage.getItem(VISITOR_QUEUE_KEY);
    if (!stored) return { queued: 0, items: [] };
    const queue = JSON.parse(stored);
    return {
      queued: queue.length,
      items: queue.map(item => ({
        page: item.page,
        device: item.device,
        retryCount: item.retryCount || 0,
      })),
    };
  } catch (e) {
    console.warn('[visitorTracker] Failed to get queue status:', e);
    return { queued: 0, items: [] };
  }
}
