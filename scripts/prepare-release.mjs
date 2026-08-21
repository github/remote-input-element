#!/usr/bin/env node
// Repository-local Changesets helper.
//
// This script is intentionally small and dependency-free (besides Node's
// built-ins) so it can run as a plain preparation step before
// `changesets/action` in `.github/workflows/release.yml`, without requiring
// any changes to the upstream `changesets/action` project.
//
// It generates a single, deterministic "synthetic" patch changeset that
// summarizes the commits merged since the last released/tagged version, but
// only when there is no explicit changeset already checked in. This keeps
// the normal Changesets release-PR flow working for repositories (like this
// one) where changes are frequently merged (e.g. via Dependabot) without an
// accompanying changeset.
import {execFileSync} from 'node:child_process'
import {existsSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export const AUTO_CHANGESET_FILENAME = 'auto-release.md'
const NON_EXPLICIT_FILENAMES = new Set(['README.md', 'config.json', AUTO_CHANGESET_FILENAME])

function git(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim()
}

// Detects a shallow clone, which would make `${tag}..HEAD` comparisons
// unreliable (missing commits/tags). The release workflow must check out
// with `fetch-depth: 0`.
export function isShallowRepository(cwd) {
  return git(['rev-parse', '--is-shallow-repository'], cwd) === 'true'
}

// Returns true when `tag` exists in the repository at `cwd`.
export function tagExists(tag, cwd) {
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], cwd)
    return true
  } catch {
    return false
  }
}

// Returns the list of changeset markdown files that were authored explicitly
// by a maintainer, i.e. everything in `.changeset` except the config/readme
// files and the synthetic changeset this script maintains.
export function getExplicitChangesets(changesetDir) {
  if (!existsSync(changesetDir)) return []
  return readdirSync(changesetDir).filter(name => name.endsWith('.md') && !NON_EXPLICIT_FILENAMES.has(name))
}

// Parses `git log --first-parent` output for `range` into one entry per
// mainline commit (i.e. one entry per merged pull request, when merge
// commits are used), extracting a PR number when possible so the generated
// changeset can link back to it.
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

  const records = raw
    .split(REC)
    .map(entry => entry.trim())
    .filter(Boolean)

  const entries = []
  for (const record of records) {
    const [sha, subject, body = ''] = record.split(SEP)
    entries.push(parseCommit({sha, subject: subject ?? '', body}, repository))
  }
  return entries
}

// Normalizes the `repository` field of package.json (which may be a plain
// "owner/repo" shorthand string, a full git/https URL string, or an object
// with a `url` property) into a plain "owner/repo" string suitable for
// building GitHub URLs.
export function normalizeRepository(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url
  if (!raw) {
    throw new Error('Unable to determine the GitHub "owner/repo" from package.json\'s "repository" field.')
  }

  // Plain "owner/repo" shorthand, e.g. "github/remote-input-element".
  if (/^[^/\s:]+\/[^/\s]+$/.test(raw)) {
    return raw
  }

  // A GitHub URL (git/https/ssh), e.g.
  // "git+https://github.com/owner/repo.git" or "git@github.com:owner/repo.git".
  const match = raw.match(/(?:^|\/\/|@)github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/)
  if (!match) {
    throw new Error(`Unable to parse a GitHub "owner/repo" from repository field: ${JSON.stringify(raw)}`)
  }
  return match[1]
}

function parseCommit({sha, subject, body}, repository) {
  const shortSha = sha.slice(0, 7)
  const mergeMatch = subject.match(/^Merge pull request #(\d+) from/)
  if (mergeMatch) {
    const prNumber = mergeMatch[1]
    const title = body.split('\n').map(line => line.trim()).find(Boolean) || subject
    return {sha, shortSha, prNumber, title}
  }

  const squashMatch = subject.match(/\(#(\d+)\)\s*$/)
  if (squashMatch) {
    const prNumber = squashMatch[1]
    const title = subject.slice(0, squashMatch.index).trim()
    return {sha, shortSha, prNumber, title}
  }

  return {sha, shortSha, prNumber: undefined, title: subject}
}

// Renders the deterministic body of the synthetic changeset from the given
// commit/PR entries.
export function renderSummary(entries, repository) {
  const lines = entries.map(entry => {
    if (entry.prNumber) {
      return `- ${entry.title} in [#${entry.prNumber}](https://github.com/${repository}/pull/${entry.prNumber})`
    }
    return `- ${entry.title} ([\`${entry.shortSha}\`](https://github.com/${repository}/commit/${entry.sha}))`
  })
  return lines.join('\n')
}

export function buildChangesetContent(pkgName, entries, repository) {
  const summary =
    entries.length === 1 && !entries[0].prNumber
      ? renderSummary(entries, repository).replace(/^- /, '')
      : `Release unreleased changes:\n\n${renderSummary(entries, repository)}`
  return `---\n"${pkgName}": patch\n---\n\n${summary}\n`
}

// Orchestrates the whole "prepare release" step. Returns a small result
// object describing what happened, primarily for logging/testing purposes.
export function prepareRelease({cwd = process.cwd()} = {}) {
  const pkgPath = path.join(cwd, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const changesetDir = path.join(cwd, '.changeset')
  const autoChangesetPath = path.join(changesetDir, AUTO_CHANGESET_FILENAME)

  const explicit = getExplicitChangesets(changesetDir)
  if (explicit.length > 0) {
    if (existsSync(autoChangesetPath)) {
      rmSync(autoChangesetPath)
    }
    return {action: 'skipped-explicit-changeset', changesets: explicit}
  }

  const tag = `v${pkg.version}`
  if (!tagExists(tag, cwd)) {
    if (existsSync(autoChangesetPath)) {
      rmSync(autoChangesetPath)
    }
    return {action: 'skipped-pending-publication', tag, version: pkg.version}
  }

  if (isShallowRepository(cwd)) {
    throw new Error(
      `Cannot compute changes since ${tag} in a shallow clone. ` +
        'Configure `actions/checkout` with `fetch-depth: 0` in the release workflow.',
    )
  }

  const range = `${tag}..HEAD`
  const repository = normalizeRepository(pkg.repository)
  const entries = getCommitsSinceTag(range, cwd, repository)
  if (entries.length === 0) {
    if (existsSync(autoChangesetPath)) {
      rmSync(autoChangesetPath)
    }
    return {action: 'skipped-no-changes', tag}
  }

  const content = buildChangesetContent(pkg.name, entries, repository)
  writeFileSync(autoChangesetPath, content)
  return {action: 'created', tag, path: autoChangesetPath, entries}
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const result = prepareRelease({cwd: process.cwd()})
  switch (result.action) {
    case 'skipped-explicit-changeset':
      console.log(`Found explicit changeset(s): ${result.changesets.join(', ')}. Skipping synthetic changeset.`)
      break
    case 'skipped-pending-publication':
      console.log(
        `Release tag ${result.tag} not found; version ${result.version} in package.json is pending publication. Skipping synthetic changeset.`,
      )
      break
    case 'skipped-no-changes':
      console.log(`No changes found since ${result.tag}. Skipping synthetic changeset.`)
      break
    case 'created':
      console.log(`Created synthetic patch changeset at ${result.path} for ${result.entries.length} change(s) since ${result.tag}.`)
      break
    default:
      console.log(`Unhandled result: ${JSON.stringify(result)}`)
  }
}
