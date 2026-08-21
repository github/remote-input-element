import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, test} from 'node:test'

import {
  AUTO_CHANGESET_PREFIX,
  getTagDate,
  isSecurityUpdate,
  normalizeRepository,
  prepareRelease,
} from './prepare-release.mjs'

const DAY_MS = 24 * 60 * 60 * 1000

function git(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim()
}

function writePackageJson(cwd, version) {
  writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({name: '@github/remote-input-element', version, repository: 'github/remote-input-element'}, null, 2) + '\n',
  )
}

function commit(cwd, message, {merge, body} = {}) {
  git(['add', '-A'], cwd)
  const fullMessage = merge ? `${message}\n\n${body ?? ''}` : message
  git(['commit', '--allow-empty', '-m', fullMessage], cwd)
  return git(['rev-parse', 'HEAD'], cwd)
}

function tagCurrentVersion(cwd) {
  git(['tag', 'v0.4.0'], cwd)
}

function autoChangesets(cwd) {
  const changesetDir = path.join(cwd, '.changeset')
  return readdirSync(changesetDir)
    .filter(name => name.startsWith(AUTO_CHANGESET_PREFIX) && name.endsWith('.md'))
    .sort()
}

function autoChangesetContents(cwd) {
  return autoChangesets(cwd).map(name => readFileSync(path.join(cwd, '.changeset', name), 'utf8'))
}

function daysAfterTag(cwd, days) {
  return new Date(getTagDate('v0.4.0', cwd).getTime() + days * DAY_MS)
}

let repoDir

beforeEach(() => {
  repoDir = mkdtempSync(path.join(os.tmpdir(), 'prepare-release-'))
  git(['init', '-b', 'main'], repoDir)
  git(['config', 'user.email', 'test@example.com'], repoDir)
  git(['config', 'user.name', 'Test'], repoDir)
  mkdirSync(path.join(repoDir, '.changeset'))
  writeFileSync(path.join(repoDir, '.changeset', 'README.md'), '# changesets\n')
  writeFileSync(path.join(repoDir, '.changeset', 'config.json'), '{}\n')
})

afterEach(() => {
  rmSync(repoDir, {recursive: true, force: true})
})

describe('normalizeRepository', () => {
  test('accepts the owner/repo shorthand string', () => {
    assert.equal(normalizeRepository('github/remote-input-element'), 'github/remote-input-element')
  })

  test('accepts a full git URL string', () => {
    assert.equal(
      normalizeRepository('git+https://github.com/github/remote-input-element.git'),
      'github/remote-input-element',
    )
  })

  test('accepts an object with a url property', () => {
    assert.equal(
      normalizeRepository({type: 'git', url: 'https://github.com/github/remote-input-element.git'}),
      'github/remote-input-element',
    )
  })

  test('rejects a non-GitHub URL', () => {
    assert.throws(() => normalizeRepository('https://notgithub.com/owner/repo'))
  })
})

describe('isSecurityUpdate', () => {
  test('detects security labels', () => {
    assert.equal(isSecurityUpdate({title: 'Bump a dependency', labels: [{name: 'security'}]}), true)
  })

  test('detects a Dependabot HTML security section', () => {
    assert.equal(
      isSecurityUpdate({title: 'Bump js-yaml', body: '<h3>Security</h3><p>Fix potential DoS.</p>', labels: []}),
      true,
    )
  })

  test('detects CVE and GHSA identifiers', () => {
    assert.equal(isSecurityUpdate({title: 'Fix CVE-2026-12345', labels: []}), true)
    assert.equal(isSecurityUpdate({body: 'Resolves GHSA-abcd-1234-efgh', labels: []}), true)
  })

  test('does not classify an ordinary dependency update as security-related', () => {
    assert.equal(isSecurityUpdate({title: 'Bump a dependency', body: 'Routine maintenance', labels: []}), false)
  })
})

