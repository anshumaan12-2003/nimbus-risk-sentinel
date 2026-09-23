import { useId } from 'react'

/*
  Nimbo — Nimbus's cloud guardian. Pure SVG + CSS, no image assets.
  mood: 'calm' | 'happy' | 'alarmed' | 'thinking'
  Moods drive eyes, mouth, antenna light, body tint and idle motion,
  so the character tells you the state of your cloud at a glance.
*/
const MOUTHS = {
  calm:     'M55 66 Q63 71 71 66',
  happy:    'M52 64 Q63 76 74 64 Q63 70 52 64 Z',
  alarmed:  'M59 67 a4 4.5 0 1 0 8 0 a4 4.5 0 1 0 -8 0',
  thinking: 'M57 68 Q63 66 69 68',
}

export default function Mascot({ mood = 'calm', size = 96, label, className = '' }) {
  const id = useId().replace(/:/g, '')
  const body = mood === 'alarmed'
    ? ['#ffd1d1', '#ff8a8a', '#ff5c5c']
    : mood === 'happy'
      ? ['#c8ffe9', '#5dffc0', '#2de2a0']
      : ['#d6fff8', '#5dffe3', '#1fb7c9']

  return (
    <div
      className={`mascot mascot-${mood} ${className}`}
      style={{ width: size, height: size * 0.9 }}
      role="img"
      aria-label={label || `Nimbo is ${mood}`}
    >
      <svg viewBox="0 0 126 112" width="100%" height="100%" overflow="visible">
        <defs>
          <linearGradient id={`b${id}`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor={body[0]} />
            <stop offset="0.45" stopColor={body[1]} />
            <stop offset="1" stopColor={body[2]} />
          </linearGradient>
          <radialGradient id={`s${id}`} cx="0.35" cy="0.25" r="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse className="mascot-shadow" cx="63" cy="104" rx="30" ry="4.5" />

        <g className="mascot-body">
          {/* antenna */}
          <line x1="63" y1="18" x2="63" y2="7" stroke={body[2]} strokeWidth="2.5" strokeLinecap="round" />
          <circle className="mascot-antenna" cx="63" cy="6" r="4" />

          {/* cloud body */}
          <g fill={`url(#b${id})`}>
            <circle cx="40" cy="58" r="24" />
            <circle cx="63" cy="44" r="27" />
            <circle cx="87" cy="59" r="22" />
            <rect x="28" y="56" width="70" height="30" rx="15" />
          </g>
          <ellipse cx="54" cy="36" rx="14" ry="9" fill={`url(#s${id})`} />

          {/* little arms */}
          <path className="mascot-arm mascot-arm-l" d="M20 66 q-8 2 -9 10" stroke={body[2]} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path className="mascot-arm mascot-arm-r" d="M106 66 q8 2 9 10" stroke={body[2]} strokeWidth="5" strokeLinecap="round" fill="none" />

          {/* cheeks */}
          <ellipse cx="44" cy="66" rx="5" ry="3" fill="#ff7fa8" opacity={mood === 'alarmed' ? 0.2 : 0.55} />
          <ellipse cx="82" cy="66" rx="5" ry="3" fill="#ff7fa8" opacity={mood === 'alarmed' ? 0.2 : 0.55} />

          {/* eyes */}
          <g className="mascot-eyes">
            {mood === 'happy' ? (
              <>
                <path d="M47 57 q5 -6 10 0" stroke="#062421" strokeWidth="3" strokeLinecap="round" fill="none" />
                <path d="M69 57 q5 -6 10 0" stroke="#062421" strokeWidth="3" strokeLinecap="round" fill="none" />
              </>
            ) : (
              <>
                <ellipse cx="52" cy="56" rx={mood === 'alarmed' ? 5.5 : 4.5} ry={mood === 'alarmed' ? 6.5 : 5.5} fill="#062421" />
                <ellipse cx="74" cy="56" rx={mood === 'alarmed' ? 5.5 : 4.5} ry={mood === 'alarmed' ? 6.5 : 5.5} fill="#062421" />
                <circle cx={mood === 'thinking' ? 54 : 53.5} cy={mood === 'thinking' ? 53 : 54} r="1.7" fill="#fff" />
                <circle cx={mood === 'thinking' ? 76 : 75.5} cy={mood === 'thinking' ? 53 : 54} r="1.7" fill="#fff" />
              </>
            )}
          </g>
          {mood === 'alarmed' && (
            <>
              <path d="M45 47 l10 3" stroke="#062421" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M81 47 l-10 3" stroke="#062421" strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}

          {/* mouth */}
          <path
            d={MOUTHS[mood] || MOUTHS.calm}
            stroke="#062421" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            fill={mood === 'happy' || mood === 'alarmed' ? '#062421' : 'none'}
          />

          {/* shield badge */}
          <g transform="translate(56 74)">
            <path d="M7 0 L14 2.5 V8 C14 12.5 7 16 7 16 C7 16 0 12.5 0 8 V2.5 Z" fill="#062421" opacity="0.88" />
            <path d="M4 8 l2.3 2.3 L10.5 5.5" stroke={body[1]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        </g>

        {mood === 'thinking' && (
          <g className="mascot-dots">
            <circle cx="104" cy="28" r="3" /><circle cx="113" cy="18" r="4" /><circle cx="122" cy="6" r="5" />
          </g>
        )}
        {mood === 'happy' && (
          <g className="mascot-sparkles">
            <path d="M14 26 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" />
            <path d="M108 20 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 Z" />
          </g>
        )}
      </svg>
    </div>
  )
}
