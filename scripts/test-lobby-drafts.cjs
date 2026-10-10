const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<div id="root"></div>', { url: 'https://world6.example.test/' })
global.window = dom.window
global.document = dom.window.document
global.location = dom.window.location
global.localStorage = dom.window.localStorage
global.FormData = dom.window.FormData
global.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = require('react-dom/client')
const { act } = React
const root = path.resolve(__dirname, '..', 'src')
const Wrap = ({ children }) => React.createElement('div', null, children)

// Keep the real panel, editor, CharacterManager, hooks, storage and game modules.
// Replace visual descendants only; these controls invoke the real manager callbacks.
const stubs = {
  NetworkCommon: { CommunityShell: Wrap, RemoteStatus: ({ error }) => React.createElement('p', null, error), formatDate: String },
  RpgControls: { TextField: () => null, NumberField: () => null, Field: Wrap },
  ActionReview: { __esModule: true, default: () => null },
  VisualElements: { Illustration: () => null, ArtworkPicker: () => null },
  CampaignPanel: { __esModule: true, default: () => null },
  CharacterErrorBoundary: { __esModule: true, default: Wrap },
  CharacterImportPanel: { __esModule: true, default: () => null },
  CharacterWorkspace: { __esModule: true, default: ({ draft, onDraftChange }) => React.createElement('div', null,
    React.createElement('input', { 'data-name': true, value: draft.name, onChange: () => {},
      onInput: event => onDraftChange({ ...draft, name: event.currentTarget.value }) }),
    React.createElement('input', { 'data-attribute': true, value: draft.attributes.strength, onChange: () => {},
      onInput: event => onDraftChange({ ...draft, attributes: { ...draft.attributes, strength: event.currentTarget.value } }) })) },
}

function modules() {
  const cache = new Map()
  function load(name) {
    if (stubs[name]) return stubs[name]
    if (cache.has(name)) return cache.get(name).exports
    if (/\.css$/.test(name)) return {}
    const file = ['.tsx', '.ts'].map(ext => path.join(root, name + ext)).find(fs.existsSync)
    assert(file, 'Missing source module: ' + name)
    const mod = { exports: {} }
    cache.set(name, mod)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href))
    vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
      id => id.startsWith('./') ? load(id.slice(2)) : require(id), mod, mod.exports)
    return mod.exports
  }
  return load
}
const load = modules(), Panel = load('LobbiesPanel').default
const { OnlineContext } = load('onlineContext')
const { emptyCampaign } = load('rpgSchema')
const { createDefaultCharacter } = load('characterModel')
const { writeCharacters } = load('characterStorage')
const { serializeLobbyBackup, parseLobbyBackup } = load('lobbyBackup')
const storage = load('lobbyDraftStorage')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function flush(fn = () => {}) { await act(async () => { fn(); await new Promise(r => setTimeout(r, 5)) }) }
async function input(selector, value) {
  const field = document.querySelector(selector)
  assert(field, 'Missing field ' + selector)
  await flush(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(field, value)
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
}
async function click(text) {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(text))
  assert(button, 'Missing button ' + text)
  assert(!button.disabled, 'Disabled button ' + text)
  await flush(() => button.click())
}

