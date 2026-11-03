const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<div id="root"></div>', { url: 'https://world6.example.test/' })
Object.assign(global, { window: dom.window, document: dom.window.document,
  sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = require('react-dom/client')
const flush = async (fn = () => {}) => React.act(async () => { await fn(); await new Promise(setImmediate) })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const profile = (id = 'player-a', extra = {}) => ({ id, displayName: id, role: 'PLAYER', disabled: false, ...extra })
const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sessionKey = 'world6.local-session.same-origin'

async function fixture(t, options = {}) {
  if (!options.realTimers) t.mock.timers.enable({ apis: ['setTimeout'] })
  sessionStorage.clear()
  if (options.token !== '') sessionStorage.setItem(sessionKey, options.token || 'saved-token')
  const calls = [], sockets = [], cache = new Map()
  let context, intercept = options.intercept, authListener
  const sdk = { auth: {
    onAuthStateChange(fn) { authListener = fn; queueMicrotask(() => fn('INITIAL_SESSION', options.session || null)); return { data: { subscription: { unsubscribe() { authListener = null } } } } },
    async getSession() { return { data: { session: options.session || null }, error: null } },
    async signOut() { authListener?.('SIGNED_OUT', null); return { error: null } },
  }, async removeAllChannels() {} }
  class Socket extends EventEmitter {
    connected = false; active = true; attempts = 0
    connect() { this.active = true; this.attempts++; return this }
    disconnect() { this.active = false; this.connected = false; this.emit('disconnect', 'io client disconnect'); return this }
  }
  const nativeFetch = global.fetch
  global.fetch = async (url, init = {}) => {
    const call = { path: String(url).replace(/^.*\/api/, ''), ...init }; calls.push(call)
    if (intercept) { const value = intercept(call); if (value !== undefined) return value }
    if (call.path === '/config') return response(200, { authMode: options.supabase ? 'supabase' : 'local', supabaseUrl: 'https://auth.example.test', publishableKey: 'public-test-key' })
    if (call.path === '/me') return response(200, profile())
    if (call.path === '/auth/login') return response(200, { token: 'new-token' })
    if (call.path === '/auth/logout') return response(200, { ok: true })
    throw Error('Unexpected endpoint ' + call.path)
  }
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports
    const file = ['.tsx', '.ts'].map(ext => path.resolve('src', name + ext)).find(fs.existsSync)
    assert(file, name)
    const mod = { exports: {} }; cache.set(name, mod)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
    }).outputText.replaceAll('import.meta.env', JSON.stringify({ BASE_URL: '/' }))
    vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(id => {
      if (id.startsWith('./')) return load(id.slice(2))
      if (id === '@supabase/supabase-js') return { createClient: () => sdk }
      if (id === 'socket.io-client') return { io: (_url, settings) => { const socket = options.connect ? options.connect(settings) : new Socket(); socket.token = settings.auth.token; sockets.push(socket); return socket } }
      return require(id)
    }, mod, mod.exports)
    return mod.exports
  }
  const Provider = load('OnlineProvider').default, { useOnline } = load('onlineContext')
  function Probe() { context = useOnline(); return React.createElement('p', null, context.user?.id || 'guest') }
  const root = createRoot(document.getElementById('root'))
  let mounted = true
  const unmount = async () => { if (mounted) { mounted = false; await flush(() => root.unmount()) } }
  t.after(async () => { await unmount(); global.fetch = nativeFetch; sessionStorage.clear(); t.mock.timers.reset() })
  await flush(() => root.render(React.createElement(Provider, null, React.createElement(Probe))))
  return { get online() { return context }, calls, sockets, unmount, intercept(fn) { intercept = fn },
    auth(event, session) { assert(authListener); authListener(event, session) },
    async advance(ms) { await flush(() => t.mock.timers.tick(ms)) } }
}

for (const status of [0, 503, 429]) test('Вход: временный отказ сохраняет сессию и автоматически восстанавливает игрока · ' + status, async t => {
  let attempts = 0
  const f = await fixture(t, { intercept(call) {
    if (call.path !== '/me' || attempts++ > 0) return
    if (!status) throw TypeError('Temporary network outage')
    return response(status, { message: 'Сервер временно недоступен' })
  } })
  assert.equal(sessionStorage.getItem(sessionKey), 'saved-token')
  assert.equal(f.online.user, null)
  assert.match(f.online.error, /[Вв]осстан|[Пп]овтор/)
  await f.advance(1000)
  assert.equal(f.online.user.id, 'player-a')
  assert.equal(f.online.error, '')
  assert.equal(attempts, 2)
})

