import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { AppConfig, InventoryResult, Project, RepoInfo } from '../shared/types.js'
import { DEFAULT_DATA_DIR, ROOT, createStore, type Store } from './store.js'
import { GithubError, RateLimitError, createGithub, type GithubClient } from './github.js'
import { skillsFromTree } from './repoSkills.js'
import { scanInventory } from './inventory.js'
import { projectStatus } from './status.js'
import { CliValidationError, createSkillsCli, type SkillsCli } from './skillsCli.js'
import { buildProfile, buildQueries, rankRecommendations, type CandidateRepo, type ProfileProject } from './recommend.js'
import { OWNER_RE, REPO_NAME_RE, isValidAgent, isValidSkillName, parseRepo } from './validate.js'
import { fmString, parseFrontmatter } from './frontmatter.js'

export interface AppDeps {
  store: Store
  github: GithubClient
  inventory: () => InventoryResult
  skillsCli: SkillsCli
  port?: number
  webDist?: string
}

const OG_IMAGE = (full: string) => `https://opengraph.githubassets.com/1/${full}`

function toRepoInfo(raw: Record<string, any>): RepoInfo {
  const full = typeof raw.full_name === 'string' ? raw.full_name : `${raw.owner?.login}/${raw.name}`
  return {
    name: raw.name,
    owner: raw.owner?.login ?? '',
    description: raw.description ?? null,
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    openIssues: raw.open_issues_count ?? 0,
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    pushedAt: raw.pushed_at ?? null,
    ownerAvatar: raw.owner?.avatar_url ?? null,
    htmlUrl: raw.html_url ?? `https://github.com/${full}`,
    previewUrl: OG_IMAGE(full),
  }
}

function toSearchCard(item: Record<string, any>) {
  const full = typeof item.full_name === 'string' ? item.full_name : `${item.owner?.login}/${item.name}`
  return {
    repo: full,
    name: item.name,
    owner: item.owner?.login ?? '',
    ownerAvatar: item.owner?.avatar_url ?? null,
    description: item.description ?? null,
    stars: item.stargazers_count ?? 0,
    forks: item.forks_count ?? 0,
    openIssues: item.open_issues_count ?? 0,
    topics: Array.isArray(item.topics) ? item.topics : [],
    pushedAt: item.pushed_at ?? null,
    htmlUrl: item.html_url ?? `https://github.com/${full}`,
    previewUrl: OG_IMAGE(full),
  }
}

const CATEGORY_RULES: [string, RegExp][] = [
  ['Agent 搭建', /agent|claude|cursor|skill|prompt|llm|copilot|windsurf|devin|\bmcp\b|automation/i],
  ['設計視覺', /design|\bui\b|\bux\b|css|tailwind|figma|visual|color|typograph|layout|frontend|react|vue|svelte|html|web|browser|landing|animation|icon|font/i],
  ['文件寫作', /writ|\bdoc|essay|blog|markdown|article|content|copywrit|editor|publish|newsletter|slide|presentation/i],
  ['開發工具', /tool|dev|code|git|test|lint|build|deploy|api|cli|framework|librar|debug|refactor|typescript|javascript|python|rust|golang|docker|kubernetes|ci\b|cd\b/i],
]

