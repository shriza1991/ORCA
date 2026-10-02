import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onRetry?: () => void;
  resetButtonText?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className={`component-error-boundary ${this.props.className || ''}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            background: 'var(--color-bg-secondary, #f8fafc)',
            border: '1px solid var(--color-border, #e2e8f0)',
            borderRadius: '8px',
            margin: '8px',
            minHeight: '120px',
            ...this.props.style,
          }}
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle
            size={24}
            style={{ color: 'var(--color-warning, #f59e0b)', marginBottom: '8px' }}
          />
          <h4
            style={{
              margin: '0 0 4px 0',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--color-text-primary, #0f172a)',
            }}
          >
            {this.props.fallbackTitle || 'Component Unavailable'}
          </h4>
          <p
            style={{
              margin: '0 0 12px 0',
              fontSize: '12px',
              color: 'var(--color-text-muted, #64748b)',
              maxWidth: '480px',
            }}
          >
            {this.props.fallbackMessage ||
              this.state.error?.message ||
              'An unexpected rendering error occurred in this section.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid var(--color-border, #cbd5e1)',
              background: 'var(--color-bg-primary, #ffffff)',
              color: 'var(--color-text-primary, #0f172a)',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} />
            <span>{this.props.resetButtonText || 'Retry'}</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
