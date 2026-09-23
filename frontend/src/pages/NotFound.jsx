import { Link, useLocation } from 'react-router-dom'
import Compass from 'lucide-react/dist/esm/icons/compass'
import { EmptyState } from '../components/ui'

export default function NotFound() {
  const { pathname } = useLocation()
  return (
    <EmptyState icon={Compass} title="Page not found"
      body={<>Nothing lives at <code className="font-mono">{pathname}</code>. Press <kbd className="ui-kbd">?</kbd> for keyboard shortcuts.</>}
      action={<Link className="btn btn-primary" to="/">Back to dashboard</Link>} />
  )
}
