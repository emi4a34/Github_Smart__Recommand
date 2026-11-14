import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from './store.js'

describe('store', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'store-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('seeds projects and returns default targets on first run', () => {
    const store = createStore(dir)
    const projects = store.getProjects()
    expect(projects.map((p) => p.repo)).toEqual(['mattpocock/skills', 'GoogleChrome/modern-web-guidance'])
    const config = store.getConfig()
    expect(config.targets).toEqual([
      { id: 'shared', label: 'Devin + Cursor 共用（~/.agents/skills）', cliAgent: 'cursor', default: true },
      { id: 'devin', label: 'Devin 專用（~/.codeium/windsurf/skills）', cliAgent: 'windsurf', default: false },
    ])
    expect(config.searchTopics).toContain('agent-skills')
  })

  it('migrates legacy default targets', () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        targets: [
          { id: 'devin', label: 'Devin', cliAgent: 'windsurf' },
          { id: 'cursor', label: 'Cursor', cliAgent: 'cursor' },
        ],
        keywords: ['keep-me'],
      }),
    )
    const store = createStore(dir)
    const config = store.getConfig()
    expect(config.targets[0].id).toBe('shared')
    expect(config.targets[0].default).toBe(true)
    expect(config.keywords).toEqual(['keep-me'])
  })

  it('keeps custom targets that are not the legacy defaults', () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        targets: [{ id: 'x', label: 'X', cliAgent: 'custom-agent', default: false }],
      }),
    )
    const store = createStore(dir)
    expect(store.getConfig().targets[0].id).toBe('x')
  })

  it('clears githubToken when saved as empty string', () => {
    const store = createStore(dir)
    store.saveConfig({ githubToken: 'tok' })
    expect(store.getConfig().githubToken).toBe('tok')
    store.saveConfig({ githubToken: '' })
    expect(store.getConfig().githubToken).toBeUndefined()
  })
})
