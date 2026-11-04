const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript'), React = require('react'), { JSDOM } = require('jsdom')
const dom = new JSDOM('<div id="root"></div>', { url: 'https://world6.example.test/' })
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = require('react-dom/client'), cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name).exports
  const file = path.resolve('src', name + '.ts'), mod = { exports: {} }; cache.set(name, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(id => id.startsWith('./') ? load(id.slice(2)) : require(id), mod, mod.exports)
  return mod.exports
}
const { OnlineContext } = load('onlineContext'), { useRemote } = load('onlineHooks')
const flush = async (fn = () => {}) => React.act(async () => { await fn(); await new Promise(setImmediate) })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const failure = status => Object.assign(Error('Temporary or denied · ' + status), { status })

async function fixture(t, options = {}) {
  if (!options.realTimers) t.mock.timers.enable({ apis: ['setTimeout'] })
  const tree = createRoot(document.getElementById('root')), calls = [], rendered = []
  let endpoint = options.endpoint || '/lobbies/party/world', account = options.account || 'player-a', events = 0, remote, mounted = true
  const transport = (url, init) => {
    const pending = deferred(); calls.push({ url, options: init, ...pending })
    if (options.load) void options.load(url, init).then(pending.resolve, pending.reject)
    return pending.promise
  }
  let request = transport
  function Probe() {
    const value = useRemote(endpoint)
    React.useLayoutEffect(() => { remote = value; rendered.push({ endpoint, account, ...value }) }, [value])
    return React.createElement('pre', null, JSON.stringify(value))
  }
  function render() { tree.render(React.createElement(OnlineContext.Provider, { value: { user: account ? { id: account } : null, request, events } }, React.createElement(Probe))) }
  const close = async () => { if (mounted) { mounted = false; await flush(() => tree.unmount()) } }
  t.after(async () => { await close(); t.mock.timers.reset() })
  await flush(render)
  return { calls, rendered, get remote() { return remote }, close,
    pulse() { events++; render() },
    notify: async () => flush(() => { events++; render() }),
    change: async patch => flush(() => {
      if ('endpoint' in patch) endpoint = patch.endpoint
      if ('account' in patch) account = patch.account
      if (patch.transport) request = (...args) => transport(...args)
      render()
    }),
    resolve: async (index, value) => flush(() => calls[index].resolve(value)),
    reject: async (index, error) => flush(() => calls[index].reject(error)),
    advance: async ms => flush(() => t.mock.timers.tick(ms)),
  }
}

test('Sync: a burst of party events never aborts the scene load and queues one fresh read', async t => {
  const f = await fixture(t)
  for (let i = 0; i < 20; i++) await f.notify()
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.signal.aborted, false)
  await f.resolve(0, { revision: 1 })
  assert.deepEqual(f.remote.value, { revision: 1 }); assert(f.remote.loading)
  assert.equal(f.calls.length, 2)
  await f.resolve(1, { revision: 21 }); assert.equal(f.remote.loading, false)
  assert.equal(f.remote.value.revision, 21)
})

test('Sync: ongoing updates make progress without parallel requests or stale write access', async t => {
  const f = await fixture(t)
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 5; i++) await f.notify()
    assert.equal(f.calls.length, round + 1)
    await f.resolve(round, { revision: round + 1 })
    assert.equal(f.remote.value.revision, round + 1); assert(f.remote.loading)
    assert.equal(f.calls.length, round + 2)
  }
  await f.resolve(4, { revision: 99 }); assert.equal(f.remote.loading, false)
})

for (const status of [0, 408, 429, 503]) test('Sync: a transient outage retains the scene, blocks writes and retries · ' + status, async t => {
  const f = await fixture(t); await f.resolve(0, { revision: 5, tokens: ['friend'] })
  await f.notify(); await f.reject(1, failure(status))
  assert.deepEqual(f.remote.value, { revision: 5, tokens: ['friend'] })
  assert(f.remote.loading); assert(f.remote.error)
  await f.advance(999); assert.equal(f.calls.length, 2)
  await f.advance(1); assert.equal(f.calls.length, 3)
  await f.resolve(2, { revision: 6, tokens: ['friend', 'npc'] })
  assert.equal(f.remote.value.revision, 6); assert.equal(f.remote.loading, false); assert.equal(f.remote.error, '')
})

