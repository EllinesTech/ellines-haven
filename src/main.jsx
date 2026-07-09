import { createRoot } from 'react-dom/client';
import { Component } from 'react';
import './index.css';
import App from './App.jsx';

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
