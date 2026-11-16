import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AdminAuthProvider } from './context/AdminAuthContext.jsx'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Admin panel render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, color: '#29334b', background: '#f7f8fc', fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center' }}>
          <h1 style={{ margin: 0 }}>Admin panel could not start</h1>
          <p style={{ margin: 0, color: '#70798e' }}>Reload the page to try again. If this keeps happening, contact support.</p>
          {this.state.error?.message && <code style={{ maxWidth: 680, overflowWrap: 'anywhere', color: '#9f1239', fontSize: 13 }}>{this.state.error.message}</code>}
          <button type="button" onClick={() => { window.location.href = '/?page=Manage%20Products' }} style={{ justifySelf: 'center', padding: '10px 18px', border: '1px solid #dfe3ed', borderRadius: 8, color: '#29334b', background: '#fff', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Open products instead</button>
          <button type="button" onClick={() => window.location.reload()} style={{ justifySelf: 'center', padding: '10px 18px', border: 0, borderRadius: 8, color: '#fff', background: '#4f46e5', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Reload admin panel</button>
        </main>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <AdminAuthProvider>
        <App />
      </AdminAuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
