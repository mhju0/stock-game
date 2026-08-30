import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

function dependabotUpdateBlocks() {
  const config = readFileSync(
    join(process.cwd(), '..', '.github', 'dependabot.yml'),
    'utf8',
  )

  return config
    .split(/\n(?= {2}- package-ecosystem:)/)
    .filter((block) => block.startsWith('  - package-ecosystem:'))
}

describe('maintenance dependency policy', () => {
  it('keeps unattended version updates within the current major versions', () => {
    const updateBlocks = dependabotUpdateBlocks()

    expect(updateBlocks).toHaveLength(3)
    for (const block of updateBlocks) {
      expect(block).toMatch(
        / {4}ignore:\n {6}- dependency-name: "\*"\n {8}update-types:\n {10}- "version-update:semver-major"/,
      )
    }
  })
})