async function fixture() {
  const tree = createRoot(document.getElementById('root'))
  const accountId = crypto.randomUUID(), writes = []
  const members = [{ id: accountId, displayName: 'GM' }, { id: 'friend-id', displayName: 'Friend' }]
  const worlds = Object.fromEntries(['a', 'b'].map(id => [id, {
    characters: [{ ...createDefaultCharacter(), id: 'hero-' + id, name: 'Hero ' + id }], campaign: emptyCampaign(), revision: 7,
  }]))
  let mounted = true, role = 'GM', failLobby = false, intercept = null
  const context = { user: { id: accountId }, events: 0, socket: null, refresh: () => {} }
  const request = async (url, options) => {
    if (intercept) {
      const intercepted = intercept(url, options)
      if (intercepted !== undefined) return intercepted
    }
    if (options?.method === 'PUT') { writes.push({ url, ...JSON.parse(options.body) }); return { revision: 8 } }
    if (options?.method === 'POST' && url.endsWith('/restore')) { const body = JSON.parse(options.body); writes.push({ url, ...body }); return { world: body.world, revision: body.revision + 1 } }
    if (url === '/lobbies/mine') return ['a', 'b'].map(id => ({ id, title: 'Room ' + id, role }))
    if (url === '/characters') return []
    if (url === '/lobbies/a' || url === '/lobbies/b') {
      if (failLobby) throw Error('Temporary lobby failure')
      return { id: url.at(-1), title: 'Room ' + url.at(-1), myRole: role, status: 'open', visibility: 'public', members, slots: 4 }
    }
    const match = url.match(/^\/lobbies\/([ab])\/world/)
    if (match) return structuredClone(worlds[match[1]])
    return { items: [], hasMore: false }
  }
  context.request = request
  const render = () => tree.render(React.createElement(OnlineContext.Provider, { value: { ...context } },
    mounted ? React.createElement(Panel, { onAccount: () => {} }) : null))
  await flush(render)
  return { accountId, context, writes, worlds, request, members,
    render: () => flush(render),
    role: async value => { role = value; context.events++; await flush(render) },
    fail: async value => { failLobby = value; context.events++; await flush(render) },
    intercept: value => { intercept = value },
    mount: async value => { mounted = value; await flush(render) },
    open: async id => { await click('Room ' + id); await flush() },
    load: async () => { await click('Открыть кампанию в редакторе'); await flush() },
    close: async () => { await flush(() => tree.unmount()) },
  }
}
const name = () => document.querySelector('[data-name]')?.value

test('A1: unsaved fields survive token refresh, temporary fetch failure and leaving the page', async () => {
  const f = await fixture()
  try {
    await f.open('a'); await f.load(); await input('[data-name]', 'Unsaved hero')
    f.context.request = (...args) => f.request(...args); await f.render(); await flush()
    assert.equal(name(), 'Unsaved hero')
    await f.fail(true); assert.equal(name(), undefined)
    await f.fail(false); assert.equal(name(), 'Unsaved hero')
    await input('[data-name]', ''); await input('[data-attribute]', '-')
    await f.mount(false); await f.mount(true); await f.open('a')
    assert.equal(name(), '')
    assert.equal(document.querySelector('[data-attribute]').value, '-')
    assert.equal(f.writes.length, 0, 'Autosave never publishes to the server')
  } finally { await f.close() }
})

test('A1: each lobby restores its own draft and original base revision', async () => {
  const f = await fixture()
  try {
    await f.open('a'); await f.load(); await input('[data-name]', 'Edited A')
    await f.open('b'); assert.equal(name(), undefined); await f.load(); await input('[data-name]', 'Edited B')
    await f.open('a'); assert.equal(name(), 'Edited A')
    await click('Опубликовать изменения кампании')
    assert.equal(f.writes[0].url, '/lobbies/a/world'); assert.equal(f.writes[0].revision, 7)
    assert.equal(f.writes[0].world.characters[0].name, 'Edited A')
    await f.open('b'); assert.equal(name(), 'Edited B')
  } finally { await f.close() }
})

test('A7: late load is aborted and cannot enter or publish into another lobby', async () => {
  const f = await fixture(), waiting = deferred(); let signal
  try {
    f.intercept((url, options) => { if (url === '/lobbies/a/world') { signal = options.signal; return waiting.promise } })
    await f.open('a'); await f.load(); await f.open('b')
    assert.equal(signal.aborted, true)
    await f.load(); assert.equal(name(), 'Hero b')
    await flush(() => waiting.resolve(f.worlds.a)); assert.equal(name(), 'Hero b')
    await click('Опубликовать изменения кампании')
    assert.equal(f.writes[0].url, '/lobbies/b/world'); assert.equal(f.writes[0].world.characters[0].id, 'hero-b')
    assert.equal(storage.readLobbyDraft(f.accountId, 'a'), null)
  } finally { await f.close() }
})

