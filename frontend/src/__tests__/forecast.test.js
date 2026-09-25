import { describe, expect, it } from 'vitest'
import { changeSentence, forecastFor } from '@/lib/forecast'

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

describe('changeSentence: what changed since the last scan, in plain words', () => {
  it('celebrates pure progress', () => {
    expect(changeSentence({ resolved_count: 3, new_count: 0, regressed_count: 0 })).toBe('You fixed 3 findings and nothing new appeared. Nice work.')
    expect(changeSentence({ resolved_count: 1 })).toBe('You fixed 1 finding and nothing new appeared. Nice work.')
  })
  it('reports mixed changes in one sentence', () => {
    expect(changeSentence({ resolved_count: 2, new_count: 1, regressed_count: 1 })).toBe('You fixed 2, 1 new finding appeared and 1 came back.')
    expect(changeSentence({ new_count: 4 })).toBe('4 new findings appeared.')
  })
  it('says so when nothing changed', () => {
    expect(changeSentence({})).toBe('No change since the last scan.')
  })
})