test('Вход: повторные отказы увеличивают задержку и прекращаются после успеха', async t => {
  let attempts = 0
  const f = await fixture(t, { intercept: call => call.path === '/me' && ++attempts < 3 ? response(503, { message: 'Сервер запускается' }) : undefined })
  await f.advance(1000); assert.equal(attempts, 2)
  await f.advance(1999); assert.equal(attempts, 2)
  await f.advance(1); assert.equal(f.online.user.id, 'player-a')
  await f.advance(60000); assert.equal(attempts, 3)
})

for (const status of [401, 403]) test('Вход: подтверждённый отказ удаляет локальную сессию без повторов · ' + status, async t => {
  const f = await fixture(t, { intercept: call => call.path === '/me' ? response(status, { message: 'Сессия отозвана' }) : undefined })
  assert.equal(f.online.user, null); assert.equal(sessionStorage.getItem(sessionKey), null)
  const count = f.calls.filter(c => c.path === '/me').length
  await f.advance(60000); assert.equal(f.calls.filter(c => c.path === '/me').length, count)
  assert(f.sockets.filter(s => s.token === 'saved-token').every(s => !s.active))
})

test('Вход: ошибка формата не удаляет ключ и не создаёт бесконечные повторы', async t => {
  const f = await fixture(t, { intercept: call => call.path === '/me' ? new Response('<html>Unavailable</html>', { status: 200 }) : undefined })
  assert.equal(sessionStorage.getItem(sessionKey), 'saved-token')
  const count = f.calls.length
  await f.advance(60000); assert.equal(f.calls.length, count)
  assert.match(f.online.error, /не похож на API/)
})

test('Вход: выход отменяет ожидающий запрос, поздний успех не возвращает игрока', async t => {
  const pending = deferred()
  const f = await fixture(t, { intercept: call => call.path === '/me' ? pending.promise : undefined })
  const check = f.calls.find(c => c.path === '/me')
  await flush(() => f.online.logout()); assert(check.signal.aborted)
  await flush(() => pending.resolve(response(200, profile())))
  assert.equal(f.online.user, null); assert.equal(sessionStorage.getItem(sessionKey), null)
  await f.advance(60000); assert.equal(f.calls.filter(c => c.path === '/me').length, 1)
})

test('Вход: размонтирование отменяет проверку и таймер восстановления', async t => {
  const f = await fixture(t, { intercept: call => call.path === '/me' ? response(503, { message: 'Недоступно' }) : undefined })
  const count = f.calls.length; await f.unmount(); await f.advance(60000)
  assert.equal(f.calls.length, count); assert(f.sockets.every(s => !s.active))
})

test('Профиль: параллельные обновления используют одну проверку и сохраняют игрока при временном отказе', async t => {
  const f = await fixture(t), pending = deferred()
  f.intercept(call => call.path === '/me' ? pending.promise : undefined)
  let first, second
  await flush(() => { first = f.online.reloadUser(); second = f.online.reloadUser(); void first.catch(() => {}); void second.catch(() => {}) })
  assert.equal(f.calls.filter(c => c.path === '/me').length, 2)
  await flush(() => pending.resolve(response(503, { message: 'Перерыв связи' })))
  await Promise.allSettled([first, second]); assert.equal(f.online.user.id, 'player-a')
  f.intercept(() => undefined); await f.advance(1000)
  assert.equal(f.online.error, ''); assert.equal(f.online.user.id, 'player-a')
})

test('Refresh: событие изменения аккаунта во время запроса требует свежий профиль после него', async t => {
  const f = await fixture(t), pending = deferred()
  let checks = 0, first
  f.intercept(call => call.path === '/me' ? ++checks === 1 ? pending.promise : response(200, profile('player-a', { displayName: 'Новое имя' })) : undefined)
  await flush(() => { first = f.online.reloadUser(); void first.catch(() => {}) })
  const socket = f.sockets.find(s => s.token === 'saved-token')
  await flush(() => { socket.emit('accountChanged'); socket.emit('accountChanged') })
  assert.equal(checks, 1, 'The new verification waits for the current request')
  await flush(() => pending.resolve(response(200, profile('player-a', { displayName: 'Старое имя' }))))
  await first
  assert.equal(checks, 2, 'Several notifications coalesce into one fresh verification')
  assert.equal(f.online.user.displayName, 'Новое имя')
})

