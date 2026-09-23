import React from 'react'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import Home from 'lucide-react/dist/esm/icons/home'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Sentinel Error Boundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}>
          <div className="card" style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
            <div
              className="stat-icon-box critical"
              style={{ width: 44, height: 44, margin: '0 auto 16px' }}
            >
              <AlertTriangle size={20} />
            </div>

            <div className="card-kicker" style={{ justifyContent: 'center' }}>
              // view crashed
            </div>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--text-1)',
              textTransform: 'uppercase',
              letterSpacing: '0.01em',
              margin: '4px 0 8px',
            }}>
              This view hit a snag
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.6 }}>
              The rest of Nimbus is unaffected — your session and data are intact.
            </p>

            {this.state.error && (
              <div style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--sev-critical-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--sev-critical-text)',
                textAlign: 'left',
                marginBottom: 20,
                wordBreak: 'break-all',
                maxHeight: 120,
                overflowY: 'auto',
              }}>
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={this.handleReset} style={{ gap: 8 }}>
                <Home size={14} /> Back to Dashboard
              </button>
              <button className="btn btn-secondary" onClick={() => window.location.reload()} style={{ gap: 8 }}>
                <RefreshCw size={14} /> Reload
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
