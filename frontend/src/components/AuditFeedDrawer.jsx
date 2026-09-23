import { useState, useEffect } from 'react'
import Radio from 'lucide-react/dist/esm/icons/radio'
import X from 'lucide-react/dist/esm/icons/x'
import Pause from 'lucide-react/dist/esm/icons/pause'
import Play from 'lucide-react/dist/esm/icons/play'
import Shield from 'lucide-react/dist/esm/icons/shield'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import Clock from 'lucide-react/dist/esm/icons/clock'
import Filter from 'lucide-react/dist/esm/icons/filter'
import User from 'lucide-react/dist/esm/icons/user'
import Globe from 'lucide-react/dist/esm/icons/globe'
import Activity from 'lucide-react/dist/esm/icons/activity'
import { useSentinelStore } from '../store/sentinelStore'
import { getRemediationAudit } from '../api/nimbus'
import { useEventStore } from '../store/eventStore'

export default function AuditFeedDrawer() {
  const { auditDrawerOpen, closeAuditDrawer, dataSource } = useSentinelStore()
  const [events, setEvents] = useState([])
  const [isLive, setIsLive] = useState(true)
  const [filterService, setFilterService] = useState('ALL')

  // Load initial audit log
  useEffect(() => {
    if (dataSource !== 'demo') {
      getRemediationAudit().then(data => {
        if (data && data.length) {
          // Reformat to match the UI expected structure
          const formatted = data.map(evt => ({
            id: evt.id || `evt-${Date.now()}-${Math.random()}`,
            time: new Date(evt.timestamp).toLocaleTimeString(),
            service: (evt.rule_id || 'SYSTEM').split('-')[0],
            event: evt.action_executed || 'Remediation',
            actor: evt.requested_by ? `${evt.executed_by} (approved) · ${evt.requested_by} (requested)` : (evt.executed_by || 'System'),
            status: evt.status === 'VERIFIED_RESOLVED' ? 'INFO' : 'WARN',
            detail: `${evt.resource_id} — ${evt.result_message || evt.status}`
          }))
          setEvents(formatted)
        }
      }).catch(console.error)
    } else {
      // Import dynamically or define basic mock to avoid needing MOCK_AUDIT_STREAM static import
      setEvents([
        { id: 'evt-1', time: '10s ago', service: 'IAM', event: 'AssumeRoleWithSAML', actor: 'pipeline-runner@sentinel.cloud', status: 'WARN', detail: 'Role policy session elevated to AdminAccess' },
        { id: 'evt-2', time: '45s ago', service: 'S3', event: 'PutBucketAcl', actor: 'deploy-bot@ci-cd', status: 'CRITICAL', detail: 'PublicReadWrite granted on customer-finance-records' },
      ])
    }
  }, [dataSource])

  // Connect to actual WebSocket for LIVE events, else simulate
  useEffect(() => {
    if (!isLive) return

    if (dataSource === 'live') {
      // Reuse the app's single authenticated socket instead of opening a second, unauthenticated one
      return useEventStore.subscribe((state, prev) => {
        const data = state.events[0]
        if (!data || data === prev.events[0] || data.source !== 'live') return
        const newEvent = {
          id: data.id,
          time: new Date(data.ts || Date.now()).toLocaleTimeString(),
          service: (data.type || 'system').split('.')[0].toUpperCase(),
          event: data.title || data.type,
          actor: 'Nimbus',
          status: ['CRITICAL', 'HIGH'].includes(data.severity) ? 'WARN' : 'INFO',
          detail: data.detail || ''
        }
        setEvents((prev) => [newEvent, ...prev.slice(0, 49)])
      })
    } else {
      // Demo mode: Simulate periodic incoming CloudTrail events
      const interval = setInterval(() => {
        const sampleEvents = [
          { id: `evt-${Date.now()}`, time: 'just now', service: 'IAM', event: 'CreateAccessKey', actor: 'ci-runner@prod', status: 'WARN', detail: 'New programmatic credential generated for role/Deployer' },
          { id: `evt-${Date.now()}`, time: 'just now', service: 'S3', event: 'PutBucketPolicy', actor: 'admin@sentinel.cloud', status: 'ALERT', detail: 'Bucket policy amended on prod-customer-documents' },
          { id: `evt-${Date.now()}`, time: 'just now', service: 'EC2', event: 'RunInstances', actor: 'autoscale-group@prod', status: 'INFO', detail: 'Launched 2x t3.large instances in subnet-091a' },
        ]
        const chosen = sampleEvents[Math.floor(Math.random() * sampleEvents.length)]
        setEvents((prev) => [chosen, ...prev.slice(0, 19)])
      }, 9000)

      return () => clearInterval(interval)
    }
  }, [isLive, dataSource])

  if (!auditDrawerOpen) return null

  const filtered = filterService === 'ALL'
    ? events
    : events.filter(e => e.service.toUpperCase() === filterService)

  return (
    <div className="drawer-overlay" onClick={closeAuditDrawer}>
      <div className="drawer-card" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <Radio size={16} className="text-cyan animate-pulse" />
            <div>
              <h3 className="drawer-title">Real-Time CloudTrail Telemetry</h3>
              <p className="drawer-subtitle">Live audit stream across AWS and GCP infrastructure</p>
            </div>
          </div>

          <div className="drawer-header-right">
            <button
              className={`drawer-pause-btn ${isLive ? 'live' : 'paused'}`}
              onClick={() => setIsLive(!isLive)}
              title={isLive ? 'Pause live stream' : 'Resume live stream'}
            >
              {isLive ? <Pause size={12} /> : <Play size={12} />}
              <span>{isLive ? 'LIVE' : 'PAUSED'}</span>
            </button>
            <button className="drawer-close-btn" onClick={closeAuditDrawer}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="drawer-filter-bar">
          {['ALL', 'IAM', 'S3', 'EC2', 'RDS', 'GUARDDUTY'].map((svc) => (
            <button
              key={svc}
              className={`drawer-filter-pill ${filterService === svc ? 'active' : ''}`}
              onClick={() => setFilterService(svc)}
            >
              {svc}
            </button>
          ))}
        </div>

        {/* Events Feed List */}
        <div className="drawer-events-list">
          {filtered.map((evt) => {
            const isCrit = evt.status === 'CRITICAL'
            const isAlert = evt.status === 'ALERT'
            const isWarn = evt.status === 'WARN'
            const pillClass = isCrit ? 'critical' : isAlert ? 'high' : isWarn ? 'medium' : 'low'

            return (
              <div key={evt.id} className="drawer-event-item">
                <div className="event-top-row">
                  <span className={`event-status-tag ${pillClass}`}>
                    {evt.status}
                  </span>
                  <span className="event-service-tag">{evt.service}</span>
                  <span className="event-name-tag">{evt.event}</span>
                  <span className="event-time-tag">{evt.time}</span>
                </div>

                <div className="event-detail-text">{evt.detail}</div>

                <div className="event-meta-row">
                  <User size={11} className="text-secondary" />
                  <span className="event-actor-text">{evt.actor}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Drawer Footer */}
        <div className="drawer-footer">
          <div className="drawer-stream-status">
            <span className="live-dot-green" />
            <span>Streaming via AWS CloudWatch Logs Kinesis Subscription</span>
          </div>
        </div>
      </div>
    </div>
  )
}