test('Sync: an initial outage retries with bounded backoff and stops after success', async t => {
  const f = await fixture(t); await f.reject(0, failure(503))
  assert.equal(f.remote.value, null); assert(f.remote.loading)
  for (const [index, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
    await f.advance(delay - 1); assert.equal(f.calls.length, index + 1)
    await f.advance(1); assert.equal(f.calls.length, index + 2)
    if (index < 6) await f.reject(index + 1, failure(503))
  }
  await f.resolve(7, { revision: 8 }); await f.advance(60000)
  assert.equal(f.calls.length, 8); assert.equal(f.remote.loading, false)
})

test('Sync: a fresh party event can retry an outage without waiting for the timer', async t => {
  const f = await fixture(t); await f.reject(0, failure(503))
  await f.notify(); assert.equal(f.calls.length, 2)
  await f.resolve(1, { revision: 9 }); await f.advance(60000)
  assert.equal(f.calls.length, 2); assert.equal(f.remote.loading, false)
})

for (const status of [400, 401, 403, 404]) test('Sync: a definite refusal discards cached secrets and queued automatic reads · ' + status, async t => {
  const f = await fixture(t); await f.resolve(0, { secret: 'master notes' })
  await f.notify(); await f.notify(); await f.reject(1, failure(status))
  assert.equal(f.remote.value, null); assert(f.remote.error)
  await f.advance(60000); assert.equal(f.calls.length, 2)
})

for (const patch of [{ endpoint: '/lobbies/other/world' }, { account: 'player-b' }, { transport: true }, { account: null }])
test('Sync: a different party, player or API immediately hides and aborts the previous response · ' + JSON.stringify(patch), async t => {
  const f = await fixture(t); await f.resolve(0, { secret: 'old party' }); await f.notify()
  await f.change(patch); assert(f.calls[1].options.signal.aborted); assert.equal(f.remote.value, null)
  await f.resolve(1, { secret: 'late old response' }); assert.equal(f.remote.value, null)
  await f.resolve(2, { current: true }); assert.deepEqual(f.remote.value, { current: true })
})

test('Sync: leaving the game cancels the current read and its queued refresh', async t => {
  const f = await fixture(t); await f.notify(); await f.change({ endpoint: null })
  assert(f.calls[0].options.signal.aborted); assert.equal(f.remote.value, null); assert.equal(f.remote.loading, false)
  await f.resolve(0, { secret: 'old response' }); assert.equal(f.calls.length, 1); assert.equal(f.remote.value, null)
})

test('Sync: returning to the same room checks fresh state before enabling actions', async t => {
  const f = await fixture(t); await f.resolve(0, { revision: 1 }); await f.change({ endpoint: null })
  await f.change({ endpoint: '/lobbies/party/world' })
  assert.equal(f.remote.value, null); assert(f.remote.loading)
  await f.resolve(1, { revision: 2 }); assert.equal(f.remote.loading, false); assert.equal(f.remote.value.revision, 2)
})

test('Sync: unmounting or changing party cancels a retry timer', async t => {
  const f = await fixture(t); await f.reject(0, failure(503)); await f.change({ endpoint: '/lobbies/other/world' })
  await f.advance(60000); assert.equal(f.calls.length, 2)
  await f.reject(1, failure(503)); await f.close(); await f.advance(60000)
  assert.equal(f.calls.length, 2)
})

test('Sync: an authoritative null result is loaded rather than retried forever', async t => {
  const f = await fixture(t); await f.resolve(0, null)
  assert.equal(f.remote.value, null); assert.equal(f.remote.loading, false); assert.equal(f.remote.error, '')
  await f.advance(60000); assert.equal(f.calls.length, 1)
})

test('Sync API: four players can exchange events while a room read is delayed', { timeout: 30000 }, async t => {
  const { fixture: backendFixture, lobbyBody } = await import('../server/test/fixtures.mjs')
  const { io } = await import('socket.io-client'), { once } = require('node:events')
  const cleanups = [], backend = await backendFixture({ after: fn => cleanups.push(fn) })
  let frontend, socket
  t.after(async () => { await frontend?.close(); socket?.close(); for (const cleanup of cleanups) await cleanup() })
  const gm = await backend.register('party-gm'), players = []
  for (let i = 0; i < 4; i++) players.push(await backend.register('player-' + i))
  const room = await backend.api('/lobbies', gm.token, 'POST', lobbyBody, 201), endpoint = '/lobbies/' + room.id
  await backend.api(endpoint + '/join', players[0].token, 'POST')
  const firstRead = deferred(), release = deferred(), observed = deferred()
  let reads = 0, notices = 0
  const f = await fixture(t, { realTimers: true, endpoint, account: players[0].user.id,
    async load(url, init) {
      const response = await fetch(backend.base + '/api' + url, { ...init, headers: { Authorization: 'Bearer ' + players[0].token } })
      const data = await response.json(); if (!response.ok) throw failure(response.status)
      if (++reads === 1) { firstRead.resolve(); await release.promise }
      return data
    } })
  frontend = f
  await flush(() => firstRead.promise)
  socket = io(backend.base, { auth: { token: players[0].token }, transports: ['websocket'], reconnection: false, forceNew: true })
  await once(socket, 'connect', { signal: AbortSignal.timeout(5000) })
  const ack = await new Promise((resolve, reject) => socket.timeout(5000).emit('subscribeLobby', room.id, (error, value) => error ? reject(error) : resolve(value)))
  assert(ack.ok)
  socket.on('lobbyChanged', () => { notices++; f.pulse(); if (notices >= 23) observed.resolve() })
  await flush(async () => {
    for (const player of players.slice(1)) await backend.api(endpoint + '/join', player.token, 'POST')
    await Promise.all(Array.from({ length: 20 }, (_, i) => backend.api(endpoint + '/messages', players[i % 4].token, 'POST', { body: 'Реплика игрока ' + i }, 201)))
    await observed.promise
  })
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.signal.aborted, false)
  await flush(() => release.resolve())
  for (let i = 0; i < 100 && f.remote.loading; i++) await flush(() => new Promise(resolve => setTimeout(resolve, 10)))
  assert.equal(f.remote.loading, false); assert.equal(f.calls.length, 2)
  assert.equal(f.remote.value.myRole, 'PLAYER'); assert.equal(f.remote.value.members.length, 5)
  assert.equal(f.remote.value.inviteCode, undefined)
  assert.equal((await backend.api(endpoint + '/messages', players[0].token)).items.length, 20)
})
