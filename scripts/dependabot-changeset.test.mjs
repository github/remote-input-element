import assert from 'node:assert/strict'
import {Buffer} from 'node:buffer'
import {describe, test} from 'node:test'

import {applyDependabotChangeset, evaluatePolicy, renderChangeset} from './dependabot-changeset.mjs'

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

describe('applyDependabotChangeset', () => {
  test('removes the existing changeset when the PR no longer qualifies', async t => {
    const changesetPath = '.changeset/dependabot-54.md'
    const existingSha = 'existing-sha'
    const requests = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = async (url, init = {}) => {
      const {pathname, searchParams} = new URL(url)
      requests.push({pathname, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined})

      if (pathname === '/repos/github/remote-input-element/contents/package.json') {
        // Both `base.sha` and `head.sha` resolve to the same manifest so this PR no longer
        // qualifies (a lockfile-only update), matching the scenario under test.
        const ref = searchParams.get('ref')
        const pkg = ref === 'base-sha' || ref === 'head-sha' ? basePackage : undefined
        if (!pkg) throw new Error(`Unexpected ref ${ref}`)

        return {
          ok: true,
          status: 200,
          json: async () => ({content: Buffer.from(JSON.stringify(pkg)).toString('base64')}),
        }
      }

      if (pathname === `/repos/github/remote-input-element/contents/${changesetPath}`) {
        if ((init.method ?? 'GET') === 'DELETE') {
          return {ok: true, status: 200, json: async () => ({})}
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({sha: existingSha, content: Buffer.from('placeholder').toString('base64')}),
        }
      }

      throw new Error(`Unexpected request to ${url}`)
    }
    t.after(() => {
      globalThis.fetch = originalFetch
    })

    const event = {
      pull_request: {
        number: 54,
        user: {login: 'dependabot[bot]'},
        base: {sha: 'base-sha'},
        head: {sha: 'head-sha', ref: 'dependabot/npm_and_yarn/remote-form-2.0.1', repo: {full_name: 'github/remote-input-element'}},
      },
      repository: {full_name: 'github/remote-input-element'},
    }

    const result = await applyDependabotChangeset({
      event,
      metadata: {'dependency-names': 'remote-form', 'alert-state': ''},
      token: 'test-token',
    })

    assert.equal(result.action, 'removed')

    const deleteRequest = requests.find(request => request.method === 'DELETE')
    assert.ok(deleteRequest, 'expected a DELETE request for the changeset')
    assert.equal(deleteRequest.pathname, `/repos/github/remote-input-element/contents/${changesetPath}`)
    assert.equal(deleteRequest.body.branch, 'dependabot/npm_and_yarn/remote-form-2.0.1')
    assert.equal(deleteRequest.body.sha, existingSha)
  })
})