test('A7: leaving during load ignores the response even if the transport ignores abort', async () => {
  const f = await fixture(), waiting = deferred(); let signal
  try {
    f.intercept((url, options) => { if (url === '/lobbies/a/world') { signal = options.signal; return waiting.promise } })
    await f.open('a'); await f.load(); await f.mount(false)
    assert.equal(signal.aborted, true)
    await flush(() => waiting.resolve(f.worlds.a))
    f.intercept(null); await f.mount(true); await f.open('a')
    assert.equal(name(), undefined); assert.equal(storage.readLobbyDraft(f.accountId, 'a'), null)
  } finally { await f.close() }
})

test('A7: a different account never inherits a previous response or private draft', async () => {
  const f = await fixture(), waiting = deferred(); let signal
  try {
    f.intercept((url, options) => { if (url === '/lobbies/a/world') { signal = options.signal; return waiting.promise } })
    await f.open('a'); await f.load()
    f.context.user = { id: crypto.randomUUID() }; await f.render()
    assert.equal(signal.aborted, true)
    await flush(() => waiting.resolve(f.worlds.a)); assert.equal(name(), undefined)
    f.intercept(null); await f.load(); await input('[data-name]', 'Second account')
    assert.equal(storage.readLobbyDraft(f.accountId, 'a'), null)
    assert.equal(storage.readLobbyDraft(f.context.user.id, 'a').world.characters[0].name, 'Second account')
  } finally { await f.close() }
})

test('confirmed loss of GM access hides the editor, and restored ASSISTANT access restores its draft', async () => {
  const f = await fixture()
  try {
    await f.open('a'); await f.load(); await input('[data-name]', 'Private GM draft')
    await f.role('PLAYER'); assert.equal(name(), undefined)
    assert(!document.body.textContent.includes('Опубликовать изменения кампании'))
    await f.role('ASSISTANT'); assert.equal(name(), 'Private GM draft')
  } finally { await f.close() }
})

test('late publication response updates only its source draft and keeps edits made while publishing', async () => {
  const f = await fixture(), waiting = deferred()
  try {
    await f.open('a'); await f.load(); await input('[data-name]', 'Published A')
    f.intercept((url, options) => options?.method === 'PUT' && url === '/lobbies/a/world' ? waiting.promise : undefined)
    await click('Опубликовать изменения кампании'); await input('[data-name]', 'Later unsaved A')
    await f.open('b'); await f.load(); await input('[data-name]', 'Local B')
    await flush(() => waiting.resolve({ revision: 8 }))
    assert.equal(name(), 'Local B')
    const original = storage.readLobbyDraft(f.accountId, 'a'), other = storage.readLobbyDraft(f.accountId, 'b')
    assert.equal(original.revision, 8); assert.equal(original.world.characters[0].name, 'Later unsaved A')
    assert.equal(other.revision, 7); assert.equal(other.world.characters[0].name, 'Local B')
  } finally { await f.close() }
})

test('publication conflict preserves the draft and does not advance its base revision', async () => {
  const f = await fixture()
  try {
    await f.open('a'); await f.load(); await input('[data-name]', 'Conflicting draft')
    f.intercept((url, options) => options?.method === 'PUT' ? Promise.reject(Error('Конфликт версии')) : undefined)
    await click('Опубликовать изменения кампании')
    assert(document.body.textContent.includes('Конфликт версии'))
    assert.equal(storage.readLobbyDraft(f.accountId, 'a').revision, 7)
    assert.equal(name(), 'Conflicting draft')
  } finally { await f.close() }
})

