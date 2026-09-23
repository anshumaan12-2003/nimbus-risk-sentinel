import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/*
  Makes every <table> inside .main-content column-resizable, with zero
  per-page wiring. A MutationObserver picks up tables as pages render.

  - Drag the handle on a header's right edge to resize
  - Double-click the handle to reset that table to its default widths
  - Focus a handle and use ←/→ (Shift = bigger steps) for keyboard resizing
  - Widths persist per route + table index in localStorage
*/
const MIN_COL = 56
const KEY = (path, i) => `nimbus:cols:${path}:${i}`

function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function save(key, widths) {
  try { localStorage.setItem(key, JSON.stringify(widths)) } catch { /* storage full/blocked */ }
}

function enhance(table, key) {
  if (table.dataset.resizable === '1') return
  const ths = Array.from(table.querySelectorAll('thead tr:first-child > th'))
  if (ths.length < 2) return
  table.dataset.resizable = '1'

  const defaults = ths.map(th => Math.max(MIN_COL, Math.round(th.getBoundingClientRect().width)))
  const saved = readSaved(key)
  const widths = saved && saved.length === ths.length ? saved : [...defaults]

  const apply = () => {
    ths.forEach((th, i) => { th.style.width = `${widths[i]}px` })
    table.style.tableLayout = 'fixed'
    table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`
    table.style.minWidth = '100%'
  }
  apply()

  ths.forEach((th, i) => {
    if (i === ths.length - 1) return            // last column absorbs remaining space
    if (th.querySelector('input[type="checkbox"]')) return
    th.classList.add('th-resizable')

    const handle = document.createElement('div')
    handle.className = 'col-resizer'
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', `Resize ${th.textContent.trim() || 'column'}`)
    handle.tabIndex = 0
    handle.title = 'Drag to resize · double-click to reset'

    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation()
      const startX = e.clientX, startW = widths[i]
      handle.setPointerCapture(e.pointerId)
      document.body.classList.add('is-col-resizing')
      handle.classList.add('active')
      const move = ev => { widths[i] = Math.max(MIN_COL, startW + ev.clientX - startX); apply() }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        document.body.classList.remove('is-col-resizing')
        handle.classList.remove('active')
        save(key, widths)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
    handle.addEventListener('click', e => e.stopPropagation())   // don't trigger header sort
    handle.addEventListener('dblclick', e => {
      e.stopPropagation()
      defaults.forEach((w, j) => { widths[j] = w })
      apply()
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    })
    handle.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const step = e.shiftKey ? 48 : 16
      widths[i] = Math.max(MIN_COL, widths[i] + (e.key === 'ArrowRight' ? step : -step))
      apply(); save(key, widths)
    })
    th.appendChild(handle)
  })
}

export default function TableResizer() {
  const { pathname } = useLocation()

  useEffect(() => {
    const root = document.querySelector('.main-content')
    if (!root) return
    let raf = 0
    const scan = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        root.querySelectorAll('table').forEach((t, i) => enhance(t, KEY(pathname, i)))
      })
    }
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(root, { childList: true, subtree: true })
    return () => { mo.disconnect(); cancelAnimationFrame(raf) }
  }, [pathname])

  return null
}
