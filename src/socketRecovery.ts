import type { Socket } from 'socket.io-client'

/** A server disconnect disables Socket.IO's automatic reconnection. Verify the
 * session before reconnecting; retry outages, stop on revoked access or MFA. */
export function installSocketRecovery(socket: Socket, verifySession: () => Promise<boolean>,
  onError: (error: Error) => void, initialDelay = 1000) {
  let active = true, timer: ReturnType<typeof setTimeout> | undefined, delay = initialDelay, generation = 0
  const permanent = (error: { status?: number }) => error.status === 401 || error.status === 403
  function schedule() {
    if (!active || timer !== undefined) return
    timer = setTimeout(() => { timer = undefined; void verify() }, delay)
    delay = Math.min(delay * 2, 30000)
  }
  async function verify() {
    const current = generation
    try {
      const valid = await verifySession()
      if (active && current === generation && valid && !socket.connected) socket.connect()
    } catch (error) {
      if (!active || current !== generation) return
      onError(error as Error)
      if (!permanent(error as { status?: number })) schedule()
    }
  }
  function connected() { generation++; clearTimeout(timer); timer = undefined; delay = initialDelay }
  function disconnected(reason: string) { if (reason === 'io server disconnect') schedule() }
  function failed(error: Error & { data?: { status?: number } }) {
    if (error.data && permanent(error.data)) { generation++; clearTimeout(timer); timer = undefined; onError(error) }
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
