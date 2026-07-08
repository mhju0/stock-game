import { Component } from 'react'
import i18n from '../i18n'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ textAlign: 'center', padding: 40, margin: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: 'var(--negative)', marginBottom: 12, fontSize: 16, fontWeight: 600 }}>
            {i18n.t('common.pageErrorTitle')}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            {i18n.t('common.pageErrorBody')}
          </p>
          <button className="btn btn-primary" onClick={() => this.setState({ hasError: false })}>
            {i18n.t('common.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
