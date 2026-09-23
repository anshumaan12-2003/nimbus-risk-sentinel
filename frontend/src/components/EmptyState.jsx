import Mascot from './Mascot'

/* One designed empty state for the whole app. An empty list in a
   security tool usually means good news — say so, with a character,
   instead of a grey line of text that reads like a broken query. */
export default function EmptyState({ mood = 'happy', title, description, children, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'empty-state-compact' : ''}`}>
      <Mascot mood={mood} size={compact ? 64 : 88} />
      {title && <div className="empty-state-title">{title}</div>}
      {description && <div className="empty-state-desc">{description}</div>}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  )
}
