import { Link, useLocation } from 'react-router-dom'
import { Page, Card, EmptyState, Button, Kbd } from '@/components/ds'

export default function NotFound() {
  const { pathname } = useLocation()
  return (
    <Page>
      <Card>
        <EmptyState mood="thinking" title="There’s nothing here"
          body={<>No page at <code className="font-mono text-xs">{pathname}</code>. Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to search, or <Kbd>?</Kbd> for shortcuts.</>}
          action={<Button variant="primary" asChild><Link to="/">Go to overview</Link></Button>} />
      </Card>
    </Page>
  )
}
