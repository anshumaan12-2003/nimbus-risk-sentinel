import { useEffect, useState } from 'react'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import Eye from 'lucide-react/dist/esm/icons/eye'
import EyeOff from 'lucide-react/dist/esm/icons/eye-off'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import { useAuth } from './authStore'
import { apiError } from '../api/nimbus'
import { ROLE_INFO } from './permissions'
import './auth.css'

function Mark() {
  return (
    <div className="auth-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
      </svg>
    </div>
  )
}

function PasswordField({ id, label, value, onChange, autoComplete, hint }) {
  const [show, setShow] = useState(false)
  return (
    <label className="auth-field" htmlFor={id}>
      <span className="auth-label">{label}</span>
      <span className="auth-input-wrap">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
               autoComplete={autoComplete} required className="auth-input" />
        <button type="button" className="auth-reveal" onClick={() => setShow(s => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
      {hint && <span className="auth-hint">{hint}</span>}
    </label>
  )
}

function Shell({ title, lead, children, aside }) {
  return (
    <div className="auth-screen">
      <section className="auth-story">
        <div className="auth-brand"><Mark /><span>Nimbus Risk Sentinel</span></div>
        <div className="auth-story-body">{aside}</div>
      </section>
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand auth-brand-mobile"><Mark /><span>Nimbus Risk Sentinel</span></div>
          <h1 className="auth-title">{title}</h1>
          {lead && <p className="auth-lead">{lead}</p>}
          {children}
        </div>
      </main>
    </div>
  )
}

const ROLE_STORY = (
  <>
    <p className="auth-story-head">Every change to your cloud has two names on it.</p>
    <dl className="auth-roles">
      {Object.entries(ROLE_INFO).map(([role, text]) => (
        <div key={role}><dt>{role}</dt><dd>{text}</dd></div>
      ))}
    </dl>
  </>
)

function LoginScreen() {
  const { login, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await login(email, password) } catch (err) { setError(apiError(err)); setBusy(false) }
  }

  return (
    <Shell title="Sign in" lead="Use the account your Nimbus admin created for you." aside={ROLE_STORY}>
      {notice && !error && <div className="auth-notice">{notice}</div>}
      {error && <div className="auth-error" role="alert"><AlertTriangle size={14} />{error}</div>}
      <form onSubmit={submit} className="auth-form">
        <label className="auth-field" htmlFor="email">
          <span className="auth-label">Email</span>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                 autoComplete="username" required autoFocus className="auth-input" />
        </label>
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <button className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-foot">Forgot your password? An admin can reset it from Settings → Team.</p>
    </Shell>
  )
}

function SetupScreen() {
  const { setup, info } = useAuth()
  const min = info?.password_min_length || 12
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', setup_token: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = k => v => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) return setError('The two passwords do not match.')
    setBusy(true); setError(null)
    try {
      await setup({ name: form.name, email: form.email, password: form.password, setup_token: form.setup_token || undefined })
    } catch (err) { setError(apiError(err)); setBusy(false) }
  }

  return (
    <Shell title="Create the admin account" aside={ROLE_STORY}
           lead="Nobody has signed in to this Nimbus yet. The first account becomes the admin, who adds everyone else.">
      {error && <div className="auth-error" role="alert"><AlertTriangle size={14} />{error}</div>}
      <form onSubmit={submit} className="auth-form">
        <label className="auth-field" htmlFor="name">
          <span className="auth-label">Your name</span>
          <input id="name" value={form.name} onChange={e => set('name')(e.target.value)} required autoFocus
                 autoComplete="name" className="auth-input" />
        </label>
        <label className="auth-field" htmlFor="email">
          <span className="auth-label">Email</span>
          <input id="email" type="email" value={form.email} onChange={e => set('email')(e.target.value)} required
                 autoComplete="username" className="auth-input" />
        </label>
        <PasswordField id="password" label="Password" value={form.password} onChange={set('password')}
                       autoComplete="new-password" hint={`At least ${min} characters. A passphrase is easiest.`} />
        <PasswordField id="confirm" label="Confirm password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        {info?.setup_token_required && (
          <label className="auth-field" htmlFor="setup_token">
            <span className="auth-label">Setup token</span>
            <input id="setup_token" value={form.setup_token} onChange={e => set('setup_token')(e.target.value)} required
                   className="auth-input" autoComplete="off" />
            <span className="auth-hint">The SETUP_TOKEN value from backend/.env.</span>
          </label>
        )}
        <button className="auth-submit" disabled={busy}>{busy ? 'Creating…' : 'Create admin account'}</button>
      </form>
    </Shell>
  )
}

function OfflineScreen() {
  const bootstrap = useAuth(s => s.bootstrap)
  return (
    <Shell title="Can't reach the Nimbus API" aside={ROLE_STORY}
           lead="The sign-in service did not answer. Start the backend, then try again.">
      <pre className="auth-code">cd backend && uvicorn app.main:app --reload --port 8000</pre>
      <button className="auth-submit" onClick={bootstrap}><RefreshCw size={14} /> Try again</button>
    </Shell>
  )
}

export default function AuthGate({ children }) {
  const { status, bootstrap } = useAuth()
  useEffect(() => { bootstrap() }, [bootstrap])
  if (status === 'loading') return <div className="auth-loading" aria-busy="true"><Mark /></div>
  if (status === 'offline') return <OfflineScreen />
  if (status === 'setup') return <SetupScreen />
  if (status === 'signed-out') return <LoginScreen />
  return children
}
