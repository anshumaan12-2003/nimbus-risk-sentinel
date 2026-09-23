import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Bell from 'lucide-react/dist/esm/icons/bell'
import { useEventStore, timeAgo } from '../store/eventStore'
import { EVENT_META, toneFor } from './LiveStream'

/* Bell + unread count + recent events. "Read" position persists per browser. */
export default function NotificationCenter() {
  const events = useEventStore(s => s.events).filter(e => e.source !== 'you')
  const [open, setOpen] = useState(false)
  const [seenTs, setSeenTs] = useState(() => Number(localStorage.getItem('nimbus-notif-seen') || 0))
  const ref = useRef(null)
  const navigate = useNavigate()
  const unread = events.filter(e => e.ts > seenTs).length

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const markRead = () => {
    const ts = Date.now(); setSeenTs(ts)
    try { localStorage.setItem('nimbus-notif-seen', String(ts)) } catch { /* private mode */ }
  }

  return (
    <div className="ui-notif" ref={ref}>
      <button className="header-icon-btn" onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} title="Notifications">
        <Bell size={15} />
        {unread > 0 && <span className="ui-notif-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="ui-notif-panel" role="menu">
          <div className="ui-notif-head">
            <strong>Notifications</strong>
            <button className="btn btn-ghost btn-sm" onClick={markRead} disabled={!unread}>Mark all read</button>
          </div>
          {events.length === 0 ? (
            <p className="ui-subtle" style={{ padding: 16 }}>Nothing yet. Scan results, new findings and remediations appear here in real time.</p>
          ) : (
            <ul>
              {events.slice(0, 20).map(e => {
                const Icon = EVENT_META[e.type]?.icon || Bell
                return (
                  <li key={e.id} className={e.ts > seenTs ? 'unread' : ''}>
                    <button onClick={() => { setOpen(false); if (e.link) navigate(e.link) }} role="menuitem">
                      <span className={`ui-notif-icon tone-${toneFor(e)}`}><Icon size={13} /></span>
                      <span className="ui-notif-text">
                        <span className="ui-notif-title">{e.title}</span>
                        {e.detail && <span className="ui-subtle ui-truncate">{e.detail}</span>}
                      </span>
                      <span className="ui-subtle ui-notif-time">{timeAgo(e.ts)}{e.source === 'simulated' ? ' · demo' : ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
