import { useEffect, useState } from 'react'
import { AlertCircle, Eye, EyeOff, RefreshCw, WifiOff } from 'lucide-react'
import { useAuth } from './authStore'
import { apiError } from '../api/nimbus'
import { Button, CodeBlock, Input } from '@/components/ds'
import { BrandMark } from '@/components/shell/Sidebar'
import { cn } from '@/lib/cn'

/* Calm full-screen frame shared by every signed-out state. */
function Frame({ title, lead, children, footer, wide = false }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-10">
      {/* one soft wash of accent at the top — the only decoration */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent-soft)_0%,transparent_100%)] opacity-70" />
      <main className={cn('relative w-full animate-rise-in', wide ? 'max-w-[440px]' : 'max-w-[380px]')}>
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight text-fg">Nimbus</span>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-overlay sm:p-7">
          <h1 className="text-xl font-semibold text-fg">{title}</h1>
          {lead && <p className="mt-1.5 text-sm text-fg-2">{lead}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-xs text-fg-3">{footer}</div>}
      </main>
    </div>
  )
}

function Alert({ tone = 'error', children }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
         className={cn('mb-4 flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm',
           tone === 'error' ? 'border-crit-line bg-crit-soft text-crit-text' : 'border-accent-line bg-accent-soft text-accent-text')}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

function TextField({ id, label, hint, ...props }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
      <Input id={id} className="h-10 text-base" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && <p id={`${id}-hint`} className="text-xs text-fg-3">{hint}</p>}
    </div>
  )
}

function PasswordField({ id, label, value, onChange, autoComplete, hint }) {
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const onKey = (e) => setCaps(e.getModifierState?.('CapsLock') || false)
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
      <div className="relative">
        <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
               onKeyUp={onKey} onKeyDown={onKey} onBlur={() => setCaps(false)}
               autoComplete={autoComplete} required className="h-10 pr-10 text-base"
               aria-describedby={hint || caps ? `${id}-hint` : undefined} />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:bg-muted hover:text-fg">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {(caps || hint) && (
        <p id={`${id}-hint`} className={cn('text-xs', caps ? 'font-medium text-med-text' : 'text-fg-3')}>
          {caps ? 'Caps Lock is on.' : hint}
        </p>
      )}
    </div>
  )
}

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
    <Frame
      title="Sign in"
      lead="Use the account your Nimbus admin created for you."
      footer="Forgot your password? An admin can reset it in Settings → Team."
    >
      {notice && !error && <Alert tone="info">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="grid gap-4">
        <TextField id="email" label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                   autoComplete="username" required autoFocus placeholder="you@company.com" />
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1 w-full">
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
    </Frame>
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
    if (form.password !== form.confirm) return setError('The two passwords don’t match.')
    setBusy(true); setError(null)
    try {
      await setup({ name: form.name, email: form.email, password: form.password, setup_token: form.setup_token || undefined })
    } catch (err) { setError(apiError(err)); setBusy(false) }
  }

  return (
    <Frame
      wide
      title="Create the admin account"
      lead="Nobody has signed in yet. The first account becomes the admin, who then invites everyone else."
      footer="Passwords are stored as Argon2id hashes. Sessions last 15 minutes and renew silently."
    >
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="grid gap-4">
        <TextField id="name" label="Your name" value={form.name} onChange={e => set('name')(e.target.value)} required autoFocus autoComplete="name" />
        <TextField id="email" label="Email" type="email" value={form.email} onChange={e => set('email')(e.target.value)} required autoComplete="username" />
        <PasswordField id="password" label="Password" value={form.password} onChange={set('password')}
                       autoComplete="new-password" hint={`At least ${min} characters. A short sentence is easy to remember.`} />
        <PasswordField id="confirm" label="Confirm password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        {info?.setup_token_required && (
          <TextField id="setup_token" label="Setup token" value={form.setup_token} onChange={e => set('setup_token')(e.target.value)}
                     required autoComplete="off" hint="The SETUP_TOKEN value from backend/.env." />
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1 w-full">
          {busy ? 'Creating account' : 'Create admin account'}
        </Button>
      </form>
    </Frame>
  )
}

function OfflineScreen() {
  const bootstrap = useAuth(s => s.bootstrap)
  const [busy, setBusy] = useState(false)
  const retry = async () => { setBusy(true); try { await bootstrap() } finally { setBusy(false) } }
  return (
    <Frame wide title="Can’t reach the Nimbus API" lead="The sign-in service didn’t answer. Start the backend, then try again.">
      <div className="mb-4 flex items-center gap-2 text-sm text-fg-2"><WifiOff className="size-4 text-fg-3" /> Nothing is listening on the API port.</div>
      <CodeBlock language="terminal" code="cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8001" />
      <Button variant="primary" size="lg" className="mt-5 w-full" onClick={retry} loading={busy}>
        {!busy && <RefreshCw />} Try again
      </Button>
    </Frame>
  )
}

export default function AuthGate({ children }) {
  const { status, bootstrap } = useAuth()
  useEffect(() => { bootstrap() }, [bootstrap])
  if (status === 'loading') {
    return <div className="grid min-h-dvh place-items-center bg-bg" aria-busy="true" aria-label="Loading"><BrandMark className="size-9 animate-pulse" /></div>
  }
  if (status === 'offline') return <OfflineScreen />
  if (status === 'setup') return <SetupScreen />
  if (status === 'signed-out') return <LoginScreen />
  return children
}
