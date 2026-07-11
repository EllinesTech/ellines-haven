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
  const { isRetry = false, maxRetries = 3 } = options;
  
  try {
    console.log('[visitorTracker] 📤 Attempting to track visitor:', JSON.stringify(trackData));
    
    // Import dynamically to avoid circular dependencies
    console.log('[visitorTracker] 📦 Importing firebase functions...');
    let callTrackVisitor, callTrackVisitorHttp;
    try {
      const firebaseModule = await import('../firebase');
      callTrackVisitor = firebaseModule.callTrackVisitor;
      callTrackVisitorHttp = firebaseModule.callTrackVisitorHttp;
      console.log('[visitorTracker] ✅ Firebase functions imported successfully');
    } catch (importErr) {
      console.error('[visitorTracker] ❌ FAILED to import firebase functions:', importErr.message);
      throw importErr;
    }
    
    // Add retry count to payload for debugging
    const payload = {
      ...trackData,
      _isRetry: isRetry,
      _clientTimestamp: new Date().toISOString(),
    };
    
    console.log('[visitorTracker] 🌐 Attempting Cloud Function call (onCall)...');
    
    let result;
    try {
      // Try the callable function first
      result = await callTrackVisitor(payload);
      console.log('[visitorTracker] 📨 onCall response received:', JSON.stringify(result));
    } catch (callErr) {
      console.error('[visitorTracker] ⚠️ onCall failed with error:', callErr.message);
      console.error('[visitorTracker] Error code:', callErr.code);
      
      // If it's a 403 or auth error, try HTTP endpoint as fallback
      if (callErr.code === 'permission-denied' || callErr.code === 403) {
        console.log('[visitorTracker] 🔄 FALLBACK: Trying HTTP endpoint due to auth error...');
        try {
          result = await callTrackVisitorHttp(payload);
          console.log('[visitorTracker] ✅ HTTP fallback worked:', JSON.stringify(result));
        } catch (httpErr) {
          console.error('[visitorTracker] ❌ HTTP fallback also failed:', httpErr.message);
          throw httpErr;
        }
      } else {
        throw callErr;
      }
    }
    
    console.log('[visitorTracker] 📊 Response data.ok:', result?.data?.ok);
    console.log('[visitorTracker] 📊 Full response data:', JSON.stringify(result?.data));
    
    if (result?.data?.ok) {
      console.log('[visitorTracker] ✅ Visitor tracked successfully!');
      console.log('[visitorTracker] 🌍 IP:', result.data.ip);
      console.log('[visitorTracker] 📍 Location:', result.data.city, result.data.country);
      console.log('[visitorTracker] 🆔 Document ID:', result.data.docId);
      
      // Log successful tracking for debugging
      logSuccessfulTracking({
        ...payload,
        ...result.data,
      });
      
      // Clear any retry queue
      clearVisitorQueue();
      
      return { success: true, data: result.data };
    } else {
      console.error('[visitorTracker] ❌ Cloud Function returned not ok');
      console.error('[visitorTracker] ❌ Response data:', JSON.stringify(result?.data));
      if (result?.data?.error) {
        console.error('[visitorTracker] ❌ Cloud Function error message:', result.data.error);
      }
      // Queue for retry
      queueForRetry(trackData, isRetry ? 1 : 0);
      return { success: false, error: 'Cloud function returned not ok: ' + (result?.data?.error || 'unknown') };
    }
  } catch (error) {
    console.error('[visitorTracker] ❌ EXCEPTION while tracking visitor:', error.message);
    console.error('[visitorTracker] ❌ Exception details:', {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack?.substring(0, 500),
    });
    
    // Queue for retry
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
