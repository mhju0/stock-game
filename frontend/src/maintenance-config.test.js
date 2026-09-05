// @vitest-environment node
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

function workflow(name) {
  return readFileSync(
    join(process.cwd(), '..', '.github', 'workflows', name),
    'utf8',
  )
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

  it('declares least-privilege workflow token permissions', () => {
    expect(workflow('ci.yml')).toMatch(/\npermissions:\n {2}contents: read\n/)
    expect(workflow('keepalive.yml')).toMatch(/\npermissions: \{\}\n/)
  })
})
