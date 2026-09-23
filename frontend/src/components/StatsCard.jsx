import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right'
import ArrowDownRight from 'lucide-react/dist/esm/icons/arrow-down-right'
import Minus from 'lucide-react/dist/esm/icons/minus'

const VARIANT_MAP = {
  critical: { accent: 'critical', iconClass: 'critical' },
  high:     { accent: 'high',     iconClass: 'high' },
  medium:   { accent: 'medium',   iconClass: 'medium' },
  low:      { accent: 'low',      iconClass: 'low' },
  violet:   { accent: 'brand',    iconClass: 'brand' },
  brand:    { accent: 'brand',    iconClass: 'brand' },
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  variant = 'brand',
  subtitle,
  trend,       // 'up' | 'down' | 'neutral'
  trendValue,  // e.g. "+3"
  onClick,
}) {
  const { accent, iconClass } = VARIANT_MAP[variant] || VARIANT_MAP.brand

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  const trendClass = trend === 'up' ? 'stat-trend-up' : trend === 'down' ? 'stat-trend-down' : 'stat-trend-neutral'

  return (
    <div
      className={`stat-card ${accent}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="stat-card-top">
        {Icon && (
          <div className={`stat-icon-box ${iconClass}`}>
            <Icon size={14} />
          </div>
        )}
        {trend && (
          <span className={trendClass}>
            <TrendIcon size={12} />
            {trendValue}
          </span>
        )}
      </div>

      <div className="stat-number">{value}</div>
      <div className="stat-label">{title}</div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
    </div>
  )
}
