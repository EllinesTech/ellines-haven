// v20260711-GODMODE — SW killed, chunk cache busted
// This string changes every build to force new chunk filename hashes
if (typeof window !== 'undefined' && window.__EH_BUILD__ === undefined) {
  window.__EH_BUILD__ = '20260711-T132900-GODMODE';
}
import { createRoot } from 'react-dom/client';
import { Component } from 'react';
import './index.css';
import App from './App.jsx';

// ── Enhanced global chunk error handler — catches ALL stale imports ─
// Covers errors that happen before React even starts or outside React boundaries
if (typeof window !== 'undefined') {
  // Track reload attempts to prevent infinite loops
  const RELOAD_KEY = 'eh_chunk_reload_global';
  const MAX_RELOADS = 3;
  const RELOAD_WINDOW = 5 * 60 * 1000; // 5 minutes
  
  const shouldAllowReload = () => {
    try {
      const stored = localStorage.getItem(RELOAD_KEY);
      if (!stored) return true;
      
      const { count, lastReload } = JSON.parse(stored);
      const now = Date.now();
      
      // Reset counter if enough time has passed
      if (now - lastReload > RELOAD_WINDOW) {
        localStorage.removeItem(RELOAD_KEY);
        return true;
      }
      
      // Block if too many reloads in the window
      return count < MAX_RELOADS;
    } catch {
      return true;
    }
  };
  
  const recordReload = () => {
    try {
      const stored = localStorage.getItem(RELOAD_KEY);
      const data = stored ? JSON.parse(stored) : { count: 0, lastReload: 0 };
      
      data.count++;
      data.lastReload = Date.now();
      
      localStorage.setItem(RELOAD_KEY, JSON.stringify(data));
    } catch {
      // Fail silently
    }
  };

  const forceFreshNavigation = () => {
    if (window.__EH_RELOADING__) return;
    window.__EH_RELOADING__ = true;
    const bust = () => {
      window.location.replace(window.location.pathname + '?_eh=' + Date.now() + (window.location.hash || ''));
    };
    const cleanup = Promise.all([
      'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistrations().then((regs) =>
            Promise.all(regs.map((r) => r.unregister()))
          )
        : Promise.resolve(),
      'caches' in window
        ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        : Promise.resolve(),
    ]);
    const timer = setTimeout(bust, 600);
    cleanup.then(() => { clearTimeout(timer); bust(); }).catch(() => { clearTimeout(timer); bust(); });
  };

  // True stale-chunk / MIME failures only — do NOT match every /assets/ runtime error
  const isStaleChunkMessage = (msg = '', error = null) =>
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Unable to preload CSS') ||
    /MIME type .* text\/html/i.test(msg) ||
    /Unexpected token '<'/.test(msg) ||
    error?.name === 'ChunkLoadError';

  // Global error event handler
  window.addEventListener('error', (e) => {
    if (window.__EH_RELOADING__) return;
    if (!isStaleChunkMessage(e.message || '', e.error)) return;

    console.warn('[Global Chunk Error Handler] Detected stale chunk:', e.message);

    // Never reload while user is reading — they'd lose their progress
    if (window.location.pathname.startsWith('/read')) {
      console.warn('[Global Chunk Error Handler] Skipping reload - user is reading');
      return;
    }

    if (!shouldAllowReload()) {
      console.warn('[Global Chunk Error Handler] Too many reloads, showing manual refresh UI');
      return;
    }

    recordReload();
    console.log('[Global Chunk Error Handler] Auto-reloading to fetch fresh chunks...');
    forceFreshNavigation();
  });

  // Promise rejection handler for dynamic imports
  window.addEventListener('unhandledrejection', (e) => {
    if (window.__EH_RELOADING__) return;
    const reason = e.reason;
    const msg = reason?.message || String(reason || '');
    if (!isStaleChunkMessage(msg, reason)) return;

    console.warn('[Promise Rejection Handler] Detected chunk error:', msg);

    if (window.location.pathname.startsWith('/read')) {
      console.warn('[Promise Rejection Handler] Skipping reload - user is reading');
      return;
    }

    if (!shouldAllowReload()) {
      console.warn('[Promise Rejection Handler] Too many reloads, skipping');
      return;
    }

    recordReload();
    console.log('[Promise Rejection Handler] Auto-reloading...');
    forceFreshNavigation();
    e.preventDefault();
  });
}

/* ── Top-level error boundary — catches any render crash and shows it ── */
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[RootErrorBoundary] Render crash:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d0d1a', color: '#f0ece2', fontFamily: 'monospace',
          padding: 40, gap: 16, textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem' }}>💥</div>
          <h2 style={{ color: '#c9a84c', fontSize: '1.2rem' }}>App crashed — check console for details</h2>
          <pre style={{
            background: '#13132b', padding: '16px 20px', borderRadius: 8,
            fontSize: '0.78rem', color: '#e74c3c', maxWidth: 700,
            whiteSpace: 'pre-wrap', textAlign: 'left', border: '1px solid rgba(231,76,60,0.3)',
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack?.slice(0, 600)}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ padding: '10px 24px', background: '#c9a84c', color: '#0d0d1a', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            🔄 Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
