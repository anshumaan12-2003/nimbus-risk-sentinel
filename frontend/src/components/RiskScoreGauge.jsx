import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

const LEVELS = {
  secure:   { color: '#16a34a', label: 'Secure' },
  low:      { color: '#16a34a', label: 'Low Risk' },
  moderate: { color: '#d97706', label: 'Moderate' },
  high:     { color: '#ea580c', label: 'High Risk' },
  critical: { color: '#dc2626', label: 'Critical' },
}

function getLevel(score) {
  if (score === 0) return 'secure'
  if (score <= 25) return 'low'
  if (score <= 50) return 'moderate'
  if (score <= 75) return 'high'
  return 'critical'
}

export default function RiskScoreGauge({ score = 0 }) {
  const level = getLevel(score)
  const { color, label } = LEVELS[level]

  const data = [
    { value: score },
    { value: 100 - score },
  ]

  return (
    <div className="gauge-container">
      <div style={{ position: 'relative', width: 180, height: 180 }}>
        {/* Chart */}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* Track */}
            <Pie
              data={[{ value: 100 }]}
              cx="50%" cy="50%"
              innerRadius={64} outerRadius={76}
              startAngle={90} endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill="var(--surface-3)" />
            </Pie>
            {/* Score arc */}
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={64} outerRadius={80}
              startAngle={90} endAngle={-270}
              dataKey="value"
              strokeWidth={0}
              cornerRadius={4}
            >
              <Cell fill={color} />
              <Cell fill="transparent" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center text */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 2,
          pointerEvents: 'none',
        }}>
          <span className="gauge-score-val" style={{ color }}>
            {score}
          </span>
          <span className="gauge-score-label">RISK SCORE</span>
        </div>
      </div>

      {/* Label pill */}
      <span
        className="badge"
        style={{
          background: `${color}14`,
          color,
          border: `1px solid ${color}30`,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  )
}
