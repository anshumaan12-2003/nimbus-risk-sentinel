/* Settings → Your account + Team (people and roles). Admin-only changes; everyone can see who's who. */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import KeyRound from 'lucide-react/dist/esm/icons/key-round'
import UserPlus from 'lucide-react/dist/esm/icons/user-plus'
import Users from 'lucide-react/dist/esm/icons/users'
import { useUsers } from '../hooks/queries'
import { createUser, updateUser, resetUserPassword, apiError } from '../api/nimbus'
import { useAuth, useCan } from '../auth/authStore'
import { ROLES, ROLE_INFO } from '../auth/permissions'
import { Skeleton, ErrorState } from './ui'
import { qk } from '../lib/queryClient'

export function RoleBadge({ role }) {
  return <span className={`ui-role ui-role-${role}`}>{role}</span>
}

function Secret({ label, value, onDone }) {
  return (
    <div className="team-secret" role="status">
      {label}<br /><code>{value}</code><br />
      <span className="appr-meta">Shown once. Share it privately; they should change it after signing in.</span>{' '}
      <button className="btn btn-ghost btn-sm" onClick={onDone}>Done</button>
    </div>
  )
}

export function AccountSection({ Section }) {
  const { user, changePassword, info } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.next !== form.confirm) return setMsg({ ok: false, text: 'The new passwords do not match.' })
    setBusy(true); setMsg(null)
    try {
      await changePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setMsg({ ok: true, text: 'Password changed. Every other signed-in browser has been signed out.' })
    } catch (err) { setMsg({ ok: false, text: apiError(err) }) } finally { setBusy(false) }
  }

  if (!user) return null
  return (
    <Section icon={KeyRound} title="Your account" desc={`${user.name} · ${user.email}`}>
      <dl className="ui-settings-list">
        <div className="ui-settings-row"><dt>Role</dt><dd><RoleBadge role={user.role} /> <span className="appr-meta">{ROLE_INFO[user.role]}</span></dd></div>
      </dl>
      <form className="pw-form" onSubmit={submit}>
        <label className="ui-field">Current password
          <input className="ui-input" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required /></label>
        <label className="ui-field">New password
          <input className="ui-input" type="password" autoComplete="new-password" minLength={info?.password_min_length || 12} value={form.next} onChange={set('next')} required /></label>
        <label className="ui-field">Confirm
          <input className="ui-input" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required /></label>
        <button className="btn btn-ghost btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>
      {msg && <p style={{ fontSize: 13, margin: 0, color: msg.ok ? 'var(--sev-low-text)' : 'var(--sev-critical-text)' }}>{msg.text}</p>}
    </Section>
  )
}

export function TeamSection({ Section }) {
  const users = useUsers()
  const me = useAuth(s => s.user)
  const manage = useCan('users:manage')
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer' })
  const [secret, setSecret] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: qk.users })

  const run = async (fn) => {
    setError(null)
    try { await fn(); refresh() } catch (err) { setError(apiError(err)) }
  }
  const add = async (e) => {
    e.preventDefault(); setBusy(true)
    await run(async () => {
      const r = await createUser(form)
      setSecret({ label: `${r.user.email} can sign in with this temporary password:`, value: r.temporary_password })
      setForm({ name: '', email: '', role: 'viewer' })
    })
    setBusy(false)
  }
  const reset = (u) => run(async () => {
    if (!window.confirm(`Reset the password for ${u.email}? They will be signed out everywhere.`)) return
    const r = await resetUserPassword(u.id)
    setSecret({ label: `New temporary password for ${u.email}:`, value: r.temporary_password })
  })

  return (
    <Section icon={Users} title="Team" desc={manage.allowed
      ? 'Add people and set what they can do. Role changes apply on their next click; they do not need to sign in again.'
      : 'Who has access and what they can do. Only admins can change this.'}>
      {users.isLoading ? <Skeleton rows={3} /> : users.isError ? <ErrorState error={users.error} onRetry={users.refetch} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="team-table">
            <thead><tr><th>Person</th><th>Role</th><th>Last sign-in</th>{manage.allowed && <th><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {(users.data || []).map(u => (
                <tr key={u.id} className={u.is_active ? '' : 'team-off'}>
                  <td className="team-name"><strong>{u.name}{u.id === me?.id ? ' (you)' : ''}</strong><span>{u.email}</span></td>
                  <td>
                    {manage.allowed && u.id !== me?.id ? (
                      <select className="ui-select" value={u.role} aria-label={`Role for ${u.email}`}
                              onChange={e => run(() => updateUser(u.id, { role: e.target.value }))}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : <RoleBadge role={u.role} />}
                  </td>
                  <td className="appr-meta">{u.is_active ? (u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never') : 'Deactivated'}</td>
                  {manage.allowed && (
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {u.id !== me?.id && <>
                        <button className="btn btn-ghost btn-sm" onClick={() => reset(u)}>Reset password</button>{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => run(() => updateUser(u.id, { is_active: !u.is_active }))}>
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {manage.allowed && (
        <form className="team-form" onSubmit={add}>
          <label className="ui-field">Name<input className="ui-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></label>
          <label className="ui-field">Email<input className="ui-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></label>
          <label className="ui-field">Role
            <select className="ui-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button className="btn btn-primary btn-sm" disabled={busy}><UserPlus size={13} /> {busy ? 'Adding…' : 'Add person'}</button>
        </form>
      )}
      {secret && <Secret {...secret} onDone={() => setSecret(null)} />}
      {error && <p role="alert" style={{ fontSize: 13, margin: 0, color: 'var(--sev-critical-text)' }}>{error}</p>}
    </Section>
  )
}
