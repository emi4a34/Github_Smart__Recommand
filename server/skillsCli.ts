import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliResult } from '../shared/types.js'
import { isValidAgent, isValidSkillName, OWNER_RE, REPO_NAME_RE } from './validate.js'

const ANSI_RE = /[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_CLI_PATH = join(PROJECT_ROOT, 'node_modules', 'skills', 'bin', 'cli.mjs')

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

export interface AddArgs {
  repo: string
  skills: string[]
  agents: string[]
}

export function buildAddArgs({ repo, skills, agents }: AddArgs): string[] {
  return [
    'add', repo, '-g', '--copy', '-y',
    ...agents.flatMap((a) => ['-a', a]),
    ...skills.flatMap((s) => ['--skill', s]),
  ]
}

export function buildUpdateArgs(skills: string[]): string[] {
  return ['update', ...skills, '-g', '-y']
}

export function buildRemoveArgs(skills: string[]): string[] {
  return ['remove', ...skills, '-g', '-y']
}

export class CliValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliValidationError'
  }
}

function isValidRepoArg(repo: string): boolean {
  const parts = repo.split('/')
  return parts.length === 2 && OWNER_RE.test(parts[0]) && REPO_NAME_RE.test(parts[1])
}

function assertSkills(skills: unknown): asserts skills is string[] {
  if (!Array.isArray(skills) || skills.length === 0) {
    throw new CliValidationError('請至少選擇一個 skill')
  }
  for (const s of skills) {
    if (!isValidSkillName(s)) throw new CliValidationError(`無效的 skill 名稱：${String(s)}`)
  }
}

function assertAgents(agents: unknown, allowed: readonly string[]): asserts agents is string[] {
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new CliValidationError('請至少選擇一個目標工具')
  }
  for (const a of agents) {
    if (!isValidAgent(a, allowed)) throw new CliValidationError(`不支援的目標工具：${String(a)}`)
  }
}

export interface SkillsCliDeps {
  cliPath?: string
  allowedAgents: string[] | (() => string[])
  lockPath?: string
  timeoutMs?: number
  spawnImpl?: typeof spawn
}

export interface SkillsCli {
  add(args: AddArgs): Promise<CliResult>
  update(args: { skills: string[] }): Promise<CliResult>
  remove(args: { skills: string[] }): Promise<CliResult>
}

export function createSkillsCli(deps: SkillsCliDeps): SkillsCli {
  const cliPath = deps.cliPath ?? DEFAULT_CLI_PATH
  const timeoutMs = deps.timeoutMs ?? 5 * 60 * 1000
  const spawnImpl = deps.spawnImpl ?? spawn
  const allowedAgents = () => (typeof deps.allowedAgents === 'function' ? deps.allowedAgents() : deps.allowedAgents)
  const lockPath = deps.lockPath ?? join(homedir(), '.agents', '.skill-lock.json')

  const lockNames = (): Set<string> => {
    try {
      const raw = JSON.parse(readFileSync(lockPath, 'utf8'))
      return new Set(Object.keys(raw?.skills ?? {}))
    } catch {
      return new Set()
    }
  }

  const run = (args: string[]): Promise<CliResult> =>
    new Promise((resolvePromise) => {
      const child = spawnImpl(process.execPath, [cliPath, ...args], {
        shell: false,
        env: { ...process.env, DISABLE_TELEMETRY: '1', CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (result: CliResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolvePromise(result)
      }
      const timer = setTimeout(() => {
        child.kill()
        finish({ code: null, stdout: stripAnsi(stdout), stderr: stripAnsi(`${stderr}\n[逾時] skills CLI 已超過時限被終止`) })
      }, timeoutMs)
      child.stdout?.on('data', (d) => { stdout += d })
      child.stderr?.on('data', (d) => { stderr += d })
      child.on('error', (err) => {
        finish({ code: null, stdout: stripAnsi(stdout), stderr: stripAnsi(`${stderr}\n${err.message}`) })
      })
      child.on('close', (code) => {
        finish({ code, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr) })
      })
    })

  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const p = queue.then(job, job)
    queue = p.then(
      () => undefined,
      () => undefined,
    )
    return p
  }

  return {
    async add({ repo, skills, agents }) {
      if (!isValidRepoArg(repo)) throw new CliValidationError(`無效的 repo：${repo}`)
      assertSkills(skills)
      assertAgents(agents, allowedAgents())
      if (!existsSync(cliPath)) throw new CliValidationError('找不到 skills CLI')
      return enqueue(() => run(buildAddArgs({ repo, skills, agents })))
    },

    async update({ skills }) {
      assertSkills(skills)
      const tracked = lockNames()
      const untracked = skills.filter((s) => !tracked.has(s))
      if (untracked.length > 0) {
        throw new CliValidationError(`以下 skill 未由 skills CLI 安裝，無法更新：${untracked.join('、')}`)
      }
      return enqueue(() => run(buildUpdateArgs(skills)))
    },

    async remove({ skills }) {
      assertSkills(skills)
      const tracked = lockNames()
      const untracked = skills.filter((s) => !tracked.has(s))
      if (untracked.length > 0) {
        throw new CliValidationError(`以下 skill 不在 lock 檔中，無法移除：${untracked.join('、')}`)
      }
      return enqueue(() => run(buildRemoveArgs(skills)))
    },
  }
}
