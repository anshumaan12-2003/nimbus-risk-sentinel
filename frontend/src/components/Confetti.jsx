import { useEffect, useState } from 'react'

/* Fire with: window.dispatchEvent(new CustomEvent('nimbus:celebrate'))
   Used when a remediation succeeds — closing a real vulnerability
   deserves a moment. Skipped entirely under prefers-reduced-motion. */
const COLORS = ['#2de2c8', '#5dffe3', '#f0c419', '#ff7fa8', '#8b7bff', '#3fe08a', '#ff9a3c']

export default function Confetti() {
  const [bursts, setBursts] = useState([])

  useEffect(() => {
    const onCelebrate = () => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const id = Date.now()
      const pieces = Array.from({ length: 70 }, (_, i) => ({
        i,
        left: 50 + (Math.random() - 0.5) * 30,
        dx: (Math.random() - 0.5) * 900,
        dy: -(260 + Math.random() * 420),
        rot: (Math.random() - 0.5) * 1080,
        delay: Math.random() * 0.12,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
        round: Math.random() > 0.6,
      }))
      setBursts(b => [...b, { id, pieces }])
      setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 2200)
    }
    window.addEventListener('nimbus:celebrate', onCelebrate)
    return () => window.removeEventListener('nimbus:celebrate', onCelebrate)
  }, [])

  if (!bursts.length) return null
  return (
    <div className="confetti-layer" aria-hidden="true">
      {bursts.map(b => b.pieces.map(p => (
        <span
          key={`${b.id}-${p.i}`}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.w, height: p.round ? p.w : p.w * 0.45,
            borderRadius: p.round ? '50%' : 2,
            background: p.color,
            animationDelay: `${p.delay}s`,
            '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`,
          }}
        />
      )))}
    </div>
  )
}
