import type { Socket } from 'socket.io-client'

/** A server disconnect disables Socket.IO's automatic reconnection. Verify the
 * session before reconnecting; retry outages, stop on revoked access or MFA. */
export function installSocketRecovery(socket: Socket, verifySession: () => Promise<boolean>,
  onError: (error: Error) => void, initialDelay = 1000) {
  let active = true, blocked = false, checking = false, timer: ReturnType<typeof setTimeout> | undefined, delay = initialDelay, generation = 0
  const permanent = (error: { status?: number }) => error.status === 401 || error.status === 403
  function block() {
    blocked = true; generation++; clearTimeout(timer); timer = undefined
    socket.disconnect()
  }
  function schedule() {
    if (!active || blocked || checking || socket.connected || timer !== undefined) return
    timer = setTimeout(() => { timer = undefined; void verify() }, delay)
    delay = Math.min(delay * 2, 30000)
  }
  async function verify() {
    if (!active || blocked || checking || socket.connected) return
    checking = true
    const current = generation
    let retry = false
    try {
      const valid = await verifySession()
      if (!active || current !== generation || blocked) return
      if (!valid) block()
      else if (!socket.connected) socket.connect()
    } catch (error) {
      if (!active || current !== generation || blocked) return
      if (permanent(error as { status?: number })) block()
      else retry = true
      onError(error as Error)
    } finally {
      checking = false
      // A connection can succeed and disappear while the old HTTP probe is
      // pending. Ignore its answer, then verify the new disconnection afresh.
      if (retry || current !== generation) schedule()
    }
  }
  function connected() { if (blocked) { socket.disconnect(); return }; generation++; clearTimeout(timer); timer = undefined; delay = initialDelay }
  function disconnected(reason: string) { if (reason === 'io server disconnect') schedule() }
  function failed(error: Error & { data?: { status?: number } }) {
    if (blocked || !active) return
    if (error.data && permanent(error.data)) { block(); onError(error) }
    else schedule()
  }
  socket.on('connect', connected)
  socket.on('disconnect', disconnected)
  socket.on('connect_error', failed)
  return () => {
    active = false; generation++; clearTimeout(timer)
    socket.off('connect', connected); socket.off('disconnect', disconnected); socket.off('connect_error', failed)
  }
}
