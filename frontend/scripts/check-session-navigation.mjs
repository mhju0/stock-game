import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const checks = [
  {
    file: 'src/pages/Watchlist.jsx',
    expectations: [
      [/gamePath\(sessionId,\s*['"]search['"]\)/, 'uses the session search route'],
      [/\?ticker=\$\{encodeURIComponent\(ticker\)\}/, 'builds a ticker query string'],
      [/navigate\(sessionId\s*\?/, 'chooses session-aware navigation when a session id exists'],
    ],
  },
  {
    file: 'src/pages/Market.jsx',
    expectations: [
      [/gamePath\(sessionId,\s*['"]search['"]\)/, 'uses the session search route'],
      [/\?ticker=\$\{encodeURIComponent\(ticker\)\}/, 'builds a ticker query string'],
      [/navigate\(sessionId\s*\?/, 'chooses session-aware navigation when a session id exists'],
    ],
  },
  {
    file: 'src/pages/SearchStock.jsx',
    expectations: [
      [/useSearchParams/, 'reads URL search params'],
      [/searchParams\.get\(['"]ticker['"]\)/, 'reads the ticker query param'],
      [/selectStock\(ticker\)/, 'loads stock detail from the ticker query param'],
    ],
  },
]

const failures = []

for (const check of checks) {
  const source = readFileSync(join(root, check.file), 'utf8')
  for (const [pattern, message] of check.expectations) {
    if (!pattern.test(source)) {
      failures.push(`${check.file}: expected ${message}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Session stock navigation smoke failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Session stock navigation smoke passed.')
