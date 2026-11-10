/* Why a finding's risk score differs from its severity. Mirrors backend/app/intelligence/risk_scorer.py:
   each severity has a base score, scaled up for resources that look sensitive (prod, customer, billing…)
   and down for ones that look disposable (dev, test, sandbox…). */
export const SEVERITY_BASE = { CRITICAL: 85, HIGH: 65, MEDIUM: 40, LOW: 20, INFO: 5 }

export function riskContext(f) {
  const score = Number(f?.risk_score) || 0
  const base = SEVERITY_BASE[String(f?.severity || '').toUpperCase()] ?? score
  const dir = score > base ? 'up' : score < base ? 'down' : null
  const sev = String(f?.severity || '').toLowerCase()
  const text = dir === 'up'
    ? `Risk ${score}: ${sev} (${base}), raised because the resource looks sensitive (prod, customer, billing…).`
    : dir === 'down'
      ? `Risk ${score}: ${sev} (${base}), lowered because the resource looks like dev or test.`
      : `Risk ${score}: the base score for a ${sev} finding.`
  return { score, base, dir, text }
}
