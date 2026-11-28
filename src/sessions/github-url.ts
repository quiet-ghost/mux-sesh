// One GitHub repository, named by its canonical clone URL: never credentials, query or fragment.
export interface GitHubRepository {
  readonly owner: string
  readonly repo: string
  readonly url: string
}

// A credentialed URL names a repository, but its username or token must never be used or shown.
export type GitHubURL =
  | { readonly kind: 'repository'; readonly repository: GitHubRepository }
  | { readonly kind: 'credentialed'; readonly repository: GitHubRepository }
  | { readonly kind: 'unsupported' }

const UNSUPPORTED: GitHubURL = { kind: 'unsupported' }
const SSH_PREFIX = 'git@github.com:'

function isSafeGitHubPathSegment(value: string): boolean {
  return value.length > 0 && value !== '.' && value !== '..' && /^[A-Za-z0-9._-]+$/.test(value)
}

function stripGitSuffix(value: string): string {
  return value.endsWith('.git') ? value.slice(0, -4) : value
}

function ownerAndRepo(path: string): { owner: string; repo: string } | undefined {
  const parts = path.split('/').filter(Boolean)

  if (parts.length !== 2) return undefined

  const [owner = '', name = ''] = parts
  const repo = stripGitSuffix(name)

  return isSafeGitHubPathSegment(owner) && isSafeGitHubPathSegment(repo)
    ? { owner, repo }
    : undefined
}

function parseSsh(input: string): GitHubURL {
  const named = ownerAndRepo(input.slice(SSH_PREFIX.length))

  if (!named) return UNSUPPORTED

  return {
    kind: 'repository',
    repository: { ...named, url: `${SSH_PREFIX}${named.owner}/${named.repo}.git` },
  }
}

function parseHttps(input: string): GitHubURL {
  let url: URL

  try {
    url = new URL(input)
  } catch {
    return UNSUPPORTED
  }

  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port !== '')
    return UNSUPPORTED

  const named = ownerAndRepo(url.pathname)

  if (!named) return UNSUPPORTED

  const repository = { ...named, url: `https://github.com/${named.owner}/${named.repo}.git` }

  return url.username || url.password
    ? { kind: 'credentialed', repository }
    : { kind: 'repository', repository }
}

export function parseGitHubURL(input: string): GitHubURL {
  const trimmed = input.trim()

  return trimmed.startsWith(SSH_PREFIX) ? parseSsh(trimmed) : parseHttps(trimmed)
}

// Whether the New query names a GitHub repository, including one it must refuse for credentials.
export function isGitHubURL(input: string): boolean {
  return parseGitHubURL(input).kind !== 'unsupported'
}

// GitHub owner and repository names are case-insensitive; the transport is not part of identity.
export function sameGitHubRepository(a: GitHubRepository, b: GitHubRepository): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
  )
}

export function gitHubRepositoryName(repository: GitHubRepository): string {
  return `${repository.owner}/${repository.repo}`
}
