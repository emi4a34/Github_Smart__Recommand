import type { InstalledSkill, InventoryResult, ProjectEntry } from '../../../shared/types'
import type { View } from '../App'
import { categoryCounts, effectiveCategory } from './ProjectCard'
import { TOOL_LABELS } from '../format'

function countFor(skills: InstalledSkill[] | null, pred: (s: InstalledSkill) => boolean): number {
  return skills?.filter(pred).length ?? 0
}

export function Sidebar({
  view,
  onNavigate,
  projects,
  inventory,
}: {
  view: View
  onNavigate: (v: View) => void
  projects: ProjectEntry[] | null
  inventory: InventoryResult | null
}) {
  const skills = inventory?.skills ?? null
  const catCounts = projects ? categoryCounts(projects) : []
  const active = (v: View) => JSON.stringify(v) === JSON.stringify(view)

  const item = (v: View, label: string, count?: number) => (
    <button
      key={JSON.stringify(v)}
      className={`nav-item ${active(v) ? 'nav-active' : ''}`}
      onClick={() => onNavigate(v)}
    >
      <span>{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">◆</span> Skill Hub
      </div>

      <nav className="nav-group">
        <div className="nav-label">探索</div>
        {item({ type: 'projects' }, 'GitHub 專案', projects?.length ?? 0)}
        {item({ type: 'search' }, '搜尋')}
        {item({ type: 'recommend' }, '智慧推薦')}
        {item({ type: 'trending' }, '熱度榜')}
      </nav>

      <nav className="nav-group">
        <div className="nav-label">Skills</div>
        {item({ type: 'skills', tool: 'all' }, '全部 Skill', skills?.length ?? 0)}
        {(['devin', 'cursor', 'claude'] as const).map((t) =>
          item({ type: 'skills', tool: t }, TOOL_LABELS[t], countFor(skills, (s) => s.tools.includes(t)))
        )}
        {item({ type: 'skills', tool: 'builtin' }, 'Cursor 內建', countFor(skills, (s) => s.builtin))}
      </nav>

      {catCounts.length > 0 && (
        <nav className="nav-group">
          <div className="nav-label">分類</div>
          {catCounts.map(([c, n]) =>
            item({ type: 'projects', category: c }, c, n)
          )}
        </nav>
      )}

      <div className="sidebar-bottom">
        {item({ type: 'settings' }, '設定')}
      </div>
    </aside>
  )
}
