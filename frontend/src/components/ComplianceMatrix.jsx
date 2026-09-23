import { useState, useEffect, useCallback } from 'react'
import Shield from 'lucide-react/dist/esm/icons/shield'
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link'
import { MOCK_COMPLIANCE_BENCHMARKS } from '../data/mockData'
import { useNavigate } from 'react-router-dom'
import { useSentinelStore } from '../store/sentinelStore'
import { getComplianceBenchmarks } from '../api/nimbus'

export default function ComplianceMatrix({ compact = false }) {
  const navigate = useNavigate()
  const [selectedBenchmark, setSelectedBenchmark] = useState(null)
  
  const { dataSource } = useSentinelStore()
  const [benchmarks, setBenchmarks] = useState([])

  const loadBenchmarks = useCallback(async () => {
    let raw = MOCK_COMPLIANCE_BENCHMARKS
    if (dataSource !== 'demo') {
      try { raw = await getComplianceBenchmarks() } catch (e) { raw = [] }
    }
    setBenchmarks(Array.isArray(raw) ? raw : [])
  }, [dataSource])

  useEffect(() => { loadBenchmarks() }, [loadBenchmarks])

  return (
    <div className="compliance-matrix-wrap">
      <div className="compliance-grid">
        {benchmarks.map((bench) => {
          const isHighRisk = bench.status === 'HIGH_RISK'
          const isActionReq = bench.status === 'ACTION_REQUIRED'
          const statusClass = isHighRisk ? 'critical' : isActionReq ? 'warning' : 'success'

          return (
            <div
              key={bench.id}
              className="compliance-card"
              onClick={() => navigate('/compliance')}
            >
              <div className="compliance-top">
                <div className="compliance-icon-badge" style={{ borderColor: `${bench.color}40`, background: `${bench.color}15` }}>
                  <span>{bench.icon}</span>
                </div>
                <div className={`compliance-status-pill ${statusClass}`}>
                  {bench.status.replace('_', ' ')}
                </div>
              </div>

              <div className="compliance-name">{bench.name}</div>
              <div className="compliance-category">{bench.category}</div>

              {/* Progress bar */}
              <div className="compliance-progress-row">
                <div className="compliance-bar-track">
                  <div
                    className="compliance-bar-fill"
                    style={{
                      width: `${bench.score}%`,
                      background: `linear-gradient(90deg, ${bench.color}, ${bench.color}bb)`,
                      boxShadow: `0 0 12px ${bench.color}60`
                    }}
                  />
                </div>
                <span className="compliance-score-val" style={{ color: bench.color }}>
                  {bench.score}%
                </span>
              </div>

              {/* Rules pass/fail counter */}
              <div className="compliance-meta-row">
                <div className="compliance-stat">
                  <CheckCircle2 size={12} color="var(--low)" />
                  <span>{bench.passingRules} Passing</span>
                </div>
                <div className="compliance-stat">
                  <AlertTriangle size={12} color="var(--critical)" />
                  <span>{bench.failingRules} Failing</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