test('draft survives a fresh module/browser session, including invalid in-progress input', () => {
  const source = modules()('lobbyDraftStorage'), nextSession = modules()('lobbyDraftStorage')
  const hero = { ...createDefaultCharacter(), id: 'persisted-hero', name: '' }
  hero.attributes.strength = '-'
  const draft = { accountId: crypto.randomUUID(), lobbyId: 'a', revision: 7, world: { characters: [hero], campaign: emptyCampaign() } }
  assert.equal(source.writeLobbyDraft(draft), true)
  const restored = nextSession.readLobbyDraft(draft.accountId, draft.lobbyId)
  assert.equal(restored.world.characters[0].name, '')
  assert.equal(restored.world.characters[0].attributes.strength, '-')
  assert.equal(restored.revision, 7)
  assert.equal(nextSession.readLobbyDraft('other-account', draft.lobbyId), null)
  assert.equal(nextSession.readLobbyDraft(draft.accountId, 'other-lobby'), null)
})

test('full browser storage reports the risk and preserves an in-memory draft across navigation', async () => {
  const f = await fixture(), native = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = () => { throw new Error('Quota exceeded') }
  try {
    await f.open('a'); await f.load(); await input('[data-name]', 'Memory fallback')
    assert(document.body.textContent.includes('Не удалось сохранить черновик на устройстве'))
    await f.mount(false); await f.mount(true); await f.open('a')
    assert.equal(name(), 'Memory fallback')
    assert(document.body.textContent.includes('Не удалось сохранить черновик на устройстве'))
  } finally { dom.window.Storage.prototype.setItem = native; await f.close() }
})

test('corrupt or foreign storage content is not used as a lobby draft', () => {
  const fresh = modules()('lobbyDraftStorage')
  assert.equal(fresh.readLobbyDraft('user', 'lobby', () => ({ getItem: () => '{broken' })), null)
  assert.equal(fresh.readLobbyDraft('user', 'lobby', () => ({ getItem: () => JSON.stringify({ version: 1, accountId: 'someone-else', lobbyId: 'lobby' }) })), null)
})

async function backupFile(text) {
  const field = document.querySelector('input[type="file"]')
  assert(field)
  await flush(() => {
    Object.defineProperty(field, 'files', { configurable: true, value: [{ size: Buffer.byteLength(text), text: async () => text }] })
    field.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })
}

