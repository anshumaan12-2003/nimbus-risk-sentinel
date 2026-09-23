import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LogOut from 'lucide-react/dist/esm/icons/log-out'
import SettingsIcon from 'lucide-react/dist/esm/icons/settings'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check'
import { useAuth } from '../auth/authStore'
import { ROLE_INFO } from '../auth/permissions'
import { RoleBadge } from './TeamSettings'

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  if (!user) return null
  return (
    <div className="ui-user-menu" ref={ref}>
      <button className="user-chip" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
              aria-label={`Account: ${user.name}, ${user.role}`}>
        <div className="user-avatar">{initials(user.name)}</div>
        <div className="user-chip-text">
          <span className="user-info-name">{user.name}</span>
          <span className="user-info-role">{user.role}</span>
        </div>
      </button>
      {open && (
        <div className="ui-user-pop" role="menu">
          <div className="ui-user-pop-id">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <RoleBadge role={user.role} /><span className="appr-meta" style={{ margin: 0 }}>{ROLE_INFO[user.role]}</span>
            </div>
          </div>
          <Link to="/approvals" role="menuitem" onClick={() => setOpen(false)}><ShieldCheck size={14} /> Approvals</Link>
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)}><SettingsIcon size={14} /> Account and team</Link>
          <button role="menuitem" onClick={() => logout()}><LogOut size={14} /> Sign out</button>
        </div>
      )}
    </div>
  )
}
