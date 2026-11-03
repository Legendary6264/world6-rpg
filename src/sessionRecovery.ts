export type SessionRecovery<T> = { reload: (fresh?: boolean) => Promise<T>; stop: () => void }

export function sessionAccessDenied(error: Error & { status?: number }) {
  return error.status === 401 || error.status === 403
}

/** One profile check per credential. Outages keep the credential and retry;
 * cancellation prevents a late response from restoring a previous account. */
export function createSessionRecovery<T>(read: (signal: AbortSignal) => Promise<T>,
  onValue: (value: T) => void, onError: (error: Error, retrying: boolean) => void,
  initialDelay = 1000): SessionRecovery<T> {
  let active = true, started = false, pending: Promise<T> | null = null, queued: Promise<T> | null = null, abort: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined, delay = initialDelay
  function reload(fresh = false): Promise<T> {
    if (!active) return Promise.reject(new DOMException('Session check cancelled', 'AbortError'))
    if (pending) {
      // A profile edit or account event can happen after the server read the
      // pending request. Coalesce notifications into one subsequent check.
      if (fresh && started && !queued)
        queued = pending.catch(() => {}).then(() => { queued = null; return reload() })
      return queued ?? pending
    }
    clearTimeout(timer); timer = undefined
    const current = new AbortController(); abort = current
    pending = Promise.resolve().then(() => {
      if (!active) throw new DOMException('Session check cancelled', 'AbortError')
      started = true; return read(current.signal)
    }).then(value => {
      if (!active) throw new DOMException('Session check cancelled', 'AbortError')
      delay = initialDelay; onValue(value)
      return value
    }).catch((error: Error & { status?: number }) => {
      if (active) {
        const retrying = error.status === 0 || error.status === 408 || error.status === 429 || (error.status ?? 0) >= 500
        onError(error, retrying)
        if (active && retrying) {
          timer = setTimeout(() => { timer = undefined; void reload().catch(() => {}) }, delay)
          delay = Math.min(delay * 2, 30000)
        }
      }
      throw error
    }).finally(() => { pending = null; started = false })
    return pending
  }
  return { reload, stop() { active = false; clearTimeout(timer); abort?.abort() } }
}
