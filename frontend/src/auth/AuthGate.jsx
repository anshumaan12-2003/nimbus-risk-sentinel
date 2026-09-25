import { useEffect, useState } from 'react'
import { AlertCircle, Eye, EyeOff, RefreshCw, WifiOff } from 'lucide-react'
import { useAuth } from './authStore'
import { apiError } from '../api/nimbus'
import { Button, CodeBlock, Input } from '@/components/ds'
import { BrandMark } from '@/components/shell/Sidebar'
import { cn } from '@/lib/cn'
import Mascot from '@/components/Mascot'

/* Calm full-screen frame shared by every signed-out state. */
function Frame({ title, lead, children, footer, wide = false }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-10">
      {/* a dawn sky over the top of the page: the only decoration */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-80
        bg-[radial-gradient(50%_90%_at_35%_0%,color-mix(in_oklab,var(--dawn-1)_16%,transparent)_0%,transparent_100%),radial-gradient(45%_80%_at_70%_0%,color-mix(in_oklab,var(--dawn-3)_12%,transparent)_0%,transparent_100%)]" />
      <main className={cn('relative w-full animate-rise-in', wide ? 'max-w-[440px]' : 'max-w-[380px]')}>
        <div className="mb-6 grid justify-items-center gap-1.5">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-8" />
            <span className="font-display text-xl font-bold tracking-[-0.02em] text-fg">Nimbus</span>
          </div>
          <p className="text-sm text-fg-3">See the risk before the breach.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-overlay sm:p-7">
          <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-fg">{title}</h1>
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

/*
  The API didn't answer yet. On free hosting (Render) the server sleeps when idle and takes up to a
  minute to wake, so this is normal, not an error: say so kindly, keep retrying on our own, and only
  after 90 seconds suggest that something may really be wrong.
*/
const GIVE_UP_AFTER = 90
function WakingScreen() {
  const { status, probe, bootstrap } = useAuth()
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => { const t = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {   // offline: try again every 5 s; 'loading' is already a request in flight
    if (status !== 'offline') return
    const t = setInterval(() => { probe() }, 5000)
    return () => clearInterval(t)
  }, [status, probe])
  const stuck = seconds >= GIVE_UP_AFTER
  const retry = async () => { setBusy(true); try { await bootstrap() } finally { setBusy(false) } }
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return (
    <Frame wide title={stuck ? 'Nimbus still isn\u2019t answering' : 'Waking Nimbus up\u2026'}
           lead={stuck ? 'It usually wakes within a minute. Something may be wrong with the API service.' : 'The server sleeps when nobody\u2019s using it and takes up to a minute to wake. No need to reload: this page signs you in as soon as it\u2019s ready.'}>
      <div className="grid justify-items-center gap-4" role="status" aria-live="polite">
        <Mascot mood={stuck ? 'alarmed' : 'thinking'} size={96} label={stuck ? 'Not answering' : 'Waking up'} />
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-2" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (seconds / 60) * 100)}%` }} />
        </div>
        <p className="num text-sm text-fg-3">{seconds}s{seconds < 60 && ' · usually under a minute'}</p>
      </div>
      {stuck && (
        <div className="mt-5 grid gap-3">
          <div className="flex items-center gap-2 text-sm text-fg-2"><WifiOff className="size-4 text-fg-3" /> Still retrying every few seconds.</div>
          {local
            ? <CodeBlock language="terminal" code="cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8001" />
            : <p className="text-sm text-fg-2">Check that the API service is running on your host (on Render: the service's Events and Logs).</p>}
          <Button variant="primary" size="lg" className="w-full" onClick={retry} loading={busy}>{!busy && <RefreshCw />} Try now</Button>
        </div>
      )}
    </Frame>
  )
}

export default function AuthGate({ children }) {
  const { status, bootstrap } = useAuth()
  const [slow, setSlow] = useState(false)   // still loading after 2.5 s: probably a sleeping server
  useEffect(() => { bootstrap() }, [bootstrap])
  useEffect(() => {
    if (status !== 'loading') { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), 2500)
    return () => clearTimeout(t)
  }, [status])
  if (status === 'loading' && !slow) {
    return <div className="grid min-h-dvh place-items-center bg-bg" aria-busy="true" aria-label="Loading"><BrandMark className="size-9 animate-pulse" /></div>
  }
  if (status === 'loading' || status === 'offline') return <WakingScreen />
  if (status === 'setup') return <SetupScreen />
  if (status === 'signed-out') return <LoginScreen />
  return children
}
