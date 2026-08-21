#!/usr/bin/env node
// Repository-local Changesets helper.
//
// Explicit changesets are released immediately. When changes have merged
// without a changeset, this script creates one automatically. Dependency-only
// changes are held until the current release is 30 days old, unless one of the
// dependency updates contains a security fix.
import {execFileSync} from 'node:child_process'
import {existsSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export const AUTO_CHANGESET_FILENAME = 'auto-release.md'
export const DEFAULT_DEPENDENCY_RELEASE_AGE_DAYS = 30
const NON_EXPLICIT_FILENAMES = new Set(['README.md', 'config.json', AUTO_CHANGESET_FILENAME])
const DAY_MS = 24 * 60 * 60 * 1000

function git(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim()
}

export function isShallowRepository(cwd) {
  return git(['rev-parse', '--is-shallow-repository'], cwd) === 'true'
}

export function tagExists(tag, cwd) {
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], cwd)
    return true
  } catch {
    return false
  }
}

export function getTagDate(tag, cwd) {
  return new Date(Number(git(['log', '-1', '--format=%ct', tag], cwd)) * 1000)
}

export function getExplicitChangesets(changesetDir) {
  if (!existsSync(changesetDir)) return []
  return readdirSync(changesetDir).filter(name => name.endsWith('.md') && !NON_EXPLICIT_FILENAMES.has(name))
}

export function getCommitsSinceTag(range, cwd, repository) {
  const SEP = '\x1f'
  const REC = '\x1e'
  const format = `%H${SEP}%s${SEP}%b${REC}`
  let raw
  try {
    raw = execFileSync('git', ['log', '--first-parent', `--pretty=format:${format}`, range], {
      cwd,
      encoding: 'utf8',
    })
  } catch (error) {
    throw new Error(`Unable to read git history for range "${range}": ${error.message}`)
  }

  return raw
    .split(REC)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(record => {
      const [sha, subject, body = ''] = record.split(SEP)
      return parseCommit({sha, subject: subject ?? '', body}, repository)
    })
}

export function normalizeRepository(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url
  if (!raw) {
    throw new Error('Unable to determine the GitHub "owner/repo" from package.json\'s "repository" field.')
  }

  if (/^[^/\s:]+\/[^/\s]+$/.test(raw)) return raw

  const match = raw.match(/(?:^|\/\/|@)github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/)
  if (!match) {
    throw new Error(`Unable to parse a GitHub "owner/repo" from repository field: ${JSON.stringify(raw)}`)
  }
  return match[1]
}

