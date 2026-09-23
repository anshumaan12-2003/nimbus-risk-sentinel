import { useEffect } from 'react'

/* One passive pointer listener for the whole app: whichever card
   the cursor is over gets --mx/--my set, and CSS draws a soft light
   that follows the pointer. Cheaper than a listener per card. */
export default function SpotlightTracker() {
  useEffect(() => {
    let last = null
    const onMove = e => {
      const el = e.target.closest?.('.card, .stat-card, .graph-node, .compliance-card')
      if (last && last !== el) last.classList.remove('is-lit')
      if (!el) { last = null; return }
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
      el.classList.add('is-lit')
      last = el
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  return null
}