describe('prepareRelease', () => {
  test('does nothing when the checked-in version has no matching tag', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'skipped-pending-publication')
    assert.deepEqual(autoChangesets(repoDir), [])
  })

  test('does nothing when there are no changes after the current release tag', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'skipped-no-changes')
    assert.deepEqual(autoChangesets(repoDir), [])
  })

  test('creates one top-level synthetic changeset for a feature PR', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    const sha = commit(repoDir, 'Merge pull request #60 from github/some-feature', {
      merge: true,
      body: 'Add a feature',
    })

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'created')
    assert.equal(result.dependencyOnly, false)
    assert.deepEqual(autoChangesets(repoDir), [`${AUTO_CHANGESET_PREFIX}${sha.slice(0, 7)}.md`])

    const [content] = autoChangesetContents(repoDir)
    assert.match(content, /"@github\/remote-input-element": patch/)
    assert.match(content, /\[#60\]\(https:\/\/github\.com\/github\/remote-input-element\/pull\/60\)/)
    assert.match(content, new RegExp(`\\[\\\`${sha.slice(0, 7)}\\\`\\]`))
    assert.match(content, / - Add a feature/)
    assert.doesNotMatch(content, /Release unreleased changes:/)
    assert.doesNotMatch(content, /^\s*-\s/m)
  })

  test('creates a commit-only entry without adding its own list marker', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    const sha = commit(repoDir, 'Direct fix to main')

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'created')
    const [content] = autoChangesetContents(repoDir)
    assert.match(content, new RegExp(sha.slice(0, 7)))
    assert.match(content, / - Direct fix to main/)
    assert.doesNotMatch(content, /^\s*-\s/m)
  })

  test('creates one deterministic changeset file per release entry', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    const firstSha = commit(repoDir, 'Merge pull request #60 from github/feature-one', {
      merge: true,
      body: 'Add feature one',
    })
    const secondSha = commit(repoDir, 'Merge pull request #61 from github/feature-two', {
      merge: true,
      body: 'Add feature two',
    })

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'created')
    assert.equal(result.paths.length, 2)
    assert.deepEqual(autoChangesets(repoDir), [
      `${AUTO_CHANGESET_PREFIX}${firstSha.slice(0, 7)}.md`,
      `${AUTO_CHANGESET_PREFIX}${secondSha.slice(0, 7)}.md`,
    ].sort())

    const contents = autoChangesetContents(repoDir)
    assert.equal(contents.every(content => content.includes('"@github/remote-input-element": patch')), true)
    assert.equal(contents.every(content => !/^\s*-\s/m.test(content)), true)
    assert.equal(contents.filter(content => content.includes('#60')).length, 1)
    assert.equal(contents.filter(content => content.includes('#61')).length, 1)
  })

  test('is idempotent and rewrites the same automatic files', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #60 from github/some-feature', {merge: true, body: 'Add a feature'})

    const first = prepareRelease({cwd: repoDir})
    const firstNames = autoChangesets(repoDir)
    const firstContents = autoChangesetContents(repoDir)
    const second = prepareRelease({cwd: repoDir})

    assert.equal(first.action, 'created')
    assert.equal(second.action, 'created')
    assert.deepEqual(autoChangesets(repoDir), firstNames)
    assert.deepEqual(autoChangesetContents(repoDir), firstContents)
  })

  test('removes stale automatic files before rewriting the release plan', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #60 from github/some-feature', {merge: true, body: 'Add a feature'})
    writeFileSync(path.join(repoDir, '.changeset', `${AUTO_CHANGESET_PREFIX}stale.md`), 'stale\n')

    prepareRelease({cwd: repoDir})

    assert.equal(existsSync(path.join(repoDir, '.changeset', `${AUTO_CHANGESET_PREFIX}stale.md`)), false)
    assert.equal(autoChangesets(repoDir).length, 1)
  })

  test('explicit changesets take precedence and remove automatic files', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #60 from github/some-feature', {merge: true, body: 'Add a feature'})
    prepareRelease({cwd: repoDir})
    assert.equal(autoChangesets(repoDir).length, 1)

    writeFileSync(
      path.join(repoDir, '.changeset', 'explicit.md'),
      '---\n"@github/remote-input-element": minor\n---\n\nAdd a feature\n',
    )

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'skipped-explicit-changeset')
    assert.deepEqual(autoChangesets(repoDir), [])
  })

  test('waits when only ordinary dependency updates exist and the release is under 30 days old', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #53 from github/dependabot/npm_and_yarn', {
      merge: true,
      body: 'Bump the npm_and_yarn group',
    })

    let inspected = 0
    const result = prepareRelease({
      cwd: repoDir,
      now: daysAfterTag(repoDir, 10),
      fetchPullRequest: () => {
        inspected += 1
        return {title: 'Bump dependencies', body: 'Routine maintenance', labels: [{name: 'dependencies'}]}
      },
    })

    assert.equal(result.action, 'skipped-recent-dependencies')
    assert.equal(result.releaseAgeDays, 10)
    assert.equal(inspected, 1)
    assert.deepEqual(autoChangesets(repoDir), [])
  })

  test('releases dependency updates once the current release is at least 30 days old', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #53 from github/dependabot/npm_and_yarn', {
      merge: true,
      body: 'Bump the npm_and_yarn group',
    })

    const result = prepareRelease({
      cwd: repoDir,
      now: daysAfterTag(repoDir, 30),
      fetchPullRequest: () => {
        throw new Error('security metadata should not be fetched after the age threshold')
      },
    })

    assert.equal(result.action, 'created')
    assert.equal(result.dependencyOnly, true)
    assert.equal(autoChangesets(repoDir).length, 1)
  })

  test('releases a security dependency update immediately', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #53 from github/dependabot/npm_and_yarn', {
      merge: true,
      body: 'Bump js-yaml from 4.1.0 to 4.2.0',
    })

    const result = prepareRelease({
      cwd: repoDir,
      now: daysAfterTag(repoDir, 2),
      fetchPullRequest: () => ({
        title: 'Bump js-yaml from 4.1.0 to 4.2.0',
        body: '<h3>Security</h3><p>Fix potential DoS via quadratic complexity.</p>',
        labels: [{name: 'dependencies'}],
      }),
    })

    assert.equal(result.action, 'created')
    assert.equal(result.dependencyOnly, true)
    assert.equal(autoChangesets(repoDir).length, 1)
  })

  test('releases substantive code changes immediately even when the last release is recent', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #60 from github/new-behavior', {
      merge: true,
      body: 'Add new custom element behavior',
    })

    const result = prepareRelease({
      cwd: repoDir,
      now: daysAfterTag(repoDir, 1),
      fetchPullRequest: () => {
        throw new Error('non-dependency changes should not fetch dependency PR metadata')
      },
    })

    assert.equal(result.action, 'created')
    assert.equal(result.dependencyOnly, false)
    assert.equal(autoChangesets(repoDir).length, 1)
  })

  test('multiple patch changesets all target the same single package release', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    tagCurrentVersion(repoDir)
    commit(repoDir, 'Merge pull request #60 from github/feature-one', {merge: true, body: 'Add feature one'})
    commit(repoDir, 'Merge pull request #61 from github/feature-two', {merge: true, body: 'Add feature two'})

    prepareRelease({cwd: repoDir})

    const contents = autoChangesetContents(repoDir)
    assert.equal(contents.length, 2)
    for (const content of contents) {
      assert.match(content, /^---\n"@github\/remote-input-element": patch\n---/)
    }
  })
})
