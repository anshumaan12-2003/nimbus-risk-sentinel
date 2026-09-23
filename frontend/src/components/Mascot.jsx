/*
  Nimbo — a quiet line-drawn cloud used only in empty states.
  Drawn with theme tokens so it sits in both themes; the mood changes only the face and the
  shield colour. No idle animation: an empty state should feel calm, not busy.
  mood: 'calm' | 'happy' | 'alarmed' | 'thinking'
*/
const SHIELD = { calm: 'var(--accent)', happy: 'var(--low)', alarmed: 'var(--crit)', thinking: 'var(--fg-3)' }

export default function Mascot({ mood = 'calm', size = 88, label, className = '' }) {
  const stroke = 'var(--line-strong)'
  const ink = 'var(--fg-2)'
  return (
    <svg
      viewBox="0 0 120 96"
      width={size}
      height={size * 0.8}
      className={`shrink-0 animate-rise-in ${className}`}
      role="img"
      aria-label={label || (mood === 'happy' ? 'All clear' : mood === 'alarmed' ? 'Needs attention' : 'Nothing here yet')}
    >
      {/* cloud */}
      <path
        d="M30 78 h62 a18 18 0 0 0 2 -35.9 a26 26 0 0 0 -49.6 -6.6 A20 20 0 0 0 30 78 Z"
        fill="var(--surface-2)" stroke={stroke} strokeWidth="2" strokeLinejoin="round"
      />
      {/* face */}
      {mood === 'happy' ? (
        <g stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d="M48 55 q4 -5 8 0" /><path d="M66 55 q4 -5 8 0" />
          <path d="M53 63 q8 6 16 0" />
        </g>
      ) : mood === 'alarmed' ? (
        <g fill={ink}>
          <circle cx="52" cy="55" r="3" /><circle cx="70" cy="55" r="3" />
          <ellipse cx="61" cy="65" rx="3" ry="3.5" />
        </g>
      ) : mood === 'thinking' ? (
        <g fill={ink} stroke={ink} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="53" cy="54" r="2.6" stroke="none" /><circle cx="71" cy="54" r="2.6" stroke="none" />
          <path d="M55 64 h12" fill="none" />
        </g>
      ) : (
        <g fill={ink} stroke={ink} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="52" cy="55" r="2.6" stroke="none" /><circle cx="70" cy="55" r="2.6" stroke="none" />
          <path d="M55 63 q6 3.5 12 0" fill="none" />
        </g>
      )}
      {/* shield */}
      <g transform="translate(86 12)">
        <path d="M11 0 L22 4 V12 C22 19 11 24 11 24 C11 24 0 19 0 12 V4 Z" fill="var(--surface)" stroke={SHIELD[mood] || SHIELD.calm} strokeWidth="2" strokeLinejoin="round" />
        {mood === 'alarmed'
          ? <path d="M11 7 v7 M11 17.5 v0.5" stroke={SHIELD.alarmed} strokeWidth="2.2" strokeLinecap="round" />
          : <path d="M6.5 12 l3 3 l6 -6" stroke={SHIELD[mood] || SHIELD.calm} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      </g>
    </svg>
  )
}