export function autoCategory(info: { topics?: string[]; description?: string | null } | null | undefined): string {
  if (!info) return '未分類'
  const text = [...(info.topics ?? []), info.description ?? ''].join(' ')
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat
  return '未分類'
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

function badRequest(c: any, message: string) {
  return c.json({ error: 'bad_request', message }, 400)
}

function notFound(c: any, message: string) {
  return c.json({ error: 'not_found', message }, 404)
}

export function createApp(deps: AppDeps) {
  const app = new Hono()
  const port = deps.port ?? 4777
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, '127.0.0.1:5173', 'localhost:5173'])
  const isLoopbackOrigin = (o: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(o)

  app.use('/api/*', async (c, next) => {
    const host = (c.req.header('host') ?? '').trim()
    if (!allowedHosts.has(host)) {
      return c.json({ error: 'forbidden', message: '不允許的來源' }, 403)
    }
    const origin = c.req.header('origin')
    if (origin !== undefined && !isLoopbackOrigin(origin)) {
      return c.json({ error: 'forbidden', message: '不允許的來源' }, 403)
    }
    if (c.req.method !== 'GET') {
      const ct = (c.req.header('content-type') ?? '').toLowerCase()
      if (!ct.startsWith('application/json')) {
        return c.json({ error: 'forbidden', message: 'Content-Type 必須是 application/json' }, 403)
      }
    }
    await next()
  })

  app.onError((err, c) => {
    if (err instanceof RateLimitError) {
      return c.json({ error: 'rate_limit', message: err.message, resetAt: err.resetAt }, 429)
    }
    if (err instanceof CliValidationError) {
      return c.json({ error: 'bad_request', message: err.message }, 400)
    }
    if (err instanceof GithubError && err.status === 404) {
      return c.json({ error: 'not_found', message: 'GitHub 上找不到此資源' }, 404)
    }
    return c.json({ error: 'internal', message: err instanceof Error ? err.message : '伺服器錯誤' }, 500)
  })

  app.notFound((c) => c.json({ error: 'not_found', message: '找不到此路由' }, 404))

  app.get('/api/projects', async (c) => {
    const projects = deps.store.getProjects()
    const inv = deps.inventory()
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const out: Record<string, unknown> = { ...p }
        try {
          const [owner, name] = p.repo.split('/')
          const raw = await deps.github.getRepo(owner, name)
          const info = toRepoInfo(raw)
          const auto = autoCategory({ topics: info.topics, description: info.description })
          let status = null
          try {
            const tree = await deps.github.getTree(owner, name)
            status = projectStatus(skillsFromTree(tree, name).skills, inv.lock, p.repo)
          } catch (e) {
            out.statusError = e instanceof Error ? e.message : '無法取得 skill 狀態'
          }
          out.info = info
          out.autoCategory = auto
          out.category = p.category ?? auto
          out.status = status
        } catch (e) {
          out.error = e instanceof Error ? e.message : '無法取得 repo 資訊'
          out.category = p.category ?? '未分類'
        }
        return out
      }),
    )
    return c.json({ projects: enriched })
  })

  app.post('/api/projects', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const parsed = parseRepo(body?.repo)
    if (!parsed) return badRequest(c, '請輸入有效的 GitHub repo（owner/repo 或 github.com 網址）')
    let raw: Record<string, any>
    try {
      raw = await deps.github.getRepo(parsed.owner, parsed.repo)
    } catch (e) {
      if (e instanceof RateLimitError) throw e
      if (e instanceof GithubError && e.status === 404) {
        return notFound(c, `找不到 GitHub repo：${parsed.full}`)
      }
      throw e
    }
    const full = typeof raw.full_name === 'string' ? raw.full_name : parsed.full
    const existing = deps.store.getProjects().find((p) => p.repo.toLowerCase() === full.toLowerCase())
    if (existing) return c.json({ project: existing, created: false })
    const project: Project = { repo: full, tags: [], addedAt: new Date().toISOString() }
    deps.store.addProject(project)
    return c.json({ project, created: true }, 201)
  })

  app.patch('/api/projects/:owner/:repo', async (c) => {
    const key = `${c.req.param('owner')}/${c.req.param('repo')}`
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return badRequest(c, '請求格式錯誤')
    const patch: { category?: string | null; tags?: string[]; note?: string | null } = {}
    if ('category' in body) {
      if (body.category !== null && (typeof body.category !== 'string' || body.category.length > 50)) {
        return badRequest(c, 'category 必須是 50 字元內的字串或 null')
      }
      patch.category = body.category as string | null
    }
    if ('tags' in body) {
      if (
        !Array.isArray(body.tags) ||
        body.tags.length > 30 ||
        body.tags.some((t) => typeof t !== 'string' || t.length > 50)
      ) {
        return badRequest(c, 'tags 必須是字串陣列')
      }
      patch.tags = body.tags as string[]
    }
    if ('note' in body) {
      if (body.note !== null && (typeof body.note !== 'string' || body.note.length > 2000)) {
        return badRequest(c, 'note 必須是 2000 字元內的字串或 null')
      }
      patch.note = body.note as string | null
    }
    const project = deps.store.updateProject(key, patch)
    if (!project) return notFound(c, '此專案不在收藏清單中')
    return c.json({ project })
  })

  app.delete('/api/projects/:owner/:repo', async (c) => {
    const key = `${c.req.param('owner')}/${c.req.param('repo')}`
    if (!deps.store.removeProject(key)) return notFound(c, '此專案不在收藏清單中')
    return c.json({ ok: true })
  })

  app.get('/api/projects/:owner/:repo/skills', async (c) => {
    const owner = c.req.param('owner')
    const name = c.req.param('repo')
    if (!OWNER_RE.test(owner) || !REPO_NAME_RE.test(name)) return badRequest(c, '無效的 repo 名稱')
    const tree = await deps.github.getTree(owner, name)
    const { skills: repoSkills, truncated } = skillsFromTree(tree, name)
    const inv = deps.inventory()
    const st = projectStatus(repoSkills, inv.lock, `${owner}/${name}`)
    const statusByPath = new Map(st.skills.map((s) => [s.path, s]))
    const capped = repoSkills.slice(0, 100)
    const skills = await mapLimit(capped, 6, async (s) => {
      let description = ''
      let fmName: string | undefined
      try {
        const md = await deps.github.getRawFile(owner, name, 'HEAD', s.path, s.blobSha || undefined)
        const fm = parseFrontmatter(md)
        fmName = fmString(fm, 'name')
        description = fmString(fm, 'description') ?? ''
      } catch {
        // 單一 SKILL.md 取得失敗時沿用資料夾名稱
      }
      return {
        name: fmName ?? s.name,
        folderName: s.dirName || s.name,
        path: s.path,
        folderSha: s.folderSha,
        state: statusByPath.get(s.path)?.state ?? 'not_installed',
        lockName: statusByPath.get(s.path)?.lockName,
        description,
      }
    })
    return c.json({ repo: `${owner}/${name}`, kind: st.kind, truncated, total: repoSkills.length, skills })
  })

  app.get('/api/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim()
    const topic = (c.req.query('topic') ?? '').trim()
    if (!q && !topic) return badRequest(c, '請輸入搜尋關鍵字')
    const query = [q, topic ? `topic:${topic}` : ''].filter(Boolean).join(' ')
    const items = await deps.github.searchRepos(query, { perPage: 30 })
    return c.json({ query, results: items.map(toSearchCard) })
  })

  app.get('/api/recommendations', async (c) => {
    const inv = deps.inventory()
    const projects = deps.store.getProjects()
    const config = deps.store.getConfig()

    const enriched: ProfileProject[] = await Promise.all(
      projects.map(async (p) => {
        try {
          const [o, r] = p.repo.split('/')
          const raw = await deps.github.getRepo(o, r)
          const info = toRepoInfo(raw)
          return { ...p, info: { topics: info.topics, description: info.description } }
        } catch {
          return { ...p, info: null }
        }
      }),
    )

    const sources = [...new Set(inv.skills.map((s) => s.source).filter((s): s is string => Boolean(s)))]
    const sourceTopics: Record<string, string[]> = {}
    await Promise.all(
      sources.map(async (src) => {
        const [o, r] = src.split('/')
        try {
          const raw = await deps.github.getRepo(o, r)
          sourceTopics[src] = Array.isArray(raw.topics) ? raw.topics : []
        } catch {
          // 單一來源 repo 取得失敗時略過其 topics
        }
      }),
    )

    const profile = buildProfile(inv, enriched, config, sourceTopics)
    const queries = buildQueries(profile, config.searchTopics)
    const seen = new Set<string>()
    const candidates: CandidateRepo[] = []
    for (const q of queries) {
      let items: Record<string, any>[] = []
      try {
        items = await deps.github.searchRepos(q, { perPage: 30 })
      } catch (e) {
        if (e instanceof RateLimitError) throw e
      }
      for (const item of items) {
        const card = toSearchCard(item)
        const key = card.repo.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        candidates.push({
          repo: card.repo,
          name: card.name,
          description: card.description,
          topics: card.topics,
          stars: card.stars,
          pushedAt: card.pushedAt,
          htmlUrl: card.htmlUrl,
          ownerAvatar: card.ownerAvatar,
          previewUrl: card.previewUrl,
        })
      }
    }

    const excluded = [...projects.map((p) => p.repo), ...sources]
    const recommendations = rankRecommendations(candidates, profile, Date.now(), excluded)
    return c.json({ recommendations, queries })
  })

  app.get('/api/inventory', (c) => {
    return c.json(deps.inventory())
  })

  app.get('/api/config', (c) => {
    const config = deps.store.getConfig()
    return c.json({
      hasToken: Boolean(config.githubToken),
      targets: config.targets,
      keywords: config.keywords,
      searchTopics: config.searchTopics,
    })
  })

  app.put('/api/config', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return badRequest(c, '請求格式錯誤')
    const patch: Partial<AppConfig> = {}
    if ('githubToken' in body) {
      if (body.githubToken !== null && typeof body.githubToken !== 'string') {
        return badRequest(c, 'githubToken 必須是字串或 null')
      }
      if (typeof body.githubToken === 'string' && body.githubToken.length > 500) {
        return badRequest(c, 'githubToken 過長')
      }
      patch.githubToken = body.githubToken === null ? '' : (body.githubToken as string)
    }
    if ('keywords' in body) {
      if (!Array.isArray(body.keywords) || body.keywords.length > 50 || body.keywords.some((k) => typeof k !== 'string' || k.length > 50)) {
        return badRequest(c, 'keywords 必須是字串陣列')
      }
      patch.keywords = body.keywords as string[]
    }
    if ('searchTopics' in body) {
      if (!Array.isArray(body.searchTopics) || body.searchTopics.length > 20 || body.searchTopics.some((t) => typeof t !== 'string' || t.length > 50)) {
        return badRequest(c, 'searchTopics 必須是字串陣列')
      }
      patch.searchTopics = body.searchTopics as string[]
    }
    if ('targets' in body) {
      const valid =
        Array.isArray(body.targets) &&
        body.targets.length > 0 &&
        body.targets.length <= 10 &&
        body.targets.every(
          (t) =>
            t &&
            typeof t === 'object' &&
            typeof (t as any).id === 'string' &&
            (t as any).id.length <= 30 &&
            typeof (t as any).label === 'string' &&
            (t as any).label.length <= 50 &&
            typeof (t as any).cliAgent === 'string' &&
            /^[a-z0-9-]{1,30}$/.test((t as any).cliAgent) &&
            typeof (t as any).default === 'boolean',
        )
      if (!valid) return badRequest(c, 'targets 格式錯誤')
      patch.targets = body.targets as AppConfig['targets']
    }
    const config = deps.store.saveConfig(patch)
    return c.json({
      hasToken: Boolean(config.githubToken),
      targets: config.targets,
      keywords: config.keywords,
      searchTopics: config.searchTopics,
    })
  })

  const allowedAgents = () => deps.store.getConfig().targets.map((t) => t.cliAgent)

  const cliReply = (res: { code: number | null; stdout: string; stderr: string }) => ({
    ok: res.code === 0,
    code: res.code,
    stdout: res.stdout,
    stderr: res.stderr,
    inventory: deps.inventory(),
  })

  app.post('/api/install', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, any> | null
    const parsed = parseRepo(body?.repo)
    if (!parsed) return badRequest(c, '請輸入有效的 GitHub repo（owner/repo 或 github.com 網址）')
    const skills = body?.skills
    if (!Array.isArray(skills) || skills.length === 0 || skills.length > 100 || skills.some((s) => !isValidSkillName(s))) {
      return badRequest(c, '請選擇至少一個有效的 skill')
    }
    const agents = body?.agents
    if (!Array.isArray(agents) || agents.length === 0 || agents.some((a) => !isValidAgent(a, allowedAgents()))) {
      return badRequest(c, '請選擇至少一個支援的目標工具')
    }
    const res = await deps.skillsCli.add({ repo: parsed.full, skills, agents })
    return c.json(cliReply(res))
  })

  app.post('/api/update', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, any> | null
    const skills = body?.skills
    if (!Array.isArray(skills) || skills.length === 0 || skills.length > 100 || skills.some((s) => !isValidSkillName(s))) {
      return badRequest(c, '請提供要更新的 skill 名稱')
    }
    const res = await deps.skillsCli.update({ skills })
    return c.json(cliReply(res))
  })

  app.post('/api/remove', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, any> | null
    const skills = body?.skills
    if (!Array.isArray(skills) || skills.length === 0 || skills.length > 100 || skills.some((s) => !isValidSkillName(s))) {
      return badRequest(c, '請提供要移除的 skill 名稱')
    }
    const res = await deps.skillsCli.remove({ skills })
    return c.json(cliReply(res))
  })

  const webDist = deps.webDist ?? join(ROOT, 'web', 'dist')
  app.use('/*', serveStatic({ root: webDist }))
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api')) return c.json({ error: 'not_found', message: '找不到此 API 路由' }, 404)
    try {
      return c.html(readFileSync(join(webDist, 'index.html'), 'utf8'))
    } catch {
      return c.json({ error: 'not_found', message: '找不到頁面' }, 404)
    }
  })

  return app
}

const invokedAsScript = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
  } catch {
    return false
  }
})()

if (invokedAsScript) {
  const dataDir = process.env.DATA_DIR ?? DEFAULT_DATA_DIR
  const store = createStore(dataDir)
  const port = Number(process.env.PORT ?? 4777) || 4777
  const github = createGithub({
    cacheDir: store.cacheDir,
    getToken: () => store.getConfig().githubToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined,
  })
  const home = homedir()
  const app = createApp({
    store,
    github,
    inventory: () => scanInventory({ home, appData: process.env.APPDATA }),
    skillsCli: createSkillsCli({ allowedAgents: () => store.getConfig().targets.map((t) => t.cliAgent) }),
    port,
  })
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    console.log(`Skill Hub 啟動於 http://127.0.0.1:${info.port}`)
  })
}
