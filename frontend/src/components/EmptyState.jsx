import { EmptyState as DsEmptyState } from './ds'

/* Legacy signature (description/children) on top of the design-system empty state. */
export default function EmptyState({ mood = 'happy', title, description, children, compact = false }) {
  return <DsEmptyState mood={mood} title={title} body={description} action={children} compact={compact} />
}