function parseCommit({sha, subject, body}) {
  const shortSha = sha.slice(0, 7)
  const mergeMatch = subject.match(/^Merge pull request #(\d+) from\s+([^\s]+)/)
  if (mergeMatch) {
    const title = body.split('\n').map(line => line.trim()).find(Boolean) || subject
    return {sha, shortSha, prNumber: mergeMatch[1], sourceBranch: mergeMatch[2], title}
  }

  const squashMatch = subject.match(/\(#(\d+)\)\s*$/)
  if (squashMatch) {
    return {
      sha,
      shortSha,
      prNumber: squashMatch[1],
      sourceBranch: undefined,
      title: subject.slice(0, squashMatch.index).trim(),
    }
  }

  return {sha, shortSha, prNumber: undefined, sourceBranch: undefined, title: subject}
}

export function isDependencyUpdate(entry) {
  return entry.sourceBranch?.includes('dependabot/') === true || /^Bump\b/i.test(entry.title)
}

export function isSecurityUpdate(pullRequest) {
  const text = `${pullRequest.title ?? ''}\n${pullRequest.body ?? ''}`
  const labels = (pullRequest.labels ?? []).map(label => (typeof label === 'string' ? label : label.name ?? ''))
  return (
    labels.some(label => /security|vulnerability/i.test(label)) ||
    /<h[1-6]>\s*Security\s*<\/h[1-6]>/i.test(text) ||
    /^\s{0,3}#{1,6}\s+Security\b/im.test(text) ||
    /\b(?:CVE-\d{4}-\d+|GHSA-[a-z0-9-]+)\b/i.test(text)
  )
}

export function fetchPullRequestWithGh({repository, prNumber, cwd, env = process.env}) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN
  if (!token) {
    throw new Error(
      `GITHUB_TOKEN is required to inspect dependency pull request #${prNumber} for security release notes.`,
    )
  }

  const output = execFileSync('gh', ['api', `repos/${repository}/pulls/${prNumber}`], {
    cwd,
    encoding: 'utf8',
    env: {...env, GH_TOKEN: token},
  })
  return JSON.parse(output)
}

export function renderSummary(entries, repository) {
  return entries
    .map(entry => {
      if (entry.prNumber) {
        return `- ${entry.title} in [#${entry.prNumber}](https://github.com/${repository}/pull/${entry.prNumber})`
      }
      return `- ${entry.title} ([\`${entry.shortSha}\`](https://github.com/${repository}/commit/${entry.sha}))`
    })
    .join('\n')
}

export function buildChangesetContent(pkgName, entries, repository) {
  const summary =
    entries.length === 1 && !entries[0].prNumber
      ? renderSummary(entries, repository).replace(/^- /, '')
      : `Release unreleased changes:\n\n${renderSummary(entries, repository)}`
  return `---\n"${pkgName}": patch\n---\n\n${summary}\n`
}

function removeAutoChangeset(autoChangesetPath) {
  if (existsSync(autoChangesetPath)) rmSync(autoChangesetPath)
}

export function prepareRelease({
  cwd = process.cwd(),
  now = new Date(),
  minimumDependencyReleaseAgeDays = Number(
    process.env.DEPENDENCY_RELEASE_AGE_DAYS || DEFAULT_DEPENDENCY_RELEASE_AGE_DAYS,
  ),
  fetchPullRequest = fetchPullRequestWithGh,
} = {}) {
  const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  const changesetDir = path.join(cwd, '.changeset')
  const autoChangesetPath = path.join(changesetDir, AUTO_CHANGESET_FILENAME)

  const explicit = getExplicitChangesets(changesetDir)
  if (explicit.length > 0) {
    removeAutoChangeset(autoChangesetPath)
    return {action: 'skipped-explicit-changeset', changesets: explicit}
  }

  const tag = `v${pkg.version}`
  if (!tagExists(tag, cwd)) {
    removeAutoChangeset(autoChangesetPath)
    return {action: 'skipped-pending-publication', tag, version: pkg.version}
  }

  if (isShallowRepository(cwd)) {
    throw new Error(
      `Cannot compute changes since ${tag} in a shallow clone. ` +
        'Configure `actions/checkout` with `fetch-depth: 0` in the release workflow.',
    )
  }

  const repository = normalizeRepository(pkg.repository)
  const entries = getCommitsSinceTag(`${tag}..HEAD`, cwd, repository)
  if (entries.length === 0) {
    removeAutoChangeset(autoChangesetPath)
    return {action: 'skipped-no-changes', tag}
  }

  const dependencyOnly = entries.every(isDependencyUpdate)
  if (dependencyOnly) {
    const releaseAgeDays = Math.floor((now.getTime() - getTagDate(tag, cwd).getTime()) / DAY_MS)
    if (releaseAgeDays < minimumDependencyReleaseAgeDays) {
      const securityEntry = entries.find(entry => {
        if (!entry.prNumber) return false
        const pullRequest = fetchPullRequest({repository, prNumber: entry.prNumber, cwd})
        return isSecurityUpdate(pullRequest)
      })

      if (!securityEntry) {
        removeAutoChangeset(autoChangesetPath)
        return {
          action: 'skipped-recent-dependencies',
          tag,
          releaseAgeDays,
          minimumDependencyReleaseAgeDays,
        }
      }
    }
  }

  writeFileSync(autoChangesetPath, buildChangesetContent(pkg.name, entries, repository))
  return {action: 'created', tag, path: autoChangesetPath, entries, dependencyOnly}
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const result = prepareRelease({cwd: process.cwd()})
  switch (result.action) {
    case 'skipped-explicit-changeset':
      console.log(`Found explicit changeset(s): ${result.changesets.join(', ')}. Preparing an immediate release.`)
      break
    case 'skipped-pending-publication':
      console.log(`Release tag ${result.tag} not found; version ${result.version} is pending publication.`)
      break
    case 'skipped-no-changes':
      console.log(`No changes found since ${result.tag}.`)
      break
    case 'skipped-recent-dependencies':
      console.log(
        `Only non-security dependency updates have merged and ${result.tag} is ${result.releaseAgeDays} day(s) old. ` +
          `Waiting until it is at least ${result.minimumDependencyReleaseAgeDays} days old.`,
      )
      break
    case 'created':
      console.log(`Created synthetic patch changeset at ${result.path} for ${result.entries.length} change(s) since ${result.tag}.`)
      break
    default:
      console.log(`Unhandled result: ${JSON.stringify(result)}`)
  }
}
