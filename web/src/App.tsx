import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CliResponse,
  InventoryResult,
  ProjectEntry,
  PublicConfig,
} from '../../shared/types'
import { api, isApiError, ApiError } from './api'
import { Banner } from './components/ui'
import { Sidebar } from './components/Sidebar'
import { InstallDialog } from './components/InstallDialog'
import { ProjectsView } from './views/ProjectsView'
import { SkillsView, type SkillToolFilter } from './views/SkillsView'
import { SearchView } from './views/SearchView'
import { RecommendView } from './views/RecommendView'
import { SettingsView } from './views/SettingsView'

export type View =
  | { type: 'projects'; category?: string }
  | { type: 'search' }
  | { type: 'recommend' }
  | { type: 'skills'; tool: SkillToolFilter }
  | { type: 'settings' }

function parseHash(): View {
  const h = location.hash.replace(/^#\/?/, '')
  const [seg, ...rest] = h.split('/')
  switch (seg) {
    case 'search':
      return { type: 'search' }
    case 'recommend':
      return { type: 'recommend' }
    case 'skills': {
      const t = rest[0]
      if (t === 'devin' || t === 'cursor' || t === 'claude' || t === 'builtin') {
        return { type: 'skills', tool: t === 'builtin' ? 'builtin' : t }
      }
      return { type: 'skills', tool: 'all' }
    }
    case 'settings':
      return { type: 'settings' }
    case 'projects': {
      if (rest[0] === 'cat' && rest.length > 1) {
        return { type: 'projects', category: decodeURIComponent(rest.slice(1).join('/')) }
      }
      return { type: 'projects' }
    }
    default:
      return { type: 'projects' }
  }
}

function serializeView(v: View): string {
  switch (v.type) {
    case 'projects':
      return v.category ? `#/projects/cat/${encodeURIComponent(v.category)}` : '#/projects'
    case 'search':
      return '#/search'
    case 'recommend':
      return '#/recommend'
    case 'skills':
      return `#/skills/${v.tool === 'all' ? 'all' : v.tool}`
    case 'settings':
      return '#/settings'
  }
}

export default function App() {
  const [view, setView] = useState<View>(parseHash)
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null)
  const [inventory, setInventory] = useState<InventoryResult | null>(null)
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [installRepo, setInstallRepo] = useState<string | null>(null)

  const onError = useCallback((e: ApiError) => setError(e), [])
  const dismissError = useCallback(() => setError(null), [])

  const refreshProjects = useCallback(async () => {
    try {
      const d = await api.getProjects()
      setProjects(d.projects)
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    }
  }, [onError])

  const refreshInventory = useCallback(async () => {
    try {
      setInventory(await api.getInventory())
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    }
  }, [onError])

  const refreshConfig = useCallback(async () => {
    try {
      setConfig(await api.getConfig())
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    }
  }, [onError])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProjects(), refreshInventory(), refreshConfig()])
  }, [refreshProjects, refreshInventory, refreshConfig])

  useEffect(() => {
    void refreshAll().finally(() => setInitialLoading(false))
  }, [refreshAll])

  useEffect(() => {
    const onHash = () => setView(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((v: View) => {
    const hash = serializeView(v)
    if (location.hash === hash) setView(v)
    else location.hash = hash
  }, [])

  const savedRepos = useMemo(
    () => new Set((projects ?? []).map((p) => p.repo.toLowerCase())),
    [projects]
  )

  const onCliDone = useCallback(
    (inv?: unknown) => {
      if (inv && typeof inv === 'object' && 'skills' in (inv as InventoryResult)) {
        setInventory(inv as InventoryResult)
      }
      void refreshProjects()
    },
    [refreshProjects]
  )


  return (
    <div className="app">
      <Sidebar view={view} onNavigate={navigate} projects={projects} inventory={inventory} />
      <main className="main">
        <Banner error={error} onDismiss={dismissError} />
        {initialLoading ? (
          <p className="muted">載入中…</p>
        ) : (
          <>
            {view.type === 'projects' && (
              <ProjectsView
                projects={projects}
                loading={projects === null}
                category={view.category}
                onChanged={refreshAll}
                onInstall={setInstallRepo}
                onError={onError}
              />
            )}
            {view.type === 'skills' && (
              <SkillsView
                skills={inventory?.skills ?? null}
                loading={inventory === null}
                tool={view.tool}
                onChanged={refreshAll}
                onError={onError}
              />
            )}
            {view.type === 'search' && (
              <SearchView config={config} savedRepos={savedRepos} onChanged={refreshAll} onError={onError} />
            )}
            {view.type === 'recommend' && (
              <RecommendView savedRepos={savedRepos} onChanged={refreshAll} onError={onError} />
            )}
            {view.type === 'settings' && (
              <SettingsView config={config} onConfig={setConfig} onError={onError} />
            )}
          </>
        )}
      </main>
      <InstallDialog
        repo={installRepo}
        open={installRepo !== null}
        config={config}
        onClose={() => setInstallRepo(null)}
        onDone={(inv) => {
          onCliDone(inv as CliResponse['inventory'] | undefined)
        }}
      />
    </div>
  )
}
