import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSentinelStore } from '../store/sentinelStore'
import { NAV, SETTINGS_ITEM } from '../app/nav'

// Two-key "g then x" navigation, like GitHub/Linear. Keys come from the nav map. Ignored while typing.
const PAGES = [...NAV.flatMap(g => g.items), SETTINGS_ITEM].filter(p => p.key)
const GOTO = Object.fromEntries(PAGES.map(p => [p.key, p.to]))

export const SHORTCUT_GROUPS = [
  {
    title: 'General',
    items: [
      { keys: ['⌘', 'K'], label: 'Search and commands' },
      { keys: ['/'], label: 'Search' },
      { keys: ['⌘', 'J'], label: 'Ask Vesper' },
      { keys: ['?'], label: 'Keyboard shortcuts' },
      { keys: ['Esc'], label: 'Close panel or dialog' },
    ],
  },
  {
    title: 'Go to',
    items: PAGES.map(p => ({ keys: ['G', p.key === ',' ? ',' : p.key.toUpperCase()], label: p.label })),
  },
]

// Flat list for the Settings page.
export const SHORTCUTS = SHORTCUT_GROUPS.flatMap(g => g.items.map(s => ({ keys: s.keys.join(' '), label: s.label })))

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
        const to = GOTO[e.key.toLowerCase()]
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
