import { describe, expect, it } from 'vitest'
import { currentMonth, trendingRange } from './trending.js'

const NOW = new Date('2026-11-14T00:00:00Z')

describe('trendingRange', () => {
  it('week 0 covers the whole month', () => {
    expect(trendingRange('2026-11', 0, NOW)).toEqual({ start: '2026-11-01', end: '2026-11-30' })
  })

  it('splits the month into 7-day weeks', () => {
    expect(trendingRange('2026-11', 1, NOW)).toEqual({ start: '2026-11-01', end: '2026-11-07' })
    expect(trendingRange('2026-11', 2, NOW)).toEqual({ start: '2026-11-08', end: '2026-11-14' })
    expect(trendingRange('2026-11', 4, NOW)).toEqual({ start: '2026-11-22', end: '2026-11-30' })
  })

  it('handles February in leap and non-leap years', () => {
    expect(trendingRange('2024-02', 4, NOW)).toEqual({ start: '2024-02-22', end: '2024-02-29' })
    expect(trendingRange('2025-02', 4, NOW)).toEqual({ start: '2025-02-22', end: '2025-02-28' })
  })

  it('allows the current month but rejects future months', () => {
    expect(trendingRange('2026-11', 0, NOW)).not.toBeNull()
    expect(trendingRange('2026-12', 0, NOW)).toBeNull()
    expect(trendingRange('2027-01', 0, NOW)).toBeNull()
  })

  it('rejects invalid input', () => {
    for (const [month, week] of [
      ['2026-13', 0],
      ['2026-00', 0],
      ['abc', 0],
      ['2026-1', 0],
      ['2026-11', -1],
      ['2026-11', 5],
      ['2026-11', 1.5],
      ['2026-11', NaN],
    ] as const) {
      expect(trendingRange(month, week, NOW)).toBeNull()
    }
  })
})

describe('currentMonth', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(currentMonth(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01')
    expect(currentMonth(new Date('2026-12-31T23:00:00Z'))).toBe('2026-12')
  })
})
