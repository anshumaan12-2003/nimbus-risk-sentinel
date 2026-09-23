import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, Card, CodeBlock, Page } from '@/components/ds'

/*
  Catches a crash in one page so the rest of the app keeps working.
  Pass `resetKey` (the route) so navigating away clears the error.
*/
export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[nimbus] view crashed:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Page>
        <Card data-error-boundary className="mx-auto grid max-w-xl justify-items-center gap-4 p-8 text-center">
          <div className="grid size-11 place-items-center rounded-xl border border-crit-line bg-crit-soft text-crit-text"><AlertTriangle className="size-5" /></div>
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-fg">This page hit a problem</h2>
            <p className="text-sm text-fg-2">The rest of Nimbus still works — your session and data are fine. Try again, or open another page from the sidebar.</p>
          </div>
          <CodeBlock code={String(this.state.error?.message || this.state.error)} className="w-full text-left" />
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => this.setState({ error: null })}><RefreshCw /> Try again</Button>
            <Button onClick={() => window.location.reload()}>Reload Nimbus</Button>
          </div>
        </Card>
      </Page>
    )
  }
}
