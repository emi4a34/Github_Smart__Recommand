import { parse as parseYaml } from 'yaml'

export function parseFrontmatter(md: string): Record<string, unknown> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  try {
    const v = parseYaml(m[1])
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function fmString(fm: Record<string, unknown>, key: string): string | undefined {
  const v = fm[key]
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return undefined
}