test('Refresh: выход отменяет и текущую проверку, и ожидавшее обновление профиля', async t => {
  const f = await fixture(t), pending = deferred()
  f.intercept(call => call.path === '/me' ? pending.promise : undefined)
  let first, second
  await flush(() => { first = f.online.reloadUser(); void first.catch(() => {}) })
  await flush(() => { second = f.online.reloadUser(); void second.catch(() => {}) })
  const count = f.calls.filter(c => c.path === '/me').length
  await flush(() => f.online.logout())
  await flush(() => pending.resolve(response(200, profile())))
  await Promise.allSettled([first, second])
  assert.equal(f.online.user, null); assert.equal(f.calls.filter(c => c.path === '/me').length, count)
})

for (const status of [200, 401, 503]) test('Профиль: старый ответ после смены игрока игнорируется · ' + status, async t => {
  const f = await fixture(t), pending = deferred()
  f.intercept(call => call.path === '/me' ? call.headers.Authorization === 'Bearer saved-token' ? pending.promise : response(200, profile('player-b')) : undefined)
  const oldSocket = f.sockets.find(s => s.token === 'saved-token')
  await flush(() => oldSocket.emit('accountChanged'))
  const check = f.calls.filter(c => c.path === '/me').at(-1)
  await flush(() => f.online.login('b@example.test', 'test-password'))
  assert(check.signal.aborted)
  assert.equal(f.online.user.id, 'player-b')
  await flush(() => pending.resolve(response(status, status === 200 ? profile('player-a') : { message: 'Старый ответ' })))
  assert.equal(f.online.user.id, 'player-b'); assert.equal(f.online.error, '')
  assert.equal(sessionStorage.getItem(sessionKey), 'new-token')
})

test('Профиль: позднее обновление после выхода не восстанавливает аккаунт', async t => {
  const f = await fixture(t), pending = deferred()
  f.intercept(call => call.path === '/me' ? pending.promise : undefined)
  let reload
  await flush(() => { reload = f.online.reloadUser(); void reload.catch(() => {}) })
  await flush(() => f.online.logout())
  await flush(() => pending.resolve(response(200, profile())))
  await Promise.allSettled([reload]); assert.equal(f.online.user, null)
})

test('Выход: ожидание ответа сервера сразу закрывает профиль и отменяет повтор входа', async t => {
  const f = await fixture(t), pending = deferred()
  f.intercept(call => call.path === '/auth/logout' ? pending.promise : call.path === '/me' ? response(503, { message: 'Краткий отказ' }) : undefined)
  await flush(() => f.online.reloadUser().catch(() => {}))
  let logout
  await flush(() => { logout = f.online.logout(); void logout.catch(() => {}) })
  assert.equal(f.online.user, null); assert.equal(sessionStorage.getItem(sessionKey), null)
  const count = f.calls.filter(c => c.path === '/me').length
  await f.advance(60000); assert.equal(f.calls.filter(c => c.path === '/me').length, count)
  await flush(() => pending.resolve(response(503, { message: 'Сервер недоступен' })))
  assert.equal((await Promise.allSettled([logout]))[0].status, 'rejected')
  assert.equal(f.online.user, null)
})

test('Supabase: обновление токена сохраняет подтверждённого игрока и отменяет прежнюю проверку', async t => {
  const f = await fixture(t, { supabase: true, session: { access_token: 'first-token', user: { id: 'player-a' } } })
  assert.equal(f.online.user.id, 'player-a')
  const pending = deferred()
  f.intercept(call => call.path === '/me' ? pending.promise : undefined)
  let reload
  await flush(() => { reload = f.online.reloadUser(); void reload.catch(() => {}) })
  const check = f.calls.filter(c => c.path === '/me').at(-1)
  await flush(() => f.auth('TOKEN_REFRESHED', { access_token: 'fresh-token', user: { id: 'player-a' } }))
  assert(check.signal.aborted); assert.equal(f.online.user.id, 'player-a')
  await flush(() => pending.resolve(response(200, profile())))
  await Promise.allSettled([reload]); assert.equal(f.online.user.id, 'player-a')
  assert.equal(f.calls.filter(c => c.path === '/me').at(-1).headers.Authorization, 'Bearer fresh-token')
})

