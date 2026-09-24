import { SERVICE_NAMES } from '@/lib/aws'

/*
  The Overview's weather, worked out only from real scan data:
    storm  - at least one critical finding is open
    haze   - no criticals, but high-severity findings are open ("scattered risk")
    clear  - nothing critical or high is open
  `open` is the open findings sorted by risk (highest first); the top one names the place.
*/
const num = (v) => Number(v) || 0
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function forecastFor(stats, open = [], blast = null) {
  const crit = num(stats?.critical), high = num(stats?.high), rest = num(stats?.medium) + num(stats?.low)
  const top = open[0]
  const crowns = num(blast?.crown_jewels_at_risk)
  if (crit > 0) {
    const where = top?.resource_name || top?.resource_id
    return { wx: 'storm', headline: where ? `Storm warning over ${where}` : 'Storm warning',
             why: `${plural(crit, 'critical finding')} ${crit === 1 ? 'is' : 'are'} open${crowns ? `, and ${plural(crowns, 'crown jewel')} can be reached from the internet` : ''}.` }
  }
  if (high > 0) {
    const svc = top && (SERVICE_NAMES[top.service] || top.service)
    return { wx: 'haze', headline: svc ? `Scattered risk in ${svc}` : 'Scattered risk',
             why: `Nothing critical is open, but ${plural(high, 'high-severity finding')} ${high === 1 ? 'needs' : 'need'} attention.` }
  }
  return { wx: 'clear', headline: 'Clear skies over your account',
           why: rest ? `Nothing critical or high is open. ${plural(rest, 'lower-severity finding')} ${rest === 1 ? 'is' : 'are'} worth a look this week.`
                     : 'Nothing is open. Every check Nimbus runs is passing.' }
}
