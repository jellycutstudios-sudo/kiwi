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
      boundary: this.props.isPageLevel ? 'PageErrorBoundary' : 'RootErrorBoundary'
    });
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resetKey !== undefined && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function' ? this.props.fallback({ error: this.state.error, reset: this.handleRetry }) : this.props.fallback;
      }

      if (this.props.isPageLevel) {
        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '360px',
            padding: '32px 24px',
            background: 'var(--color-bg-elevated, #131b2e)',
            borderRadius: '16px',
            margin: '20px',
            border: '1px solid var(--color-separator, rgba(255,255,255,0.1))',
            textAlign: 'center',
            gap: '14px',
          }}>
            <div style={{ fontSize: '42px' }}>🛡️</div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-label, #fff)', margin: 0 }}>
              View Encountered an Issue
            </h2>
            <p style={{ color: 'var(--color-label-secondary, #94a3b8)', maxWidth: 460, fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
              This section ran into a temporary error. The rest of DineOS is still running and your cart/orders are preserved.
            </p>
            {this.state.error?.message && (
              <code style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '12px',
                color: '#ef4444',
                maxWidth: 480,
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </code>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '9px 20px',
                  background: 'var(--color-accent, #007AFF)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry View
              </button>
              <button
                onClick={() => { window.location.href = '/dashboard'; }}
                style={{
                  padding: '9px 20px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'var(--color-label, #fff)',
                  border: '1px solid var(--color-separator, rgba(255,255,255,0.15))',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        );
      }

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
