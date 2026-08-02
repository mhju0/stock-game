import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// react-router below 7.18.0 carries an open-redirect and a route-matching DoS.
// This floor keeps a reinstall from resolving backwards past those fixes.
//
// `npm audit` still reports GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF) against every
// 7.12+ release, and its only offered remedy is a breaking downgrade to 7.11.0.
// That is declined on purpose: the app is a client-only SPA (BrowserRouter, no
// hydrateRoot/renderToString anywhere), so RSC mode never runs, and downgrading
// would trade two reachable fixes for one unreachable advisory.
const MINIMUM = [7, 18, 0]

function installedVersion(pkg) {
  // process.cwd() is the vitest root; import.meta.url is not a usable file URL
  // under the jsdom environment this suite runs in.
  const manifest = join(process.cwd(), 'node_modules', pkg, 'package.json')
  return JSON.parse(readFileSync(manifest, 'utf8')).version
}

function isAtLeast(version, minimum) {
  const parts = version.split('-')[0].split('.').map(Number)
  for (let i = 0; i < minimum.length; i += 1) {
    if (parts[i] > minimum[i]) return true
    if (parts[i] < minimum[i]) return false
  }
  return true
}

describe('dependency advisories', () => {
  it('resolves react-router at or past the advisory fix', () => {
    const version = installedVersion('react-router')
    expect(isAtLeast(version, MINIMUM), `react-router is ${version}`).toBe(true)
  })

  it('resolves react-router-dom at or past the advisory fix', () => {
    const version = installedVersion('react-router-dom')
    expect(isAtLeast(version, MINIMUM), `react-router-dom is ${version}`).toBe(true)
  })
})
