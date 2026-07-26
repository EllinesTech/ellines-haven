// PWA install state (does not preventDefault — avoids Chrome "Banner not shown" warning)
import './utils/pwaBootstrap.js';
import { createRoot } from 'react-dom/client';
import { Component } from 'react';
import './index.css';
import App from './App.jsx';
import {
  hardReload,
  isChunkLoadError,
  tryRecoverFromChunkError,
} from './utils/chunkRecovery.js';

// ── Global chunk error handler — stale imports before / outside React ─
if (typeof window !== 'undefined') {
  const RELOAD_KEY = 'eh_chunk_reload_global';
  const MAX_RELOADS = 3;
  const RELOAD_WINDOW = 5 * 60 * 1000;

  const shouldAllowReload = () => {
    try {
      const stored = localStorage.getItem(RELOAD_KEY);
      if (!stored) return true;
      const { count, lastReload } = JSON.parse(stored);
      if (Date.now() - lastReload > RELOAD_WINDOW) {
        localStorage.removeItem(RELOAD_KEY);
        return true;
      }
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
      /* ignore */
    }
  };

  const tryGlobalChunkRecover = (msg, error) => {
    if (window.__EH_RELOADING__) return false;
    if (!isChunkLoadError(error || msg)) return false;
    if (window.location.pathname.startsWith('/read')) return false;
    if (!shouldAllowReload()) return false;
    recordReload();
    hardReload();
    return true;
  };

  window.addEventListener('error', (e) => {
    if (tryGlobalChunkRecover(e.message || '', e.error)) {
      console.warn('[Global Chunk Error Handler] Auto-reloading:', e.message);
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    if (window.__EH_RELOADING__) return;
    const reason = e.reason;
    const msg = reason?.message || String(reason || '');
    const code = String(reason?.code || reason?.name || '');

    if (
      code.includes('permission-denied') ||
      code.includes('functions/') ||
      code.includes('unauthenticated') ||
      msg.includes('permission-denied') ||
      msg.includes('Missing or insufficient permissions') ||
      (reason && typeof reason === 'object' && !reason.stack && (reason.code || reason.details))
    ) {
      console.warn('[UnhandledRejection] suppressed:', code || msg || reason);
      e.preventDefault();
      return;
    }

    if (tryGlobalChunkRecover(msg, reason)) {
      console.warn('[Promise Rejection Handler] Auto-reloading:', msg);
      e.preventDefault();
    }
  });
}

/* ── Top-level error boundary — recover stale chunks; otherwise show crash UI ── */
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, recovering: false };
  }
  static getDerivedStateFromError(error) {
    // Always keep a fallback UI for chunk errors — returning "no error" rethrows
    // into an unrecoverable crash loop.
    if (isChunkLoadError(error)) {
      return { error, recovering: true };
    }
    return { error, recovering: false };
  }
  componentDidCatch(error, info) {
    if (isChunkLoadError(error)) {
      console.warn('[RootErrorBoundary] Stale chunk — recovering:', error?.message);
      tryRecoverFromChunkError();
      return;
    }
    console.error('[RootErrorBoundary] Render crash:', error, info);
  }
  render() {
    if (this.state.recovering) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d0d1a', color: '#f0ece2', fontFamily: 'system-ui, sans-serif',
          padding: 40, gap: 12, textAlign: 'center',
        }}>
          <h2 style={{ color: '#c9a84c', fontSize: '1.1rem', margin: 0 }}>Updating Ellines Haven…</h2>
          <p style={{ color: 'rgba(240,236,226,0.55)', margin: 0, fontSize: '0.9rem', maxWidth: 400 }}>
            This tab was on an older version. Refreshing to load the latest pages…
          </p>
          <button
            type="button"
            onClick={() => hardReload()}
            style={{
              marginTop: 8, padding: '10px 24px', background: '#c9a84c', color: '#0d0d1a',
              border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Refresh now
          </button>
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d0d1a', color: '#f0ece2', fontFamily: 'system-ui, sans-serif',
          padding: 40, gap: 16, textAlign: 'center',
        }}>
          <h2 style={{ color: '#c9a84c', fontSize: '1.2rem', margin: 0 }}>Something went wrong</h2>
          <p style={{ color: 'rgba(240,236,226,0.55)', maxWidth: 420, margin: 0, fontSize: '0.9rem' }}>
            The app hit an unexpected error. Refresh and try again.
          </p>
          <pre style={{
            background: '#13132b', padding: '16px 20px', borderRadius: 8,
            fontSize: '0.78rem', color: '#e74c3c', maxWidth: 700,
            whiteSpace: 'pre-wrap', textAlign: 'left', border: '1px solid rgba(231,76,60,0.3)',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {this.state.error?.message}
          </pre>
          <button
            type="button"
            onClick={() => hardReload()}
            style={{
              padding: '10px 24px', background: '#c9a84c', color: '#0d0d1a',
              border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Refresh
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
