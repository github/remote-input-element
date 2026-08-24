#!/usr/bin/env node
import {Buffer} from 'node:buffer'
import {readFileSync} from 'node:fs'

export const CHANGESET_PREFIX = 'dependabot-'

function parseList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(parseList)

  return String(value)
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function unique(values) {
  return [...new Set(values)]
}

function getUpdatedDependencyNames(metadata) {
  if (!metadata['updated-dependencies-json']) return []

  try {
    const dependencies = JSON.parse(metadata['updated-dependencies-json'])
    if (!Array.isArray(dependencies)) return []

    return dependencies
      .map(dependency => dependency.dependencyName ?? dependency['dependency-name'] ?? dependency.name)
      .filter(Boolean)
  } catch {
    return []
  }
}

export function getDependencyNames(metadata) {
  return unique([...getUpdatedDependencyNames(metadata), ...parseList(metadata['dependency-names'] ?? metadata['dependency-name'])])
}

export function isSecurityUpdate(metadata) {
  const alertState = String(metadata['alert-state'] ?? '').trim().toLowerCase()
  return alertState === 'fixed' || parseList(metadata['ghsa-id']).length > 0
}

export function getProductionRangeChanges({basePackage, headPackage, dependencyNames}) {
  const baseDependencies = basePackage.dependencies ?? {}
  const headDependencies = headPackage.dependencies ?? {}

  return dependencyNames.filter(name => {
    if (!(name in baseDependencies) && !(name in headDependencies)) return false
    return baseDependencies[name] !== headDependencies[name]
  })
}

export function evaluatePolicy({basePackage, headPackage, metadata}) {
  const dependencyNames = getDependencyNames(metadata)
  const securityUpdate = isSecurityUpdate(metadata)
  const productionRangeChanges = getProductionRangeChanges({basePackage, headPackage, dependencyNames})

  return {
    dependencyNames,
    qualifies: securityUpdate || productionRangeChanges.length > 0,
    reasons: {
      securityUpdate,
      productionRangeChanges,
    },
  }
}

function formatList(items) {
  if (items.length === 0) return 'dependencies'
  if (items.length === 1) return `\`${items[0]}\``
  return `${items.slice(0, -1).map(item => `\`${item}\``).join(', ')} and \`${items.at(-1)}\``
}

export function renderChangeset({packageName, prNumber, policy}) {
  const names = policy.dependencyNames
  const reason = policy.reasons.securityUpdate
    ? `Resolve Dependabot security alert(s) for ${formatList(names)}.`
    : `Bump production dependency range(s) for ${formatList(policy.reasons.productionRangeChanges)}.`

  return `---\n"${packageName}": patch\n---\n\n${reason}\n\nGenerated for Dependabot PR #${prNumber}.\n`
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function githubRequest(path, {method = 'GET', token, body, accept = 'application/vnd.github+json'} = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept,
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 404) return undefined
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${await response.text()}`)
  }

  return response.json()
}

async function readJsonContent({owner, repo, path, ref, token}) {
  const content = await githubRequest(`/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, {
    token,
  })
  if (!content?.content) throw new Error(`Unable to read ${path} at ${ref}`)
  return JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'))
}

async function getContent({owner, repo, path, ref, token}) {
  return githubRequest(`/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, {token})
}

async function putContent({owner, repo, path, branch, content, token, message, sha}) {
  await githubRequest(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: 'PUT',
    token,
    body: {
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha,
    },
  })
}

async function deleteContent({owner, repo, path, branch, token, message, sha}) {
  await githubRequest(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: 'DELETE',
    token,
    body: {message, branch, sha},
  })
}

export async function applyDependabotChangeset({event, metadata, token}) {
  const pr = event.pull_request
  if (!pr) throw new Error('This script must run for a pull request event.')
  if (pr.user.login !== 'dependabot[bot]') throw new Error(`Refusing to modify PR authored by ${pr.user.login}.`)
  if (pr.head.repo.full_name !== event.repository.full_name) {
    throw new Error('Refusing to write to a pull request branch from a different repository.')
  }

  const [owner, repo] = event.repository.full_name.split('/')
  const basePackage = await readJsonContent({owner, repo, path: 'package.json', ref: pr.base.sha, token})
  const headPackage = await readJsonContent({owner, repo, path: 'package.json', ref: pr.head.sha, token})
  const policy = evaluatePolicy({basePackage, headPackage, metadata})
  const changesetPath = `.changeset/${CHANGESET_PREFIX}${pr.number}.md`
  const existing = await getContent({owner, repo, path: changesetPath, ref: pr.head.ref, token})

  if (!policy.qualifies) {
    if (existing) {
      await deleteContent({
        owner,
        repo,
        path: changesetPath,
        branch: pr.head.ref,
        token,
        message: `Remove Dependabot changeset for #${pr.number}`,
        sha: existing.sha,
      })
      return {action: 'removed', path: changesetPath, policy}
    }

    return {action: 'skipped', path: changesetPath, policy}
  }

  const content = renderChangeset({packageName: headPackage.name, prNumber: pr.number, policy})
  if (existing && Buffer.from(existing.content, 'base64').toString('utf8') === content) {
    return {action: 'unchanged', path: changesetPath, policy}
  }

  await putContent({
    owner,
    repo,
    path: changesetPath,
    branch: pr.head.ref,
    token,
    content,
    message: `Add Dependabot changeset for #${pr.number}`,
    sha: existing?.sha,
  })

  return {action: existing ? 'updated' : 'created', path: changesetPath, policy}
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const event = JSON.parse(process.env.GITHUB_EVENT_JSON ?? readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const metadata = JSON.parse(process.env.DEPENDABOT_METADATA_JSON)
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is required.')

  applyDependabotChangeset({event, metadata, token})
    .then(result => {
      console.log(`${result.action} ${result.path}`)
      console.log(JSON.stringify(result.policy, null, 2))
    })
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
