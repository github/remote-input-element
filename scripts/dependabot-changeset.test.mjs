import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {evaluatePolicy, renderChangeset} from './dependabot-changeset.mjs'

const basePackage = {
  name: '@github/remote-input-element',
  dependencies: {
    '@github/auto-check-element': '^1.0.0',
    'remote-form': '^2.0.0',
  },
  devDependencies: {
    eslint: '^8.0.0',
  },
}

function policy({headPackage = basePackage, metadata}) {
  return evaluatePolicy({basePackage, headPackage, metadata})
}

describe('evaluatePolicy', () => {
  test('adds a patch changeset for a direct production dependency with a changed manifest range', () => {
    const result = policy({
      headPackage: {
        ...basePackage,
        dependencies: {...basePackage.dependencies, '@github/auto-check-element': '^2.0.0'},
      },
      metadata: {'dependency-names': '@github/auto-check-element', 'alert-state': ''},
    })

    assert.equal(result.qualifies, true)
    assert.deepEqual(result.reasons.productionRangeChanges, ['@github/auto-check-element'])
  })

  test('does not add a changeset for a direct development dependency', () => {
    const result = policy({
      headPackage: {
        ...basePackage,
        devDependencies: {...basePackage.devDependencies, eslint: '^9.0.0'},
      },
      metadata: {'dependency-names': 'eslint', 'alert-state': ''},
    })

    assert.equal(result.qualifies, false)
  })

  test('does not add a changeset for an indirect dependency', () => {
    const result = policy({metadata: {'dependency-names': 'debug', 'alert-state': ''}})

    assert.equal(result.qualifies, false)
  })

  test('does not add a changeset for an inclusive lockfile-only update', () => {
    const result = policy({metadata: {'dependency-names': '@github/auto-check-element', 'alert-state': ''}})

    assert.equal(result.qualifies, false)
  })

  test('adds a changeset for a security update to a development dependency', () => {
    const result = policy({
      headPackage: {
        ...basePackage,
        devDependencies: {...basePackage.devDependencies, eslint: '^8.1.0'},
      },
      metadata: {'dependency-names': 'eslint', 'alert-state': 'fixed'},
    })

    assert.equal(result.qualifies, true)
    assert.equal(result.reasons.securityUpdate, true)
  })

  test('adds a changeset for a security update to an indirect dependency', () => {
    const result = policy({metadata: {'dependency-names': 'debug', 'ghsa-id': 'GHSA-abcd-1234-efgh'}})

    assert.equal(result.qualifies, true)
    assert.equal(result.reasons.securityUpdate, true)
  })

  test('adds exactly one changeset for a grouped PR where any update qualifies', () => {
    const result = policy({
      headPackage: {
        ...basePackage,
        dependencies: {...basePackage.dependencies, 'remote-form': '^3.0.0'},
        devDependencies: {...basePackage.devDependencies, eslint: '^9.0.0'},
      },
      metadata: {
        'updated-dependencies-json': JSON.stringify([
          {dependencyName: 'eslint'},
          {dependencyName: 'remote-form'},
          {dependencyName: 'debug'},
        ]),
        'alert-state': '',
      },
    })

    const changeset = renderChangeset({packageName: basePackage.name, prNumber: 54, policy: result})

    assert.equal(result.qualifies, true)
    assert.deepEqual(result.reasons.productionRangeChanges, ['remote-form'])
    assert.equal((changeset.match(/---/g) ?? []).length, 2)
    assert.match(changeset, /Generated for Dependabot PR #54\./)
  })

  test('repeated renders are idempotent', () => {
    const result = policy({
      headPackage: {
        ...basePackage,
        dependencies: {...basePackage.dependencies, 'remote-form': '^3.0.0'},
      },
      metadata: {'dependency-names': 'remote-form', 'alert-state': ''},
    })

    assert.equal(
      renderChangeset({packageName: basePackage.name, prNumber: 54, policy: result}),
      renderChangeset({packageName: basePackage.name, prNumber: 54, policy: result}),
    )
  })

  test('a previously generated changeset is removed when the PR no longer qualifies', () => {
    const qualifying = policy({
      headPackage: {
        ...basePackage,
        dependencies: {...basePackage.dependencies, 'remote-form': '^3.0.0'},
      },
      metadata: {'dependency-names': 'remote-form', 'alert-state': ''},
    })
    const noLongerQualifying = policy({metadata: {'dependency-names': 'remote-form', 'alert-state': ''}})

    assert.equal(qualifying.qualifies, true)
    assert.equal(noLongerQualifying.qualifies, false)
  })
})
