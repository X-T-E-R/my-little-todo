import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 32,
          fontFamily: 'system-ui, sans-serif',
          color: 'var(--color-text, #333)',
          background: 'var(--color-bg, #fff)',
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>出了点问题</h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary, #888)',
            maxWidth: 480,
            textAlign: 'center',
            marginBottom: 24,
          }}
        >
          {this.state.error?.message || '未知错误'}
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid var(--color-border, #ddd)',
              background: 'var(--color-surface, #f5f5f5)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            重试
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--color-accent, #4f6ef7)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}
