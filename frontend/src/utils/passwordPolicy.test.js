import { describe, expect, it } from 'vitest'
import { isStrongPassword } from './passwordPolicy'

describe('isStrongPassword', () => {
  it('accepts the public demo password', () => {
    expect(isStrongPassword('demo1234')).toBe(true)
  })

  it('requires at least eight characters with a letter and number', () => {
    expect(isStrongPassword('short1')).toBe(false)
    expect(isStrongPassword('onlyletters')).toBe(false)
    expect(isStrongPassword('12345678')).toBe(false)
  })

  it('rejects values over bcrypt\'s 72-byte input limit', () => {
    expect(isStrongPassword(`${'가'.repeat(24)}a1`)).toBe(false)
  })
})
