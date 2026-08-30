import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

function deployedHeaders() {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'))
  return config.headers.flatMap((rule) => rule.headers)
}

describe('deployed frontend security headers', () => {
  it('restricts scripts and API connections with a Content Security Policy', () => {
    const policy = deployedHeaders().find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("connect-src 'self' https://stock-game-6411.onrender.com")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
  })
})
