import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Activity from 'lucide-react/dist/esm/icons/activity'
import Zap from 'lucide-react/dist/esm/icons/zap'
import { useEventStore, timeAgo } from '../store/eventStore'
import { EVENT_META, toneFor } from './LiveStream'
import EmptyState from './EmptyState'

export default function ActivityFeed({ limit = 8 }) {
  const events = useEventStore(s => s.events)
  const mode = useEventStore(s => s.mode)
  const [now, setNow] = useState(Date.now())
  const navigate = useNavigate()
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t) }, [])

  return (
    <div className="activity-feed">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="card-kicker"><Activity size={11} /> Real-time</div>
          <div className="card-title-text" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Activity stream</div>
        </div>
        <span className={`activity-mode mode-${mode}`}>{mode === 'live' ? 'LIVE' : mode === 'simulated' ? 'SIMULATED' : mode === 'offline' ? 'OFFLINE' : '…'}</span>
      </div>
      {events.length === 0 ? (
        <EmptyState compact mood="thinking" title="Listening…" description="New findings, drift and fixes will stream in here as they happen." />
      ) : (
        <ol className="activity-list">
          {events.slice(0, limit).map(e => {
            const Icon = EVENT_META[e.type]?.icon || Zap
            return (
              <li key={e.id} className={`activity-item tone-${toneFor(e)}`}>
                <button onClick={() => e.link && navigate(e.link)}>
                  <span className="activity-icon"><Icon size={13} /></span>
                  <span className="activity-text">
                    <span className="activity-title">{e.title}</span>
                    {e.detail && <span className="activity-detail">{e.detail}</span>}
                  </span>
                  <span className="activity-time">{e.source === 'you' ? 'you · ' : ''}{timeAgo(e.ts, now)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
