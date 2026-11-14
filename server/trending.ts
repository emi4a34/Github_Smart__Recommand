export interface TrendingRange {
  start: string
  end: string
}

export const TRENDING_SORTS = ['stars', 'forks', 'updated'] as const
export type TrendingSort = (typeof TRENDING_SORTS)[number]

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export function trendingRange(month: string, week: number, now = new Date()): TrendingRange | null {
  const m = month.match(MONTH_RE)
  if (!m || !Number.isInteger(week) || week < 0 || week > 4) return null
  if (month > currentMonth(now)) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const iso = (d: number) => `${month}-${String(d).padStart(2, '0')}`
  const startDay = week === 0 ? 1 : (week - 1) * 7 + 1
  const endDay = week === 0 || week === 4 ? daysInMonth : week * 7
  return { start: iso(startDay), end: iso(endDay) }
}
