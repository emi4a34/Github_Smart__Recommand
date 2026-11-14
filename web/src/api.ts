import type {
  CliResponse,
  InventoryResult,
  Project,
  ProjectEntry,
  PublicConfig,
  RecommendationsResponse,
  RepoSkillsResponse,
  SearchCard,
} from '../../shared/types'

export class ApiError extends Error {
  status: number
  resetAt?: string
  constructor(status: number, message: string, resetAt?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.resetAt = resetAt
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    // 非 JSON 回應
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? `請求失敗 (HTTP ${res.status})`, data?.resetAt)
  }
  return data as T
}

export const api = {
  getProjects: () => request<{ projects: ProjectEntry[] }>('/api/projects'),
  addProject: (repo: string) =>
    request<{ project: Project; created: boolean }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ repo }),
    }),
  updateProject: (owner: string, repo: string, patch: { category?: string | null; tags?: string[]; note?: string | null }) =>
    request<{ project: Project }>(`/api/projects/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  removeProject: (owner: string, repo: string) =>
    request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { method: 'DELETE' }),
  getRepoSkills: (owner: string, repo: string) =>
    request<RepoSkillsResponse>(`/api/projects/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/skills`),
  search: (q: string, topic?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (topic) params.set('topic', topic)
    return request<{ query: string; results: SearchCard[] }>(`/api/search?${params.toString()}`)
  },
  getRecommendations: () => request<RecommendationsResponse>('/api/recommendations'),
  getInventory: () => request<InventoryResult>('/api/inventory'),
  install: (repo: string, skills: string[], agents: string[]) =>
    request<CliResponse>('/api/install', { method: 'POST', body: JSON.stringify({ repo, skills, agents }) }),
  update: (skills: string[]) =>
    request<CliResponse>('/api/update', { method: 'POST', body: JSON.stringify({ skills }) }),
  remove: (skills: string[]) =>
    request<CliResponse>('/api/remove', { method: 'POST', body: JSON.stringify({ skills }) }),
  getConfig: () => request<PublicConfig>('/api/config'),
  putConfig: (patch: { githubToken?: string | null; keywords?: string[]; searchTopics?: string[] }) =>
    request<PublicConfig>('/api/config', { method: 'PUT', body: JSON.stringify(patch) }),
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}