test('Supabase: смена аккаунта скрывает прежний профиль до проверки нового', async t => {
  const f = await fixture(t, { supabase: true, session: { access_token: 'first-token', user: { id: 'player-a' } } })
  const pending = deferred(); f.intercept(call => call.path === '/me' ? pending.promise : undefined)
  await flush(() => f.auth('SIGNED_IN', { access_token: 'other-token', user: { id: 'player-b' } }))
  assert.equal(f.online.user, null); assert(f.online.loading)
  await flush(() => pending.resolve(response(200, profile('player-b', { mfaRequired: true }))))
  assert.equal(f.online.user.id, 'player-b'); assert(f.online.user.mfaRequired)
  assert.match(f.online.error, /второй фактор/)
})

test('Связь: восстановление сокета и профиля разделяют ожидающий HTTP-запрос', async t => {
  const pending = deferred(), f = await fixture(t, { intercept: call => call.path === '/me' ? pending.promise : undefined })
  const socket = f.sockets.find(s => s.token === 'saved-token')
  await flush(() => socket.emit('disconnect', 'io server disconnect'))
  await f.advance(1000)
  assert.equal(f.calls.filter(c => c.path === '/me').length, 1)
  await flush(() => pending.resolve(response(200, profile())))
  assert.equal(socket.attempts, 1); assert.equal(f.online.user.id, 'player-a')
})

test('Связь: обязательный второй фактор останавливает переподключение до нового токена', async t => {
  let mfa = true
  const f = await fixture(t, { supabase: true, session: { access_token: 'first-token', user: { id: 'player-a' } },
    intercept: call => call.path === '/me' ? response(200, profile('player-a', { mfaRequired: mfa })) : undefined })
  const socket = f.sockets.find(s => s.token === 'first-token')
  await flush(() => socket.emit('disconnect', 'io server disconnect')); await f.advance(1000)
  assert.equal(socket.active, false); assert.equal(socket.attempts, 0)
  mfa = false
  await flush(() => f.auth('TOKEN_REFRESHED', { access_token: 'verified-token', user: { id: 'player-a' } }))
  assert.equal(f.online.user.mfaRequired, false); assert.equal(f.online.error, '')
  assert(f.sockets.find(s => s.token === 'verified-token').active)
})

test('API: восстановление партии после временного отказа без повторного пароля', { timeout: 20000 }, async t => {
  const { fixture: backendFixture, lobbyBody } = await import('../server/test/fixtures.mjs')
  const { io } = await import('socket.io-client')
  const cleanups = [], backend = await backendFixture({ after: fn => cleanups.push(fn) })
  let frontend
  t.after(async () => { await frontend?.unmount(); for (const cleanup of cleanups) await cleanup() })
  const owner = await backend.register('owner'), friend = await backend.register('friend')
  const lobby = await backend.api('/lobbies', owner.token, 'POST', lobbyBody, 201)
  await backend.api('/lobbies/' + lobby.id + '/join', friend.token, 'POST')
  const nativeFetch = global.fetch
  let unavailable = true
  const f = await fixture(t, { realTimers: true, token: friend.token,
    connect: settings => io(backend.base, settings),
    intercept(call) {
      if (call.path === '/me' && unavailable) return response(503, { message: 'Краткий отказ сервера' })
      const { path, ...init } = call
      return nativeFetch(backend.base + '/api' + path, init)
    } })
  frontend = f
  assert.equal(sessionStorage.getItem(sessionKey), friend.token); assert.equal(f.online.user, null)
  unavailable = false
  for (let step = 0; step < 250 && (!f.online.user || !f.online.connected); step++)
    await flush(() => new Promise(resolve => setTimeout(resolve, 10)))
  assert.equal(f.online.user.id, friend.user.id); assert(f.online.connected)
  const room = await f.online.request('/lobbies/' + lobby.id)
  assert.equal(room.myRole, 'PLAYER')
  const socket = f.sockets.find(s => s.token === friend.token)
  const subscribed = await new Promise(resolve => socket.emit('subscribeLobby', lobby.id, resolve))
  assert.equal(subscribed.ok, true)
  const notice = new Promise(resolve => socket.once('lobbyChanged', resolve))
  await flush(async () => {
    await backend.api('/lobbies/' + lobby.id + '/messages', owner.token, 'POST', { body: 'Партия снова вместе' }, 201)
    assert.equal((await notice).id, lobby.id)
  })
  await flush(() => f.online.logout())
  assert.equal(f.online.user, null); assert.equal(sessionStorage.getItem(sessionKey), null)
  assert.equal((await backend.request('/me', friend.token)).status, 401)
})
