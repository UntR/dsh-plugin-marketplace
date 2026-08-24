export type ApiErrorCode =
  | 'registry-unavailable'
  | 'registry-invalid'
  | 'registry-version-unsupported'
  | 'plugin-not-found'
  | 'plugin-not-installable'
  | 'invalid-request'
  | 'invalid-plugin-id'
  | 'invalid-package-name'
  | 'operation-in-progress'
  | 'build-approval-required'
  | 'command-failed'
  | 'command-timeout'
  | 'unknown-installed-plugin'
  | 'registry-source-mismatch'
  | 'cross-origin-request'
  | 'internal'

export class MarketplaceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message)
  }
}