test('A4: legacy copy needs explicit owners; restore is bound to the current lobby', async () => {
  const f = await fixture(), confirm = window.confirm
  window.confirm = () => true
  try {
    await f.open('b')
    await backupFile(JSON.stringify({ format: 'world6-campaign-backup', version: 1, ...f.worlds.a }))
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Восстановить мир и владельцев'))
    assert.equal(button.disabled, true)
    assert(document.body.textContent.includes('В прежней копии нет владельцев'))
    await flush(() => {
      const select = document.querySelector('[aria-label="Владелец героя Hero a"]')
      select.value = 'friend-id'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    await click('Восстановить мир и владельцев')
    assert.equal(f.writes[0].url, '/lobbies/b/restore')
    assert.equal(f.writes[0].bindings[0].ownerId, 'friend-id')
    assert.equal(name(), 'Hero a')
  } finally { window.confirm = confirm; await f.close() }
})

test('A4: new backup retains owners; unknown owners cannot be silently reassigned', async () => {
  const f = await fixture()
  try {
    await f.open('a')
    const raw = serializeLobbyBackup(f.worlds.a, [{ characterId: 'hero-a', ownerId: 'missing-friend', approved: false }], [{ id: 'missing-friend', displayName: 'Missing friend' }])
    const parsed = parseLobbyBackup(raw)
    assert.equal(parsed.bindings[0].ownerId, 'missing-friend')
    assert.equal(parsed.bindings[0].approved, false)
    await backupFile(raw)
    assert.equal(document.querySelector('[aria-label="Владелец героя Hero a"]').value, '')
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Восстановить мир и владельцев'))
    assert.equal(button.disabled, true)
    assert.equal(f.writes.length, 0)
  } finally { await f.close() }
})

test('A5: deleting and re-uploading a cloud hero sends creation revision -1', async () => {
  const tree = createRoot(document.getElementById('root')), Cloud = load('CloudLibraryPanel').default
  const id = crypto.randomUUID(), accountId = crypto.randomUUID(), hero = { ...createDefaultCharacter(), id, name: 'Cloud hero' }
  writeCharacters(window.localStorage, [hero], emptyCampaign())
  window.localStorage.setItem('world6.cloud-versions.' + accountId, JSON.stringify({ [id]: 3 }))
  let exists = true, writtenRevision, context = { user: { id: accountId }, events: 0 }
  const render = () => tree.render(React.createElement(OnlineContext.Provider, { value: { ...context } }, React.createElement(Cloud, { onImported: () => {} })))
  context.refresh = () => { context.events++; render() }
  context.request = async (url, options) => {
    if (options?.method === 'DELETE') { exists = false; return { ok: true } }
    if (options?.method === 'PUT') { writtenRevision = JSON.parse(options.body).revision; return { revision: 0 } }
    return exists ? [{ id, name: hero.name, revision: 3 }] : []
  }
  const confirm = window.confirm; window.confirm = () => true
  try {
    await flush(render); await click('Удалить из аккаунта'); await flush()
    assert.equal(JSON.parse(window.localStorage.getItem('world6.cloud-versions.' + accountId))[id], undefined)
    await click('Сохранить локальных героев в аккаунт')
    assert.equal(writtenRevision, -1)
  } finally { window.confirm = confirm; await flush(() => tree.unmount()) }
})

test('A4: remote campaign cannot use the legacy blind restore path', async () => {
  const old = stubs.CampaignPanel; delete stubs.CampaignPanel
  const Campaign = modules()('CampaignPanel').default, tree = createRoot(document.getElementById('root'))
  stubs.CampaignPanel = old
  const props = { world: { characters: [], campaign: emptyCampaign() }, onPlan: () => {}, onRestore: () => ({ ok: true }), onExamples: () => ({ ok: true }) }
  try {
    await flush(() => tree.render(React.createElement(Campaign, { ...props, remote: true })))
    assert.equal(document.querySelector('input[type="file"]'), null)
    assert(document.body.textContent.includes('восстановление владельцев'))
    await flush(() => tree.render(React.createElement(Campaign, { ...props, remote: false })))
    assert(document.querySelector('input[type="file"]'), 'Offline campaign restore remains available')
  } finally { await flush(() => tree.unmount()) }
})

test('A7: delayed backup file read is ignored after switching to another lobby', async () => {
  const f = await fixture(), waiting = deferred()
  try {
    await f.open('a')
    await flush(() => {
      const field = document.querySelector('input[type="file"]')
      Object.defineProperty(field, 'files', { configurable: true, value: [{ size: 10, text: () => waiting.promise }] })
      field.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    await f.open('b')
    await flush(() => waiting.resolve(JSON.stringify({ format: 'world6-campaign-backup', version: 1, ...f.worlds.a })))
    assert.equal(document.querySelector('[aria-label="Владелец героя Hero a"]'), null)
    assert.equal(f.writes.length, 0)
  } finally { await f.close() }
})


test('Сцены: расстановка сохраняется отдельно по лобби и не теряет незавершённый лист', async () => {
 const f=await fixture()
 try {
  await f.open('a');await f.load();await input('[data-name]','');await input('[data-attribute]','-')
  await input('[name="sceneName"]','Площадь');await click('Создать сцену');await click('Стена');await click('Разместить в центре')
  const draft=storage.readLobbyDraft(f.accountId,'a')
  assert.equal(draft.world.characters[0].name,'');assert.equal(draft.world.characters[0].attributes.strength,'-')
  assert.equal(draft.world.campaign.scenes.scenes[0].objects.length,1)
  assert.equal(draft.world.campaign.scenes.scenes[0].objects[0].x,15)
  assert.equal(f.writes.length,0,'Scene autosave must not publish')
  await f.open('b');await f.load();assert.equal(document.querySelector('.gb-scene-viewport'),null)
  await f.open('a');assert(document.body.textContent.includes('Площадь'));assert(document.querySelector('.gb-scene-viewport'))
  await f.mount(false);await f.mount(true);await f.open('a')
  assert.equal(storage.readLobbyDraft(f.accountId,'a').world.campaign.scenes.scenes[0].objects.length,1)
 } finally {await f.close()}
})
test('Сцены: полёт и боковой вид сохраняют координаты, ресурсы и время',async()=>{
 const f=await fixture()
 try {
  await f.open('a');await f.load();await input('[name="sceneName"]','Высота');await click('Создать сцену')
  await flush(()=>{const el=document.querySelector('[aria-label="Персонаж для размещения"]');el.value='hero-a';el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await click('Поставить персонажа');await click('Разместить в центре')
  await input('[name="z"]','12.5')
  document.querySelector('[name="support"]').value='air'
  await click('Сохранить положение')
  let draft=storage.readLobbyDraft(f.accountId,'a'),position=structuredClone(draft.world.campaign.scenes.scenes[0].tokens[0])
  assert.equal(position.z,12.5);assert.equal(position.support.kind,'air')
  document.querySelector('[name="view"]').value='side'
  await click('Сохранить параметры сцены')
  draft=storage.readLobbyDraft(f.accountId,'a')
  assert.equal(draft.world.campaign.scenes.scenes[0].view,'side');assert.deepEqual(draft.world.campaign.scenes.scenes[0].tokens[0],position)
  assert.equal(draft.world.campaign.seconds,0);assert.deepEqual(draft.world.characters[0].resources,f.worlds.a.characters[0].resources)
  await click('Опубликовать изменения кампании');assert.equal(f.writes[0].world.campaign.scenes.scenes[0].tokens[0].z,12.5)
  await f.role('PLAYER');assert.equal(document.querySelector('[aria-label="Конструктор сцен мастера"]'),null)
 }finally{await f.close()}
})


test('Сцены: клик не привязывается к сетке; удаление опоры не назначает падение',async()=>{
 const f=await fixture()
 try{
  await f.open('a');await f.load();await input('[name="sceneName"]','Опора');await click('Создать сцену');await click('Платформа')
  const svg=document.querySelector('.gb-scene-viewport > svg')
  svg.getScreenCTM=()=>({inverse:()=>({})})
  svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}})
  await flush(()=>svg.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:4.125,clientY:7.75})))
  let scene=storage.readLobbyDraft(f.accountId,'a').world.campaign.scenes.scenes[0],platform=scene.objects[0]
  assert.equal(platform.x,4.125);assert.equal(platform.y,7.75)
  await flush(()=>{const el=document.querySelector('[aria-label="Персонаж для размещения"]');el.value='hero-a';el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await click('Поставить персонажа')
  await flush(()=>svg.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:4.125,clientY:7.75})))
  document.querySelector('[name="support"]').value='object:'+platform.id
  await click('Сохранить положение')
  scene=storage.readLobbyDraft(f.accountId,'a').world.campaign.scenes.scenes[0]
  assert.equal(scene.tokens[0].support.objectId,platform.id);assert.equal(scene.tokens[0].z,1)
  await flush(()=>[...document.querySelectorAll('.gb-scene-sidebar button')].find(b=>b.textContent.includes('Платформа')).click())
  await input('[name="x"]','8.25');await input('[name="height"]','3.5');await click('Сохранить параметры объекта')
  scene=storage.readLobbyDraft(f.accountId,'a').world.campaign.scenes.scenes[0]
  assert.equal(scene.tokens[0].x,8.25);assert.equal(scene.tokens[0].z,3.5)
  await click('Убрать объект')
  const after=storage.readLobbyDraft(f.accountId,'a').world.campaign.scenes.scenes[0]
  assert.deepEqual(after,scene);assert(document.body.textContent.includes('стоит персонаж'))
 }finally{await f.close()}
})

test.after(() => dom.window.close())
