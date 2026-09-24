/*
  WCAG contrast check for the design tokens, in both themes.

    node scripts/check-contrast.mjs

  Reads the hex values straight from src/styles/tokens.css, so it checks what ships.
  Text pairs need 4.5:1 (WCAG AA, normal text); exits non-zero if any pair fails.
*/
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

function block(selector) {
  const start = css.indexOf(selector + ' {')
  if (start < 0) throw new Error(`No ${selector} block in tokens.css`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2]]))
}
const light = block(':root')
const themes = { light, dark: { ...light, ...block(':root[data-theme="dark"]') } }

const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

// [text token, background tokens] — every combination the components actually use
const PAIRS = [
  ['fg', ['bg', 'surface', 'surface-2', 'muted', 'muted-2']],
  ['fg-2', ['bg', 'surface', 'surface-2', 'muted', 'muted-2']],
  ['fg-3', ['bg', 'surface', 'surface-2', 'muted']],
  ['accent-fg', ['accent', 'accent-hover']],
  ['accent-text', ['bg', 'surface', 'surface-2', 'accent-soft']],
  ...['crit', 'high', 'med', 'low', 'info'].map(s => [`${s}-text`, ['surface', `${s}-soft`]]),
]

let failed = 0
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`)
  for (const [fg, bgs] of PAIRS) {
    for (const bg of bgs) {
      const r = ratio(t[fg], t[bg])
      const ok = r >= 4.5
      if (!ok) failed++
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  ${fg} on ${bg}`)
    }
  }
}
console.log(failed ? `\n${failed} pair(s) below 4.5:1` : '\nAll pairs meet WCAG AA (4.5:1)')
process.exit(failed ? 1 : 0)
