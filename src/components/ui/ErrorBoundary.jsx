/**
 * components/ui/ErrorBoundary.jsx
 *
 * React error boundary — wraps main dashboard content.
 * If any child component throws, shows a clean fallback.
 * Must be a class component — React requires this for error boundaries.
 */

import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] caught:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 32, margin: '0 0 12px' }}>⚠️</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px' }}>
            Something went wrong
          </p>
          <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 16px' }}>
            {this.state.message}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
