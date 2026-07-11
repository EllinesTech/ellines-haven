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

  // Global error event handler
  window.addEventListener('error', (e) => {
    const isChunkError = 
      e.message?.includes('Loading chunk') || 
      e.message?.includes('Failed to fetch dynamically imported module') ||
      e.message?.includes('Importing a module script failed') ||
      e.message?.includes('error loading dynamically imported module') ||
      e.filename?.includes('/assets/') ||
      (e.error && (
        e.error.name === 'ChunkLoadError' ||
        e.error.message?.includes('chunk')
      ));
    
    if (isChunkError) {
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
      
      // Clear all caches and reload
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
          .then(() => window.location.reload())
          .catch(() => window.location.reload());
      } else {
        window.location.reload();
      }
    }
  });

  // Promise rejection handler for dynamic imports
  window.addEventListener('unhandledrejection', (e) => {
    const isChunkError = 
      e.reason?.message?.includes('Failed to fetch dynamically imported module') ||
      e.reason?.message?.includes('Loading chunk') ||
      e.reason?.name === 'ChunkLoadError';
      
    if (isChunkError) {
      console.warn('[Promise Rejection Handler] Detected chunk error:', e.reason?.message);
      
      // Don't reload while reading
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
      
      // Clear caches and reload
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
          .then(() => window.location.reload())
          .catch(() => window.location.reload());
      } else {
        window.location.reload();
      }
      
      // Prevent the error from bubbling up
      e.preventDefault();
    }
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
