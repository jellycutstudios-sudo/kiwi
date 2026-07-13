import { Component } from 'react';
import { logError } from '../../utils/logger';

/**
 * ErrorBoundary — catches unhandled JavaScript errors in the React tree
 * and shows a friendly recovery UI instead of a blank white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console natively
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    
    // Track telemetry
    logError(error, {
      componentStack: info.componentStack,
      boundary: 'RootErrorBoundary'
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          background: 'var(--color-bg, #0a0a0a)',
          fontFamily: 'var(--font-family, system-ui)',
          textAlign: 'center',
          gap: '16px',
        }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-label, #fff)' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--color-label-secondary, #aaa)', maxWidth: 400, lineHeight: 1.6 }}>
            An unexpected error occurred. Please reload the page. If the problem persists, contact support.
          </p>
          {this.state.error?.message && (
            <code style={{
              display: 'block',
              background: 'var(--color-bg-secondary, #111)',
              border: '1px solid var(--color-separator, #333)',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '12px',
              color: 'var(--color-red, #ff3b30)',
              maxWidth: 480,
              wordBreak: 'break-word',
            }}>
              {this.state.error.message}
            </code>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px',
              padding: '10px 24px',
              background: 'var(--color-accent, #007AFF)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
