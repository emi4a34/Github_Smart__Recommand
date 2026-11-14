import { describe, expect, it } from 'vitest'
import { isValidAgent, isValidSkillName, parseRepo } from './validate.js'

describe('parseRepo', () => {
  it('accepts owner/repo', () => {
    expect(parseRepo('mattpocock/skills')).toEqual({ owner: 'mattpocock', repo: 'skills', full: 'mattpocock/skills' })
  })

  it('accepts github.com URLs', () => {
    expect(parseRepo('https://github.com/o/r')?.full).toBe('o/r')
    expect(parseRepo('https://github.com/o/r/')?.full).toBe('o/r')
    expect(parseRepo('https://github.com/o/r.git')?.full).toBe('o/r')
    expect(parseRepo('https://github.com/o/r/tree/main')?.full).toBe('o/r')
    expect(parseRepo('http://www.github.com/o/r')?.full).toBe('o/r')
  })

  it('rejects invalid input', () => {
    expect(parseRepo('a/b; rm -rf /')).toBeNull()
    expect(parseRepo('../x')).toBeNull()
    expect(parseRepo('owner/repo; rm -rf')).toBeNull()
    expect(parseRepo('just-a-name')).toBeNull()
    expect(parseRepo('https://gitlab.com/o/r')).toBeNull()
    expect(parseRepo('https://github.com/onlyowner')).toBeNull()
    expect(parseRepo('')).toBeNull()
    expect(parseRepo(null)).toBeNull()
    expect(parseRepo(42)).toBeNull()
    expect(parseRepo('https://github.com/o/r extra')).toBeNull()
  })
})

describe('isValidSkillName', () => {
  it('accepts normal names including inner spaces', () => {
    expect(isValidSkillName('web-design-guidelines')).toBe(true)
    expect(isValidSkillName('a')).toBe(true)
    expect(isValidSkillName('my skill v2')).toBe(true)
    expect(isValidSkillName('a.b_c-d')).toBe(true)
  })

  it('rejects bad names', () => {
    expect(isValidSkillName('--skill')).toBe(false)
    expect(isValidSkillName('-x')).toBe(false)
    expect(isValidSkillName(' lead')).toBe(false)
    expect(isValidSkillName('')).toBe(false)
    expect(isValidSkillName('a'.repeat(101))).toBe(false)
    expect(isValidSkillName(123)).toBe(false)
  })
})

describe('isValidAgent', () => {
  it('checks whitelist', () => {
    const allowed = ['windsurf', 'cursor']
    expect(isValidAgent('windsurf', allowed)).toBe(true)
    expect(isValidAgent('cursor', allowed)).toBe(true)
    expect(isValidAgent('devin', allowed)).toBe(false)
    expect(isValidAgent('evil', allowed)).toBe(false)
    expect(isValidAgent(1, allowed)).toBe(false)
  })
})
