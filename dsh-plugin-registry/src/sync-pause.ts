/** A global stop must never be converted into thousands of stale repository facts. */
export class SyncPaused extends Error {
  constructor(readonly reason: string) {
    super(`Registry sync paused: ${reason}`)
    this.name = 'SyncPaused'
  }
}
