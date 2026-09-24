/* Settings → Your account + Team (people and roles). Admin-only changes; everyone can see who's who. */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  Badge, Button, CopyButton, Dialog, DialogClose, DialogContent, Field, Input, Menu, MenuContent, MenuItem, MenuTrigger,
  SkeletonRows, ErrorState,
  TimeAgo
} from '@/components/ds'
import { useUsers } from '../hooks/queries'
import { createUser, updateUser, resetUserPassword, apiError } from '../api/nimbus'
import { useAuth, useCan } from '../auth/authStore'
import { ROLES, ROLE_INFO } from '../auth/permissions'
import { qk } from '../lib/queryClient'
import { MoreHorizontal } from 'lucide-react'

const ROLE_TONE = { admin: 'accent', approver: 'medium', engineer: 'info', viewer: 'neutral' }
export function RoleBadge({ role }) {
  return <Badge size="sm" tone={ROLE_TONE[role] || 'neutral'} className="capitalize">{role}</Badge>
}

const selectCls = 'h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg capitalize focus:border-accent focus:outline-none'

/* Temporary password, shown once. */
function SecretDialog({ secret, onClose }) {
  return (
    <Dialog open={!!secret} onOpenChange={(o) => { if (!o) onClose() }}>
      {secret && (
        <DialogContent title="Temporary password" description={secret.label}
                       footer={<DialogClose asChild><Button variant="primary">Done</Button></DialogClose>}>
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <code className="min-w-0 flex-1 font-mono text-sm break-all text-fg">{secret.value}</code>
            <CopyButton value={secret.value} label="Copy password" />
          </div>
          <p className="mt-3 text-xs text-fg-3">Shown once. Share it privately — they should change it after signing in.</p>
        </DialogContent>
      )}
    </Dialog>
  )
}

export function AccountSection() {
  const { user, changePassword, info } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.next !== form.confirm) return setError('The new passwords don’t match.')
    setBusy(true); setError(null)
    try {
      await changePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      toast.success('Password changed', { description: 'Every other signed-in browser has been signed out.' })
    } catch (err) { setError(apiError(err)) } finally { setBusy(false) }
  }

  if (!user) return null
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-muted-2 text-sm font-semibold text-fg-2">
          {user.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-fg">{user.name}</p>
          <p className="truncate text-sm text-fg-2">{user.email}</p>
        </div>
        <div className="ml-auto text-right"><RoleBadge role={user.role} /><p className="mt-1 text-xs text-fg-3">{ROLE_INFO[user.role]}</p></div>
      </div>
      <form onSubmit={submit} className="grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
        <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required />}</Field>
        <Field label="New password" hint={`At least ${info?.password_min_length || 12} characters`}>{(p) => <Input {...p} type="password" autoComplete="new-password" minLength={info?.password_min_length || 12} value={form.next} onChange={set('next')} required />}</Field>
        <Field label="Confirm new password">{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />}</Field>
        <div className="flex items-center gap-3 sm:col-span-3">
          <Button type="submit" loading={busy}>Change password</Button>
          {error && <p role="alert" className="text-sm text-crit-text">{error}</p>}
        </div>
      </form>
    </div>
  )
}

export function TeamSection() {
  const users = useUsers()
  const me = useAuth(s => s.user)
  const manage = useCan('users:manage')
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer' })
  const [secret, setSecret] = useState(null)
  const [confirmReset, setConfirmReset] = useState(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: qk.users })

  const run = async (fn, ok) => {
    try { await fn(); refresh(); if (ok) toast.success(ok) } catch (err) { toast.error('Not changed', { description: apiError(err) }) }
  }
  const add = async (e) => {
    e.preventDefault(); setBusy(true)
    await run(async () => {
      const r = await createUser(form)
      setSecret({ label: `${r.user.email} can sign in with this password.`, value: r.temporary_password })
      setForm({ name: '', email: '', role: 'viewer' })
    })
    setBusy(false)
  }
  const doReset = (u) => run(async () => {
    const r = await resetUserPassword(u.id)
    setSecret({ label: `New password for ${u.email}. They’ve been signed out everywhere.`, value: r.temporary_password })
  })

  return (
    <div className="grid gap-5">
      <p className="text-sm text-fg-2">{manage.allowed
        ? 'Add people and set what they can do. Role changes apply on their next click — no need to sign in again.'
        : 'Who has access and what they can do. Only admins can change this.'}</p>
      {users.isLoading ? <SkeletonRows rows={3} /> : users.isError ? <ErrorState error={users.error} onRetry={users.refetch} compact /> : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-fg-3">
              <tr><th className="py-2 pr-3 pl-4 font-medium">Person</th><th className="px-3 font-medium">Role</th><th className="px-3 font-medium">Last sign-in</th>{manage.allowed && <th className="pr-4"><span className="sr-only">Actions</span></th>}</tr>
            </thead>
            <tbody>
              {(users.data || []).map(u => (
                <tr key={u.id} className={cn('border-t border-line', !u.is_active && 'opacity-50')}>
                  <td className="py-2.5 pr-3 pl-4">
                    <p className="font-medium text-fg">{u.name}{u.id === me?.id && <span className="font-normal text-fg-3"> (you)</span>}</p>
                    <p className="text-xs text-fg-3">{u.email}</p>
                  </td>
                  <td className="px-3">
                    {manage.allowed && u.id !== me?.id ? (
                      <select className={selectCls} value={u.role} aria-label={`Role for ${u.email}`}
                              onChange={e => run(() => updateUser(u.id, { role: e.target.value }), `${u.name} is now ${e.target.value}`)}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : <RoleBadge role={u.role} />}
                  </td>
                  <td className="px-3 text-fg-2">{u.is_active ? (u.last_login_at ? <TimeAgo value={u.last_login_at} /> : 'Never') : 'Deactivated'}</td>
                  {manage.allowed && (
                    <td className="pr-4 text-right">
                      {u.id !== me?.id && (
                        <Menu>
                          <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.email}`}><MoreHorizontal /></Button></MenuTrigger>
                          <MenuContent>
                            <MenuItem onSelect={() => setConfirmReset(u)}>Reset password…</MenuItem>
                            <MenuItem danger={u.is_active} onSelect={() => run(() => updateUser(u.id, { is_active: !u.is_active }), u.is_active ? `${u.name} deactivated` : `${u.name} reactivated`)}>
                              {u.is_active ? 'Deactivate' : 'Reactivate'}
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {manage.allowed && (
        <form onSubmit={add} className="grid items-end gap-3 border-t border-line pt-5 sm:grid-cols-[1fr_1fr_140px_auto]">
          <Field label="Name">{(p) => <Input {...p} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />}</Field>
          <Field label="Email">{(p) => <Input {...p} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />}</Field>
          <Field label="Role">{(p) => (
            <select {...p} className={cn(selectCls, 'w-full')} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}</Field>
          <Button type="submit" variant="primary" loading={busy}>{!busy && <UserPlus />} Add person</Button>
        </form>
      )}

      <Dialog open={!!confirmReset} onOpenChange={(o) => { if (!o) setConfirmReset(null) }}>
        {confirmReset && (
          <DialogContent title={`Reset ${confirmReset.name}’s password?`} description="They’ll be signed out everywhere and get a new temporary password to sign in with."
                         footer={<><DialogClose asChild><Button>Cancel</Button></DialogClose>
                           <Button variant="danger" onClick={() => { doReset(confirmReset); setConfirmReset(null) }}>Reset password</Button></>}>
            <p className="text-sm text-fg-2">{confirmReset.email}</p>
          </DialogContent>
        )}
      </Dialog>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  )
}
