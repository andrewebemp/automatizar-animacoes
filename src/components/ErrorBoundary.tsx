import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Componente ErrorBoundary para capturar erros de renderização
 * e mostrar uma tela de recuperação.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Erro capturado:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleClearAndRestart = () => {
    // Limpa localStorage
    try {
      localStorage.removeItem('automatizar-animacoes-project-v2');
      localStorage.removeItem('automatizar-animacoes-timeline-v1');
      localStorage.removeItem('automatizar-animacoes-mode');
    } catch (e) {
      console.error('Erro ao limpar localStorage:', e);
    }

    // Chama callback de reset se existir
    this.props.onReset?.();

    // Recarrega a página
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ color: '#ef4444', marginBottom: 16, fontSize: 24 }}>
            Ocorreu um erro
          </h1>
          <p style={{ color: '#a0a0b0', marginBottom: 24, maxWidth: 500 }}>
            Algo deu errado ao carregar o aplicativo. Isso pode ter sido causado por dados
            corrompidos salvos anteriormente.
          </p>

          <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '12px 24px',
                backgroundColor: '#2a2a4e',
                border: '1px solid #4a4a6e',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Tentar Novamente
            </button>
            <button
              onClick={this.handleClearAndRestart}
              style={{
                padding: '12px 24px',
                backgroundColor: '#6366f1',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Limpar Dados e Recomeçar
            </button>
          </div>

          {/* Detalhes do erro (colapsável) */}
          <details
            style={{
              maxWidth: 600,
              textAlign: 'left',
              backgroundColor: '#0f0f1a',
              border: '1px solid #2a2a4e',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <summary style={{ cursor: 'pointer', color: '#6366f1', marginBottom: 8 }}>
              Ver detalhes do erro
            </summary>
            <pre
              style={{
                fontSize: 12,
                color: '#ef4444',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
