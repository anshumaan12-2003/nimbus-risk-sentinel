import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSentinelStore } from '../store/sentinelStore'

// Two-key "g then x" navigation, like GitHub/Linear. Ignored while typing in a field.
const GOTO = { d: '/', f: '/findings', a: '/assets', w: '/workflow', t: '/topology', s: '/simulator',
               c: '/compliance', r: '/drift', h: '/scans', p: '/approvals', ',': '/settings' }

export const SHORTCUTS = [
  { keys: '⌘K / Ctrl+K', label: 'Command palette' },
  { keys: '/', label: 'Search (command palette)' },
  { keys: 'g d', label: 'Go to Dashboard' },
  { keys: 'g f', label: 'Go to Findings' },
  { keys: 'g a', label: 'Go to Assets' },
  { keys: 'g w', label: 'Go to Remediation board' },
  { keys: 'g p', label: 'Go to Approvals' },
  { keys: 'g s', label: 'Go to Attack simulator' },
  { keys: 'g c', label: 'Go to Compliance' },
  { keys: 'g r', label: 'Go to Drift' },
  { keys: 'g h', label: 'Go to Scan history' },
  { keys: 'g ,', label: 'Go to Settings' },
  { keys: '?', label: 'Show this list' },
  { keys: 'Esc', label: 'Close drawer / dialog' },
]

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export function useShortcuts() {
  const navigate = useNavigate()
  const openCommandPalette = useSentinelStore(s => s.openCommandPalette)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    let pendingG = false, timer
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(document.activeElement)) return
      if (pendingG) {
        pendingG = false; clearTimeout(timer)
        const to = GOTO[e.key]
        if (to) { e.preventDefault(); navigate(to) }
        return
      }
      if (e.key === 'g') { pendingG = true; timer = setTimeout(() => (pendingG = false), 900); return }
      if (e.key === '/') { e.preventDefault(); openCommandPalette() }
      if (e.key === '?') { e.preventDefault(); setHelpOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer) }
  }, [navigate, openCommandPalette])

  return { helpOpen, setHelpOpen }
}
