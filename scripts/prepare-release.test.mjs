import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test, describe, beforeEach, afterEach} from 'node:test'

import {prepareRelease, AUTO_CHANGESET_FILENAME} from './prepare-release.mjs'

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

describe('prepareRelease', () => {
  test('does nothing when the checked-in version has no matching tag (pending publication)', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'skipped-pending-publication')
    assert.equal(existsSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME)), false)
  })

  test('does nothing when there are no changes after the current release tag', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'skipped-no-changes')
    assert.equal(existsSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME)), false)
  })

  test('creates a synthetic patch changeset for changes after the current release tag', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)
    commit(repoDir, 'Merge pull request #53 from github/dependabot/npm_and_yarn', {
      merge: true,
      body: 'Bump the npm_and_yarn group across 1 directory with 2 updates',
    })

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'created')
    const content = readFileSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME), 'utf8')
    assert.match(content, /"@github\/remote-input-element": patch/)
    assert.match(content, /Bump the npm_and_yarn group across 1 directory with 2 updates/)
    assert.match(content, /\[#53\]\(https:\/\/github\.com\/github\/remote-input-element\/pull\/53\)/)
  })

  test('handles a single commit without an associated PR', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)
    const sha = commit(repoDir, 'Direct fix to main')

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'created')
    const content = readFileSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME), 'utf8')
    assert.match(content, /Direct fix to main/)
    assert.match(content, new RegExp(sha.slice(0, 7)))
  })

  test('does not create a synthetic changeset when an explicit changeset exists', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)
    commit(repoDir, 'Merge pull request #60 from github/some-feature', {merge: true, body: 'Add a feature'})
    writeFileSync(
      path.join(repoDir, '.changeset', 'some-feature.md'),
      '---\n"@github/remote-input-element": minor\n---\n\nAdd a feature\n',
    )

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'skipped-explicit-changeset')
    assert.equal(existsSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME)), false)
  })

  test('removes a stale synthetic changeset once an explicit changeset is added', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)
    commit(repoDir, 'Merge pull request #60 from github/dependabot/some-bump', {merge: true, body: 'Bump something'})

    const first = prepareRelease({cwd: repoDir})
    assert.equal(first.action, 'created')

    writeFileSync(
      path.join(repoDir, '.changeset', 'explicit.md'),
      '---\n"@github/remote-input-element": minor\n---\n\nAdd a feature\n',
    )

    const second = prepareRelease({cwd: repoDir})
    assert.equal(second.action, 'skipped-explicit-changeset')
    assert.equal(existsSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME)), false)
  })

  test('is idempotent across repeated runs', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)
    commit(repoDir, 'Merge pull request #53 from github/dependabot/npm_and_yarn', {
      merge: true,
      body: 'Bump the npm_and_yarn group across 1 directory with 2 updates',
    })

    const first = prepareRelease({cwd: repoDir})
    const firstContent = readFileSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME), 'utf8')

    const second = prepareRelease({cwd: repoDir})
    const secondContent = readFileSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME), 'utf8')

    assert.equal(first.action, 'created')
    assert.equal(second.action, 'created')
    assert.equal(firstContent, secondContent)
  })

  test('summarizes multiple merged PRs since the release tag', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)
    commit(repoDir, 'Merge pull request #53 from github/dependabot/npm_and_yarn', {
      merge: true,
      body: 'Bump the npm_and_yarn group across 1 directory with 2 updates',
    })
    commit(repoDir, 'Merge pull request #54 from github/dependabot/other', {
      merge: true,
      body: 'Bump other dependency',
    })

    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'created')
    assert.equal(result.entries.length, 2)
    const content = readFileSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME), 'utf8')
    assert.match(content, /#53/)
    assert.match(content, /#54/)
  })

  test('does not advance the proposed version when the release tag stays the same across runs', () => {
    writePackageJson(repoDir, '0.4.0')
    commit(repoDir, 'chore: initial commit')
    git(['tag', 'v0.4.0'], repoDir)
    commit(repoDir, 'Merge pull request #53 from github/dependabot/npm_and_yarn', {
      merge: true,
      body: 'Bump the npm_and_yarn group across 1 directory with 2 updates',
    })
    prepareRelease({cwd: repoDir})

    // A second, unrelated change is merged before the release PR is merged.
    commit(repoDir, 'Merge pull request #54 from github/dependabot/other', {
      merge: true,
      body: 'Bump other dependency',
    })
    const result = prepareRelease({cwd: repoDir})

    assert.equal(result.action, 'created')
    assert.equal(result.tag, 'v0.4.0')
    const content = readFileSync(path.join(repoDir, '.changeset', AUTO_CHANGESET_FILENAME), 'utf8')
    assert.match(content, /"@github\/remote-input-element": patch/)
    // Still only one patch entry in frontmatter -- the release PR would
    // still propose 0.4.1, not 0.4.2.
    assert.equal((content.match(/patch/g) || []).length, 1)
  })
})
