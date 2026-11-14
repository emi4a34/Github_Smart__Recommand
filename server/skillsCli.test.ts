import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CliValidationError, buildAddArgs, buildRemoveArgs, buildUpdateArgs, createSkillsCli } from './skillsCli.js'

describe('arg builders', () => {
  it('buildAddArgs produces the exact argv', () => {
    expect(buildAddArgs({ repo: 'o/r', skills: ['a', 'b'], agents: ['cursor', 'windsurf'] })).toEqual([
      'add', 'o/r', '-g', '--copy', '-y',
      '-a', 'cursor', '-a', 'windsurf',
      '--skill', 'a', '--skill', 'b',
    ])
  })

  it('buildUpdateArgs requires names', () => {
    expect(buildUpdateArgs(['a', 'b'])).toEqual(['update', 'a', 'b', '-g', '-y'])
  })

  it('buildRemoveArgs produces the exact argv (all agents, no -a)', () => {
    expect(buildRemoveArgs(['a', 'b'])).toEqual(['remove', 'a', 'b', '-g', '-y'])
  })
})

describe('skillsCli validation', () => {
  let dir: string
  let lockPath: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cli-'))
    lockPath = join(dir, 'lock.json')
    writeFileSync(lockPath, JSON.stringify({ version: 3, skills: { real: { source: 'o/r' } } }))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const make = () => createSkillsCli({ allowedAgents: ['windsurf', 'cursor'], lockPath, cliPath: join(dir, 'cli.mjs'), timeoutMs: 5000 })

  it('rejects bad repo, agent, empty and untracked inputs', async () => {
    const cli = make()
    await expect(cli.add({ repo: 'a/b; rm -rf', skills: ['s'], agents: ['cursor'] })).rejects.toBeInstanceOf(CliValidationError)
    await expect(cli.add({ repo: 'o/r', skills: ['s'], agents: ['evil'] })).rejects.toBeInstanceOf(CliValidationError)
    await expect(cli.add({ repo: 'o/r', skills: [], agents: ['cursor'] })).rejects.toBeInstanceOf(CliValidationError)
    await expect(cli.add({ repo: 'o/r', skills: ['--evil'], agents: ['cursor'] })).rejects.toBeInstanceOf(CliValidationError)
    await expect(cli.update({ skills: [] })).rejects.toBeInstanceOf(CliValidationError)
    await expect(cli.update({ skills: ['ghost'] })).rejects.toBeInstanceOf(CliValidationError)
    await expect(cli.remove({ skills: [] })).rejects.toBeInstanceOf(CliValidationError)
    await expect(cli.remove({ skills: ['ghost'] })).rejects.toBeInstanceOf(CliValidationError)
  })

  it('spawns the CLI with an args array, shell:false and telemetry disabled', async () => {
    writeFileSync(join(dir, 'cli.mjs'), '// fake')
    const captured: { cmd?: string; args?: string[]; opts?: any } = {}
    const fakeSpawn = ((cmd: string, args: string[], opts: any) => {
      captured.cmd = cmd
      captured.args = args
      captured.opts = opts
      const child: any = {
        stdout: { on: (_e: string, cb: Function) => { queueMicrotask(() => cb('ok-out')); return child } },
        stderr: { on: (_e: string, cb: Function) => { queueMicrotask(() => cb('')); return child } },
        on: (ev: string, cb: Function) => { if (ev === 'close') queueMicrotask(() => cb(0)); return child },
        kill: () => {},
      }
      return child
    }) as any
    const cli = createSkillsCli({
      allowedAgents: ['windsurf', 'cursor'],
      lockPath,
      cliPath: join(dir, 'cli.mjs'),
      spawnImpl: fakeSpawn,
    })
    const res = await cli.add({ repo: 'o/r', skills: ['s1'], agents: ['cursor'] })
    expect(res.code).toBe(0)
    expect(res.stdout).toBe('ok-out')
    expect(captured.cmd).toBe(process.execPath)
    expect(captured.args?.[0]).toBe(join(dir, 'cli.mjs'))
    expect(captured.args?.slice(1)).toEqual(['add', 'o/r', '-g', '--copy', '-y', '-a', 'cursor', '--skill', 's1'])
    expect(captured.opts?.shell).toBe(false)
    expect(captured.opts?.env?.DISABLE_TELEMETRY).toBe('1')
    expect(captured.opts?.env?.CI).toBe('1')
    expect(captured.opts?.stdio?.[0]).toBe('ignore')
  })
})
