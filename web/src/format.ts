export function compactNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

export const TOOL_LABELS: Record<string, string> = {
  devin: 'Devin',
  cursor: 'Cursor',
  claude: 'Claude',
  builtin: '內建',
}

export function splitRepo(repo: string): { owner: string; name: string } {
  const [owner = '', ...rest] = repo.split('/')
  return { owner, name: rest.join('/') || repo }
}

export function githubRepoUrl(repo: string): string {
  return `https://github.com/${repo}`
}

export function formatResetTime(resetAt?: string): string {
  if (!resetAt) return ''
  const d = new Date(resetAt)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
