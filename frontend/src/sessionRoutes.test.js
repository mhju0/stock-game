import { describe, expect, it } from 'vitest'
import { getSessionIdFromPath } from './sessionRoutes'

describe('session path decoding', () => {
  it.each(['/games/%', '/games/%E0%A4%A', '/games/%ZZ/portfolio'])('fails closed for malformed percent path %s', (path) => {
    expect(getSessionIdFromPath(path)).toBeNull()
  })

  it('preserves valid encoded session identifiers and the setup route', () => {
    expect(getSessionIdFromPath('/games/%31%30%31/portfolio')).toBe('101')
    expect(getSessionIdFromPath('/games/101')).toBe('101')
    expect(getSessionIdFromPath('/games/new')).toBeNull()
  })
})
