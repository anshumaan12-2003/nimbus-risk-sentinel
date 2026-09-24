import { describe, expect, it } from 'vitest'
import { forecastFor } from '@/lib/forecast'

const top = { resource_name: 'billing-db', resource_id: 'arn:aws:rds:…:billing-db', service: 'rds' }

describe('forecastFor: the Overview weather comes only from scan data', () => {
  it('storm when anything critical is open, naming the riskiest resource and exposure', () => {
    const f = forecastFor({ critical: 5, high: 8 }, [top], { crown_jewels_at_risk: 3 })
    expect(f.wx).toBe('storm')
    expect(f.headline).toBe('Storm warning over billing-db')
    expect(f.why).toBe('5 critical findings are open, and 3 crown jewels can be reached from the internet.')
  })
  it('singular wording and no exposure clause when nothing is reachable', () => {
    expect(forecastFor({ critical: 1 }, [top], { crown_jewels_at_risk: 0 }).why).toBe('1 critical finding is open.')
  })
  it('scattered risk when only high-severity findings are open', () => {
    const f = forecastFor({ critical: 0, high: 1 }, [top])
    expect(f.wx).toBe('haze')
    expect(f.headline).toMatch(/^Scattered risk in /)
    expect(f.why).toBe('Nothing critical is open, but 1 high-severity finding needs attention.')
  })
  it('clear skies otherwise, with an honest note about what is left', () => {
    expect(forecastFor({ medium: 2, low: 1 }).why).toBe('Nothing critical or high is open. 3 lower-severity findings are worth a look this week.')
    expect(forecastFor({}).why).toBe('Nothing is open. Every check Nimbus runs is passing.')
    expect(forecastFor({}).wx).toBe('clear')
  })
})
