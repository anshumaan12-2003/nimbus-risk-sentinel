const SEV_MAP = {
  CRITICAL:    { cls: 'badge-critical', dot: 'var(--sev-critical)' },
  HIGH:        { cls: 'badge-high',     dot: 'var(--sev-high)' },
  MEDIUM:      { cls: 'badge-medium',   dot: 'var(--sev-medium)' },
  LOW:         { cls: 'badge-low',      dot: 'var(--sev-low)' },
  INFO:        { cls: 'badge-brand',    dot: 'var(--brand)' },
  OPEN:        { cls: 'badge-critical', dot: 'var(--sev-critical)' },
  RESOLVED:    { cls: 'badge-low',      dot: 'var(--sev-low)' },
  IN_PROGRESS: { cls: 'badge-brand',    dot: 'var(--brand)' },
  ACCEPTED:    { cls: 'badge-neutral',  dot: 'var(--text-4)' },
}

export default function SeverityBadge({ severity, status }) {
  const raw = (severity || status || '').toUpperCase().replace(/\s/g, '_')
  const { cls = 'badge-neutral', dot } = SEV_MAP[raw] || {}

  return (
    <span className={`badge ${cls}`}>
      {dot && (
        <span style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: dot,
          display: 'inline-block',
          flexShrink: 0,
        }} />
      )}
      {raw.replace(/_/g, ' ')}
    </span>
  )
}
