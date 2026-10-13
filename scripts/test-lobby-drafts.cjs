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

function modules(env = { BASE_URL: '/', DEV: true }, realControls = false) {
  const cache = new Map()
  function load(name) {
    name = name.replace(/\.tsx?$/, '')
    if (stubs[name] && !(realControls && name === 'RpgControls')) return stubs[name]
    if (cache.has(name)) return cache.get(name).exports
    if (/\.css$/.test(name)) return {}
    const file = ['.tsx', '.ts'].map(ext => path.join(root, name + ext)).find(fs.existsSync)
    assert(file, 'Missing source module: ' + name)
    const mod = { exports: {} }
    cache.set(name, mod)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href)).replaceAll('import.meta.env', JSON.stringify(env))
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
const { lobbyPermissions } = load('lobbyAccess')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function flush(fn = () => {}) { await act(async () => { fn(); await new Promise(r => setTimeout(r, 5)) }) }
async function input(selector, value) {
  const field = document.querySelector(selector)
  assert(field, 'Missing field ' + selector)
  await flush(() => {
    const prototype = field.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value)
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    field.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
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
  const accountId = crypto.randomUUID(), writes = [], previews = [], executions = [], applications = [], roundPreviews = new Map(), receipts = new Map(), cloud = [], perceptions = {}
  const members = [{ id: accountId, displayName: 'GM', lobbyRole: 'GM', permissions: [...lobbyPermissions] }, { id: 'friend-id', displayName: 'Friend', lobbyRole: 'ASSISTANT', permissions: [] }]
  const declarations = Object.fromEntries(['a','b'].map(id => [id, {collection:null,participating:false,canSubmit:false,entry:null,options:null,readiness:[],controlStamp:'0'}]))
  const worlds = Object.fromEntries(['a', 'b'].map(id => [id, {
    characters: [{ ...createDefaultCharacter(), id: 'hero-' + id, name: 'Hero ' + id }], campaign: emptyCampaign(), revision: 7,
  }]))
  let mounted = true, role = 'GM', permissions = [...lobbyPermissions], failLobby = false, intercept = null
  const context = { user: { id: accountId }, events: 0, socket: null, refresh: () => {} }
  const request = async (url, options) => {
    if (intercept) {
      const intercepted = intercept(url, options)
      if (intercepted !== undefined) return intercepted
    }
    if(url.endsWith('/rounds/replay/options'))return null
    if (options?.method === 'POST' && url.endsWith('/rounds/calculate')) {
      const body=JSON.parse(options.body), w=worlds[url.split('/')[2]], id=crypto.randomUUID()
      executions.push({url,...body})
      const result=load('roundExecution').calculateRound(w,w.campaign.declarations.active,body.input,id)
      roundPreviews.set(id,{world:result.world,summary:result.summary,source:w.revision})
      return {id,revision:w.revision,generation:1,collectionId:body.collectionId,epoch:body.epoch,summary:result.summary}
    }
    if (options?.method === 'POST' && url.endsWith('/rounds/apply')) {
      const body=JSON.parse(options.body), lobby=url.split('/')[2], w=worlds[lobby]
      applications.push({url,...body})
      if(receipts.has(body.commandKey)) return {receipt:receipts.get(body.commandKey),duplicate:true}
      const p=roundPreviews.get(body.previewId)
      assert(p && p.source===w.revision,'Applying stale preview in UI fixture')
      const receipt={id:crypto.randomUUID(),previewId:body.previewId,collectionId:p.world.campaign.declarations.active.id,revision:w.revision+1,generation:1,appliedAt:'2026-10-11T00:00:00Z',summary:p.summary}
      worlds[lobby]={...p.world,revision:w.revision+1,executed:true}; receipts.set(body.commandKey,receipt)
      return {receipt,duplicate:false}
    }
    if (options?.method === 'POST' && url.endsWith('/declarations/preview')) {
      const body=JSON.parse(options.body), w=worlds[url.split('/')[2]]
      previews.push({url,...body})
      return {revision:w.revision,timeline:load('roundTimeline').previewRoundTimeline(w.campaign.declarations.active,body.timings)}
    }
    if (options?.method === 'PUT' && url.endsWith('/declarations')) { const body=JSON.parse(options.body); writes.push({url,...body}); return {entryVersion:body.baseVersion+1} }
    if (['POST','PATCH'].includes(options?.method) && /declarations(?:\/return)?$/.test(url)) { writes.push({url,...JSON.parse(options.body)}); return {ok:true} }
    if (options?.method === 'PUT') { writes.push({ url, ...JSON.parse(options.body) }); return { revision: 8 } }
    if (options?.method === 'POST' && url.endsWith('/restore')) { const body = JSON.parse(options.body); writes.push({ url, ...body }); return { world: body.world, revision: body.revision + 1 } }
    if (url === '/lobbies/mine') return ['a', 'b'].map(id => ({ id, title: 'Room ' + id, role }))
    if (url === '/characters') return cloud
    if (url === '/lobbies/a' || url === '/lobbies/b') {
      if (failLobby) throw Error('Temporary lobby failure')
      return { id: url.at(-1), title: 'Room ' + url.at(-1), myRole: role, myPermissions: permissions, revision: worlds[url.at(-1)].revision, rank:'mortal',energy:'any', creationConditions:load('heroReview').defaultCreationConditions(), status: 'open', visibility: 'public', members, slots: 4 }
    }
    const submissionMatch=url.match(/^\/lobbies\/([ab])\/characters\/hero-[ab]\/submission$/)
    if(submissionMatch){const world=worlds[submissionMatch[1]];return {revision:world.revision,sourceId:cloud[0]?.id,review:world.characters[0].review??{status:'pending',locked:false},sheet:structuredClone(world.characters[0]),changedSinceSubmission:false,conditionErrors:[],canResubmit:world.characters[0].ownerId===context.user.id}}
    const declarationMatch=url.match(/^\/lobbies\/([ab])\/characters\/hero-[ab]\/declarations$/)
    if(declarationMatch) return structuredClone(declarations[declarationMatch[1]])
    const masterMatch=url.match(/^\/lobbies\/([ab])\/declarations$/)
    if(masterMatch) { const w=worlds[masterMatch[1]]; return {revision:w.revision,executed:!!w.executed,roundWork:structuredClone(w.campaign.roundWork??{version:1,entries:[]}),movementBodies:(w.campaign.scenes?.scenes??[]).flatMap(s=>s.tokens.map(t=>({sceneId:s.id,actorId:t.actorId,diameter:t.diameter}))),declarations:structuredClone(w.campaign.declarations??{version:1,active:null,archive:[]}),scenes:(w.campaign.scenes?.scenes??[]).map(s=>({id:s.id,name:s.name,objects:s.objects.map(o=>({id:o.id,name:o.name}))})),actors:w.characters.map(c=>({id:c.id,name:c.name,approved:true,regions:load('characterBody').bodyRegionDefs(c.body).map(r=>({key:r.key,label:r.label})),casts:c.rpg.casts.filter(x=>['preparing','ready'].includes(x.status)).map(x=>({id:x.id,abilityId:x.ability.id,name:x.ability.name,status:x.status,binding:x.roundPreparation?.binding??'bound',roundPreparation:!!x.roundPreparation,chargePolicy:x.ability.chargePolicy,spatial:x.ability.spatial})),items:c.rpg.inventory.map(i=>({id:i.id,name:i.name,quantity:i.quantity,consumable:i.consumable})),abilities:c.rpg.abilities.map(b=>({id:b.id,name:b.name,spatial:b.spatial}))}))} }
    const perceptionMatch=url.match(/^\/lobbies\/([ab])\/characters\/hero-[ab]\/perception$/)
    if(perceptionMatch){const world=worlds[perceptionMatch[1]];return {revision:world.revision,hero:world.characters[0],map:perceptions[perceptionMatch[1]]??null,knowledge:{journal:[],knownEffects:[]},inventory:[],canWriteNotes:world.characters[0].ownerId===context.user.id}}
    const disclosureMatch=url.match(/^\/lobbies\/([ab])\/characters\/hero-[ab]\/disclosure$/)
    if(disclosureMatch){const world=worlds[disclosureMatch[1]];return {revision:world.revision,draft:{activeSceneId:null,scenes:[]},scenes:world.campaign.scenes??load('scenes').emptyScenes(),actors:world.characters.map(c=>({id:c.id,name:c.name})),preview:perceptions[disclosureMatch[1]]??null}}
    const sceneMatch = url.match(/^\/lobbies\/([ab])\/scenes$/)
    if(sceneMatch)return {revision:worlds[sceneMatch[1]].revision,scenes:worlds[sceneMatch[1]].campaign.scenes??{version:1,activeSceneId:null,scenes:[]},actors:worlds[sceneMatch[1]].characters.map(c=>({id:c.id,name:c.name,profile:{portrait:c.profile.portrait}}))}
    const match = url.match(/^\/lobbies\/([ab])\/world/)
    if (match) return structuredClone(worlds[match[1]])
    return { items: [], hasMore: false }
  }
  context.request = request
  const render = () => tree.render(React.createElement(OnlineContext.Provider, { value: { ...context } },
    mounted ? React.createElement(Panel, { onAccount: () => {} }) : null))
  await flush(render)
  return { accountId, context, writes, previews, executions, applications, worlds, request, members, cloud, perceptions, declarations,
    render: () => flush(render), notify:()=>{context.events++;render()},
    role: async value => { role = value; context.events++; await flush(render) },
    permissions: async value => { permissions = value; context.events++; await flush(render) },
    fail: async value => { failLobby = value; context.events++; await flush(render) },
    intercept: value => { intercept = value },
    mount: async value => { mounted = value; await flush(render) },
    open: async id => { await click('Room ' + id); await flush() },
    load: async () => { await click('Открыть кампанию в редакторе'); await flush() },
    close: async () => { await flush(() => tree.unmount()) },
  }
}
const name = () => document.querySelector('[data-name]')?.value

test('P22: адрес сайта необязателен, поддерживает старый подпуть и новый origin', () => {
  const { readSitePresentation } = load('sitePresentation')
  assert.deepEqual(readSitePresentation({}), { siteUrl: '' })
  assert.equal(readSitePresentation({ VITE_SITE_URL: 'https://legendary6264.github.io/world6-rpg', VITE_API_URL: 'https://world6-api.onrender.com/' }).siteUrl, 'https://legendary6264.github.io/world6-rpg/')
  assert.equal(readSitePresentation({ VITE_SITE_URL: ' https://example.test/ ', VITE_API_URL: 'https://api.example.test' }).siteUrl, 'https://example.test/')
  assert.equal(readSitePresentation({ VITE_SITE_URL: 'http://localhost:5173/' }).siteUrl, 'http://localhost:5173/')
})

test('P22: адрес API после проверки используется без внешних пробелов и завершающего слеша', () => {
  const env = { BASE_URL: '/', DEV: true, VITE_API_URL: ' https://api.example.test/ ' }
  load('sitePresentation').readSitePresentation(env)
  assert.equal(modules(env)('onlineClient').apiBase, 'https://api.example.test')
})

test('P22: ошибочные адреса, секреты в URL и путь API отвергаются до сборки', () => {
  const { readSitePresentation } = load('sitePresentation')
  for (const bad of ['not-a-url', 'https:example.test', 'javascript:alert(1)', 'http://example.test', 'https://*.example.test/', 'https://example.test/?invite=private', 'https://example.test/#token', 'https://example.test/?', 'https://example.test/#', 'https://example.test/white space', 'https://exam\nple.test', 'https://example.test/\\other', 'https://user:SECRET@example.test/']) {
    assert.throws(() => readSitePresentation({ VITE_SITE_URL: bad }), error => error.message.startsWith('VITE_SITE_URL:') && !error.message.includes('SECRET'))
  }
  for (const bad of ['https://api.example.test/api', 'https://api.example.test/extra/', 'https://api.example.test/#secret', 'http://api.example.test']) assert.throws(() => readSitePresentation({ VITE_API_URL: bad }), /VITE_API_URL:/)
})

test('P22: метаданные не объявляют предложенный адрес без выбора пользователя', () => {
  const { siteHeadTags, readSitePresentation } = load('sitePresentation'), { productBrand } = load('productBrand')
  const defaults = siteHeadTags(readSitePresentation({}).siteUrl)
  assert(!defaults.some(tag => tag.attrs.rel === 'canonical' || tag.attrs.property === 'og:url'))
  assert(!JSON.stringify(defaults).includes('grani-bytiya.onrender.com'))
  assert.equal(defaults.find(tag => tag.attrs.name === 'application-name').attrs.content, productBrand.name)
  const tags = siteHeadTags(readSitePresentation({ VITE_SITE_URL: 'https://example.test/play' }).siteUrl)
  assert.equal(tags.find(tag => tag.attrs.rel === 'canonical').attrs.href, 'https://example.test/play/')
  assert.equal(tags.find(tag => tag.attrs.property === 'og:url').attrs.content, 'https://example.test/play/')
  assert(!tags.some(tag => tag.tag === 'script' || tag.attrs['http-equiv']))
})

async function brandFixture(account = false, verified = false) {
  const tree = createRoot(document.getElementById('root')), calls = []
  const context = { user: account ? { id: 'brand-account', displayName: 'Игрок', role: 'PLAYER' } : null, connected: false, loading: false, recovering: false, error: '', config: null, events: 0, request: async () => { throw Error('Brand display must not write data') }, refresh() {}, socket: null,
    supabase: { auth: { mfa: {
      listFactors: async () => ({ data: { totp: verified ? [{ id: 'old-factor', status: 'verified', friendly_name: 'Мир 6' }] : [] } }),
      enroll: async options => { calls.push(options); return { data: { id: 'new-factor', totp: { qr_code: '<svg/>', secret: 'TEST' } } } },
    } } },
  }
  const Component = load(account ? 'AccountPanel' : 'App').default
  await flush(() => tree.render(React.createElement(OnlineContext.Provider, { value: context }, React.createElement(Component))))
  return { calls, close: async () => { await flush(() => tree.unmount()) } }
}

test('P22: название продукта обновлено, имя игрового мира и старое хранилище сохранены', async () => {
  const f = await brandFixture()
  try {
    assert.equal(document.querySelector('.w6-brand').getAttribute('aria-label'), 'Грани Бытия · главная')
    assert.equal(document.querySelector('.w6-brand strong').textContent, 'Грани Бытия')
    assert(document.querySelector('.w6-site-footer').textContent.includes('Грани Бытия'))
    assert(document.querySelector('.w6-home-hero').textContent.includes('Создай героя Мира 6'))
    assert.equal(load('characterStorage').STORAGE_KEY, 'world6.characters.v2')
    assert.equal(load('characterTransfer').ARCHIVE_FORMAT, 'world6-character-archive')
  } finally { await f.close() }
})

test('P22: новый TOTP получает название продукта без выдачи роли', async () => {
  const f = await brandFixture(true)
  try {
    await click('Настроить или подтвердить второй фактор')
    assert.deepEqual(f.calls, [{ factorType: 'totp', friendlyName: 'Грани Бытия' }])
    assert(document.body.textContent.includes('Второй фактор'))
  } finally { await f.close() }
})

test('P22: существующий подтверждённый TOTP со старым названием используется без пересоздания', async () => {
  const f = await brandFixture(true, true)
  try {
    await click('Настроить или подтвердить второй фактор')
    assert.equal(f.calls.length, 0)
    assert(document.body.textContent.includes('Введи код из приложения аутентификации'))
  } finally { await f.close() }
})

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
    if (options?.method === 'PUT' && url.endsWith('/declarations')) { const body=JSON.parse(options.body); writes.push({url,...body}); return {entryVersion:body.baseVersion+1} }
    if (['POST','PATCH'].includes(options?.method) && /declarations(?:\/return)?$/.test(url)) { writes.push({url,...JSON.parse(options.body)}); return {ok:true} }
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


test('Переносимая работа: черновик сохраняет остаток и не удаляет нужного героя/сцену', async () => {
 const f=await fixture(), oldConfirm=window.confirm
 try {
  const amount=n=>({numerator:String(n),denominator:'1'}), world=f.worlds.a
  const scenes=load('scenes');world.campaign.scenes=scenes.createScene(scenes.emptyScenes(),'work-scene','Рабочая сцена','top')
  const work={version:1,entries:[{id:'work-a',actorId:'hero-a',sceneId:'work-scene',origin:{collectionId:'collection',epoch:2,entryRevision:1,actionIndex:0},
   action:{kind:'wait',seconds:8,note:''},amount:{unit:'world-ms',total:amount(8000),remaining:amount(3000)}}]}
  world.campaign.roundWork=work
  await f.open('a');await f.load()
  assert.deepEqual(storage.readLobbyDraft(f.accountId,'a').world.campaign.roundWork,work)
  let confirmations=0;window.confirm=()=>{confirmations++;return true}
  const remove=document.querySelector('[aria-label="Удалить персонажа Hero a"]');assert(remove)
  await flush(()=>remove.click());assert.equal(confirmations,0)
  assert(document.body.textContent.includes('У героя есть переносимая работа'))
  await click('Удалить сцену')
  const saved=storage.readLobbyDraft(f.accountId,'a').world
  assert.equal(saved.characters.length,1);assert.equal(saved.campaign.scenes.scenes.length,1)
  assert.deepEqual(saved.campaign.roundWork,work);assert.equal(f.writes.length,0)
  await f.open('b');await f.load();await f.open('a')
  assert.deepEqual(storage.readLobbyDraft(f.accountId,'a').world.campaign.roundWork,work)
 } finally {window.confirm=oldConfirm;await f.close()}
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

test('Права: ограниченный помощник не открывает полный черновик; отдельные сцены сохраняются по лобби', async () => {
 const f=await fixture()
 try {
  await f.open('a');await f.load();await input('[data-name]','Секретный черновик')
  await f.permissions(['scenes']);await f.role('ASSISTANT');await flush()
  assert.equal(name(),undefined)
  assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Открыть кампанию в редакторе')),false)
  assert.equal(document.querySelector('input[type="file"]'),null,'Scene-only access has no campaign backup UI')
  await click('Открыть сцены в редакторе');await input('[name="sceneName"]','Ограниченная сцена');await click('Создать сцену')
  await f.open('b');await click('Открыть сцены в редакторе')
  assert.equal(document.querySelector('.gb-scene-viewport'),null)
  await f.open('a');assert(document.body.textContent.includes('Ограниченная сцена'))
  await click('Сохранить сцены на сервер')
  const write=f.writes.at(-1)
  assert.equal(write.url,'/lobbies/a/scenes');assert.equal(write.revision,7);assert.equal(write.world,undefined)
  assert.equal(write.scenes.scenes[0].name,'Ограниченная сцена')
  assert.equal(storage.readLobbyDraft(f.accountId,'a').world.characters[0].name,'Секретный черновик')
  await f.permissions([]);assert.equal(document.querySelector('[aria-label="Конструктор сцен мастера"]'),null)
  await f.permissions([...lobbyPermissions]);assert.equal(name(),'Секретный черновик')
 } finally {await f.close()}
})

test('A7 и права: поздняя загрузка отдельных сцен не смешивает лобби или аккаунты', async () => {
 const f=await fixture(),waiting=deferred()
 try {
  await f.permissions(['scenes']);await f.role('ASSISTANT');await f.open('a');await flush()
  f.intercept(url=>url==='/lobbies/a/scenes'?waiting.promise:undefined)
  await click('Открыть сцены в редакторе');await f.open('b');await click('Открыть сцены в редакторе')
  await input('[name="sceneName"]','Своя сцена B');await click('Создать сцену')
  await flush(()=>waiting.resolve({revision:7,scenes:load('scenes').createScene(load('scenes').emptyScenes(),'late-a','Чужая сцена A','top'),actors:[]}))
  assert.equal(document.body.textContent.includes('Чужая сцена A'),false)
  assert(document.body.textContent.includes('Своя сцена B'))
  const other=crypto.randomUUID();f.context.user={id:other};await f.render();await flush()
  assert.equal(document.querySelector('.gb-scene-viewport'),null,'Другой аккаунт не видит предыдущий черновик')
  f.context.user={id:f.accountId};await f.render();await flush()
  assert(document.body.textContent.includes('Своя сцена B'))
  assert.equal(f.writes.length,0)
 } finally {await f.close()}
})

test('Права: главный ГМ сохраняет явный набор разрешений помощника', async () => {
 const f=await fixture()
 try {
  await f.open('a')
  f.intercept((url,options)=>{if(options?.method==='PATCH'&&url.endsWith('/permissions')){f.writes.push({url,...JSON.parse(options.body)});return Promise.resolve({ok:true})}})
  const label=[...document.querySelectorAll('label')].find(l=>l.textContent==='Управлять сценами')
  assert(label);await flush(()=>label.querySelector('input').click())
  await click('Сохранить разрешения помощника')
  assert.deepEqual(f.writes.at(-1),{url:'/lobbies/a/members/friend-id/permissions',permissions:['scenes'],revision:7})
 } finally {await f.close()}
})

test('Передача: явное согласие и возврат отправляются в исходное лобби, поздний ответ не меняет другое', async () => {
 const f=await fixture(),waiting=deferred(),confirmed=window.confirm
 try {
  f.worlds.a.characters[0].ownerId=f.accountId
  f.worlds.a.characters[0].control={delegated:false,controllerId:f.accountId}
  await f.permissions([]);await f.role('PLAYER');await f.open('a')
  f.intercept((url,options)=>{if(options?.method==='POST'&&url.endsWith('/control')){f.writes.push({url,...JSON.parse(options.body)});return waiting.promise}})
  window.confirm=()=>false;await click('Передать героя мастеру');assert.equal(f.writes.length,0)
  window.confirm=()=>true;await click('Передать героя мастеру')
  assert.deepEqual(f.writes[0],{url:'/lobbies/a/characters/hero-a/control',delegated:true,revision:7})
  await f.open('b');await flush(()=>waiting.resolve({revision:8}))
  assert.equal(document.body.textContent.includes('Управление обновлено'),false)
  f.worlds.a.characters[0].control={delegated:true,controllerId:'friend-id'}
  f.intercept((url,options)=>{if(options?.method==='POST'&&url.endsWith('/control')){f.writes.push({url,...JSON.parse(options.body)});return Promise.resolve({revision:8})}})
  await f.open('a');await click('Вернуть себе управление')
  assert.deepEqual(f.writes.at(-1),{url:'/lobbies/a/characters/hero-a/control',delegated:false,revision:7})
 } finally {window.confirm=confirmed;await f.close()}
})

test('Проверка героя: замечания сохраняются отдельно по лобби и аккаунту, отправка требует свежую заявку', async () => {
 const f=await fixture()
 try {
  await f.open('a');await click('Открыть заявку и проверяемый лист')
  await input('[aria-label="Замечание к герою Hero a"]','Исправь историю A')
  await f.open('b');await click('Открыть заявку и проверяемый лист')
  await input('[aria-label="Замечание к герою Hero b"]','Замечание B')
  await f.open('a');await click('Открыть заявку и проверяемый лист')
  assert.equal(document.querySelector('[aria-label="Замечание к герою Hero a"]').value,'Исправь историю A')
  f.worlds.a.revision=8;f.context.events++;await f.render();await flush()
  const returned=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Вернуть лист с замечанием'))
  assert(returned().closest('fieldset').disabled)
  await click('Обновить заявку')
  f.intercept((url,options)=>{if(options?.method==='POST'&&url.endsWith('/review')){f.writes.push({url,...JSON.parse(options.body)});return Promise.resolve({revision:9})}})
  await click('Вернуть лист с замечанием')
  assert.deepEqual(f.writes.at(-1),{url:'/lobbies/a/characters/hero-a/review',decision:'return',note:'Исправь историю A',revision:8})
  f.context.user={id:crypto.randomUUID()};await f.render();await flush();await click('Открыть заявку и проверяемый лист')
  assert.equal(document.querySelector('[aria-label="Замечание к герою Hero a"]').value,'')
 }finally{await f.close()}
})

test('A7: поздняя заявка не раскрывается в другом лобби или после отзыва права проверки', async () => {
 const f=await fixture(),waiting=deferred()
 try {
  await f.role('ASSISTANT');await f.permissions(['approveHeroes']);await f.open('a')
  f.intercept(url=>url.endsWith('/hero-a/submission')?waiting.promise:undefined)
  await click('Открыть заявку и проверяемый лист');await f.open('b')
  await flush(()=>waiting.resolve({revision:7,sheet:{...f.worlds.a.characters[0],name:'Поздний лист A'},review:{status:'pending',locked:false},conditionErrors:[],canResubmit:false}))
  assert.equal(document.body.textContent.includes('Поздний лист A'),false)
  await click('Открыть заявку и проверяемый лист');assert(document.querySelector('[aria-label="Отправленный лист"]'))
  await f.permissions([])
  assert.equal(document.querySelector('[aria-label="Отправленный лист"]'),null)
  assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Принять героя')),false)
 }finally{await f.close()}
})

test('Условия создания: черновик переживает навигацию и сохраняет исходную ревизию', async () => {
 const f=await fixture()
 try {
  await f.open('a');await input('[aria-label="Требования и пояснения для игроков"]','Наши условия A')
  await f.open('b');await input('[aria-label="Требования и пояснения для игроков"]','Наши условия B')
  f.worlds.a.revision=12
  await f.open('a')
  assert.equal(document.querySelector('[aria-label="Требования и пояснения для игроков"]').value,'Наши условия A')
  f.intercept((url,options)=>{if(options?.method==='PATCH'&&url.endsWith('/creation-conditions')){f.writes.push({url,...JSON.parse(options.body)});return Promise.reject(Error('Кампания изменилась.'))}})
  await click('Сохранить условия создания')
  assert.equal(f.writes.at(-1).revision,7);assert.equal(f.writes.at(-1).conditions.instructions,'Наши условия A')
  assert.equal(document.querySelector('[aria-label="Требования и пояснения для игроков"]').value,'Наши условия A')
 }finally{await f.close()}
})

test('Исправленная заявка: только владелец явно выбирает облачный исходник и подтверждает замену', async () => {
 const f=await fixture(),confirmed=window.confirm
 try {
  f.worlds.a.characters[0].ownerId=f.accountId
  f.worlds.a.characters[0].review={status:'returned',locked:false,note:'Исправь биографию.'}
  f.cloud.push({id:'cloud-source',name:'Исправленный исходник',revision:3})
  await f.role('PLAYER');await f.permissions([]);await f.open('a');await click('Открыть заявку и проверяемый лист')
  assert.equal(document.querySelector('[aria-label="Исправленный исходник Hero a"]').value,'cloud-source')
  f.intercept((url,options)=>{if(options?.method==='POST'&&url.endsWith('/resubmit')){f.writes.push({url,...JSON.parse(options.body)});return Promise.resolve({revision:8})}})
  window.confirm=()=>false;await click('Отправить исправленный лист');assert.equal(f.writes.length,0)
  window.confirm=()=>true;await click('Отправить исправленный лист')
  assert.deepEqual(f.writes.at(-1),{url:'/lobbies/a/characters/hero-a/resubmit',characterId:'cloud-source',sourceRevision:3,revision:7})
 }finally{window.confirm=confirmed;await f.close()}
})

test('Экран игрока: поздняя сцена не попадает в другую комнату или аккаунт', async () => {
 const f=await fixture(),waiting=deferred()
 try {
  f.worlds.a.characters[0].ownerId=f.accountId;f.worlds.b.characters[0].ownerId=f.accountId
  await f.role('PLAYER');await f.permissions([]);await f.open('a')
  f.intercept(url=>url.endsWith('/hero-a/perception')?waiting.promise:undefined)
  await click('Открыть экран героя');await f.open('b');await click('Открыть экран героя')
  await flush(()=>waiting.resolve({revision:7,hero:f.worlds.a.characters[0],map:{title:'Поздняя сцена A',description:'Не должна показаться',frame:{id:'a',view:'top',palette:'forest',width:30,depth:20,groundZ:0,minZ:-5,maxZ:20},areas:[],objects:[],contacts:[]},knowledge:{journal:[],knownEffects:[]},inventory:[],canWriteNotes:true}))
  assert.equal(document.body.textContent.includes('Поздняя сцена A'),false)
  f.context.user={id:crypto.randomUUID()};await f.render();await flush()
  assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Свернуть экран героя')),false)
 }finally{await f.close()}
})

test('Экран игрока: черновики заметок разделены, устаревшая версия требует проверки и поздний ответ сохраняет другую заметку', async () => {
 const f=await fixture(),waiting=deferred()
 try {
  f.worlds.a.characters[0].ownerId=f.accountId;f.worlds.b.characters[0].ownerId=f.accountId
  await f.role('PLAYER');await f.permissions([]);await f.open('a');await click('Открыть экран героя')
  await input('[aria-label="Заголовок заметки"]','Моя заметка A');await input('[aria-label="Текст личной заметки"]','Незавершённый текст A')
  await f.open('b');await click('Открыть экран героя');await input('[aria-label="Заголовок заметки"]','Моя заметка B');await input('[aria-label="Текст личной заметки"]','Незавершённый текст B')
  await f.open('a');await click('Открыть экран героя')
  assert.equal(document.querySelector('[aria-label="Текст личной заметки"]').value,'Незавершённый текст A')
  f.worlds.a.revision=9;f.context.events++;await f.render();await flush()
  assert([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Записать личную заметку')).disabled)
  await click('Заметка проверена с текущей версией')
  f.intercept((url,options)=>{if(url.endsWith('/knowledge')&&options?.method==='POST'){f.writes.push({url,...JSON.parse(options.body)});return waiting.promise}})
  await click('Записать личную заметку');await f.open('b');await click('Открыть экран героя')
  await flush(()=>waiting.resolve({revision:10}))
  assert.equal(document.querySelector('[aria-label="Текст личной заметки"]').value,'Незавершённый текст B')
  assert.equal(document.body.textContent.includes('Личная заметка записана.'),false)
  assert.equal(f.writes[0].url,'/lobbies/a/characters/hero-a/knowledge');assert.equal(f.writes[0].revision,9)
 }finally{await f.close()}
})

test('Раскрытие: черновик не теряет пустой заголовок и незавершённую координату; отправляет только выбранному герою', async () => {
 const f=await fixture()
 try {
  f.worlds.a.campaign.scenes=load('scenes').createScene(load('scenes').emptyScenes(),'scene-a','Тайная сцена A','top')
  await f.open('a');await click('Настроить видимость героя')
  await flush(()=>{const field=document.querySelector('[aria-label="Сцена раскрытия"]');field.value='scene-a';field.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await click('Открыть выбранную сцену герою');await input('[aria-label="Название сцены для героя"]','')
  await input('[aria-label="x области"]','-');await f.open('b');await f.open('a')
  assert.equal(document.querySelector('[aria-label="Название сцены для героя"]').value,'')
  assert.equal(document.querySelector('[aria-label="x области"]').value,'-')
  await input('[aria-label="Название сцены для героя"]','Площадь');await click('Раскрыть всю местность');await click('Сохранить раскрытие героя')
  const write=f.writes.at(-1)
  assert.equal(write.url,'/lobbies/a/characters/hero-a/disclosure');assert.equal(write.revision,7)
  assert.equal(write.draft.scenes[0].title,'Площадь');assert.deepEqual(write.draft.scenes[0].contacts,[])
  assert.equal(write.scenes,undefined);assert.equal(write.world,undefined)
 }finally{await f.close()}
})

test('Права раскрытия: отдельного права сцен недостаточно; отзыв секретов убирает прежний черновик и просмотр', async () => {
 const f=await fixture(),waiting=deferred()
 try {
  await f.role('ASSISTANT');await f.permissions(['scenes']);await f.open('a')
  assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Настроить видимость героя')),false)
  await f.permissions(['scenes','viewSecrets'])
  f.intercept(url=>url.endsWith('/hero-a/disclosure')?waiting.promise:undefined)
  await click('Настроить видимость героя');await f.permissions(['scenes'])
  await flush(()=>waiting.resolve({revision:7,draft:{activeSceneId:null,scenes:[]},scenes:load('scenes').emptyScenes(),actors:[],preview:{title:'Закрытый просмотр'}}))
  assert.equal(document.body.textContent.includes('Закрытый просмотр'),false)
  assert.equal(document.querySelector('[aria-label="Сцена раскрытия"]'),null)
 }finally{await f.close()}
})

test('Сведение мастера: текст переживает смену комнаты и отправляется адресно с исходной версией', async () => {
 const f=await fixture()
 try {
  await f.open('a');await input('[aria-label="Заголовок раскрываемого сведения"]','Известный путь');await input('[aria-label="Текст раскрываемого сведения"]','Только для первого героя.')
  await f.open('b');await f.open('a')
  assert.equal(document.querySelector('[aria-label="Текст раскрываемого сведения"]').value,'Только для первого героя.')
  f.intercept((url,options)=>{if(options?.method==='POST'&&url.endsWith('/knowledge')){f.writes.push({url,...JSON.parse(options.body)});return Promise.resolve({revision:8})}})
  await click('Раскрыть сведение выбранному герою')
  assert.equal(f.writes[0].url,'/lobbies/a/characters/hero-a/knowledge');assert.equal(f.writes[0].disclosure,true);assert.equal(f.writes[0].revision,7)
 }finally{await f.close()}
})

function readyDeclarations(id) {
  return {collection:{id:'collection-'+id,epoch:1,phase:'open',durationSeconds:5,allowReplace:true},participating:true,canSubmit:true,entry:null,controlStamp:'0',readiness:[],
    options:{sceneId:'scene-'+id,width:20,depth:20,minZ:-5,maxZ:20,targets:[],items:[],abilities:[]}}
}
async function selectValue(selector,value) {
  const field=document.querySelector(selector);assert(field,'Missing select '+selector)
  await flush(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(field,value);field.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
}
async function ownActions(f,id) {
  f.worlds[id].characters[0].ownerId=f.accountId;f.declarations[id]=readyDeclarations(id)
  await f.open(id);await click('Открыть экран героя');await flush()
}
async function waitAction(seconds,note='') {
  await selectValue('[aria-label="Категория действия"]','wait');await input('[aria-label="Ожидание, с"]',seconds)
  if(note)await input('[aria-label="Пояснение действия"]',note)
  await click('Добавить действие в последовательность')
}
test('Заявления: последовательность и незавершённые координаты разделены по лобби; поздняя отправка не очищает новый черновик',async()=>{
  const f=await fixture(),pending=deferred()
  try {
    await ownActions(f,'a');await input('[aria-label="Действие X"]','-');await waitAction('1','План первого лобби')
    await ownActions(f,'b');await waitAction('2','План второго лобби')
    await f.open('a');await click('Открыть экран героя');await selectValue('[aria-label="Категория действия"]','move')
    assert.equal(document.querySelector('[aria-label="Действие X"]').value,'-');assert(document.body.textContent.includes('План первого лобби'))
    f.intercept((url,options)=>options?.method==='PUT'&&url==='/lobbies/a/characters/hero-a/declarations'?pending.promise:undefined)
    await click('Отправить заявление');await f.open('b');await click('Открыть экран героя')
    pending.resolve({entryVersion:1});await flush()
    assert(document.body.textContent.includes('План второго лобби'));assert(!document.body.textContent.includes('План первого лобби'))
    await f.open('a');await click('Открыть экран героя');assert(document.body.textContent.includes('План первого лобби'))
    assert.equal(f.writes.length,0,'Navigation and aborted replies never publish or erase another plan')
  }finally{await f.close()}
})
test('Заявления: чужая готовность не меняет мою базу; закрытие и передача управления требуют явной сверки',async()=>{
  const f=await fixture()
  try {
    await ownActions(f,'a');await waitAction('1')
    f.declarations.a.readiness=[{userId:'other',ready:true}];f.context.events++;await f.render();await flush()
    assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Отправить заявление').disabled,false)
    f.declarations.a.collection.epoch=3;f.context.events++;await f.render();await flush()
    assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Отправить заявление').disabled,true)
    await click('Последовательность проверена с текущей версией')
    f.declarations.a.controlStamp='2';f.context.events++;await f.render();await flush()
    assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Отправить заявление').disabled,true)
    await click('Последовательность проверена с текущей версией');await click('Отправить заявление')
    assert.equal(f.writes.length,1);assert.equal(f.writes[0].epoch,3);assert.equal(f.writes[0].baseVersion,0);assert.equal(f.writes[0].controlStamp,'2')
    assert.deepEqual(f.writes[0].actions,[{kind:'wait',seconds:1,note:''}])
  }finally{await f.close()}
})
test('Заявления: поздняя загрузка плана не раскрывается в другом лобби или аккаунте',async()=>{
  const f=await fixture(),late=deferred()
  try {
    f.worlds.a.characters[0].ownerId=f.accountId;f.worlds.b.characters[0].ownerId=f.accountId;f.declarations.b=readyDeclarations('b')
    f.intercept((url,options)=>url==='/lobbies/a/characters/hero-a/declarations'&&(!options?.method||options.method==='GET')?late.promise:undefined)
    await f.open('a');await click('Открыть экран героя');await f.open('b');await click('Открыть экран героя')
    f.context.user={id:'another-account'};f.context.events++;await f.render()
    late.resolve({...readyDeclarations('a'),entry:{revision:1,status:'submitted',actions:[{kind:'wait',seconds:1,note:'ЧУЖОЙ СЕКРЕТНЫЙ ПЛАН'}],submittedAt:'',note:''}});await flush()
    assert(!document.body.textContent.includes('ЧУЖОЙ СЕКРЕТНЫЙ ПЛАН'));assert.equal(f.writes.length,0)
  }finally{await f.close()}
})
test('Приём мастера: настройки и частичная длительность сохраняются; устаревшая версия не публикуется автоматически',async()=>{
  const f=await fixture(),scenes=load('scenes')
  try {
    for(const id of ['a','b'])f.worlds[id].campaign.scenes=scenes.createScene(scenes.emptyScenes(),'scene-'+id,'Сцена '+id,'top')
    await f.open('a');await click('Открыть инструменты заявлений');await selectValue('[aria-label="Сцена приёма"]','scene-a');await input('[aria-label="Длительность раунда, с"]','-')
    await flush(()=>document.querySelector('[aria-label="Участник сбора Hero a"]').click())
    await f.open('b');await click('Открыть инструменты заявлений');await input('[aria-label="Длительность раунда, с"]','7')
    await f.open('a');await click('Открыть инструменты заявлений');assert.equal(document.querySelector('[aria-label="Длительность раунда, с"]').value,'-')
    f.worlds.a.revision=8;f.context.events++;await f.render();await flush();await input('[aria-label="Длительность раунда, с"]','5')
    assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Начать приём заявлений').disabled,true)
    await click('Настройки приёма проверены');await click('Начать приём заявлений')
    assert.equal(f.writes.length,1);assert.equal(f.writes[0].url,'/lobbies/a/declarations');assert.equal(f.writes[0].revision,8);assert.equal(f.writes[0].durationSeconds,5);assert.deepEqual(f.writes[0].participantIds,['hero-a']);assert.equal(f.writes[0].allowReplace,true)
  }finally{await f.close()}
})
test('Приём мастера: неполные права не открывают планы; отзыв секретов во время загрузки убирает инструмент',async()=>{
  const f=await fixture(),late=deferred()
  try {
    await f.role('ASSISTANT');await f.permissions(['rounds']);await f.open('a')
    assert(!document.body.textContent.includes('Открыть инструменты заявлений'))
    await f.permissions(['rounds','viewSecrets']);f.intercept((url,options)=>url==='/lobbies/a/declarations'&&(!options?.method||options.method==='GET')?late.promise:undefined)
    await click('Открыть инструменты заявлений');await f.permissions(['rounds'])
    late.resolve({revision:7,declarations:{version:1,active:null,archive:[]},actors:[],scenes:[{id:'secret',name:'СКРЫТОЕ ПЛАНИРОВАНИЕ',objects:[]}]});await flush()
    assert(!document.body.textContent.includes('СКРЫТОЕ ПЛАНИРОВАНИЕ'));assert(!document.body.textContent.includes('Открыть инструменты заявлений'));assert.equal(f.writes.length,0)
  }finally{await f.close()}
})

function closedTimeline(f,id) {
  const actor=f.worlds[id].characters[0]
  f.worlds[id].campaign.declarations={version:1,archive:[],active:{id:'collection-'+id,sceneId:'scene-'+id,sceneName:'Сцена '+id,durationSeconds:5,allowReplace:true,phase:'closed',epoch:2,
    participantIds:[actor.id],history:[],entries:[{actorId:actor.id,actorName:actor.name,revision:1,status:'submitted',resolved:[],submittedBy:f.accountId,submittedAt:'',note:'',
      actions:[{kind:'interact',target:{kind:'self'},operation:'inspect',note:''},{kind:'wait',seconds:1,note:''}]}]}}
}
async function timelineFields(f,id,budget='5000',cost='1000') {
  await f.open(id);await click('Открыть инструменты заявлений')
  await input('[aria-label="Бюджет Hero '+id+', мс"]',budget)
  await input('[aria-label="Стоимость Hero '+id+', действие 1, мс"]',cost)
}
test('Время раунда: частичные параметры разделены по лобби и аккаунту',async()=>{
  const f=await fixture()
  try {
    closedTimeline(f,'a');closedTimeline(f,'b')
    await timelineFields(f,'a','-','1e');await timelineFields(f,'b','9000','3000')
    await f.open('a');await click('Открыть инструменты заявлений')
    assert.equal(document.querySelector('[aria-label="Бюджет Hero a, мс"]').value,'-')
    assert.equal(document.querySelector('[aria-label="Стоимость Hero a, действие 1, мс"]').value,'1e')
    assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать временную шкалу').disabled,true)
    f.context.user={id:'different-timeline-account'};f.context.events++;await f.render();await flush();await click('Открыть инструменты заявлений')
    assert.equal(document.querySelector('[aria-label="Бюджет Hero a, мс"]').value,'')
    f.context.user={id:f.accountId};f.context.events++;await f.render();await flush();await click('Открыть инструменты заявлений')
    assert.equal(document.querySelector('[aria-label="Бюджет Hero a, мс"]').value,'-')
    assert.equal(f.writes.length,0);assert.equal(f.previews.length,0)
  }finally{await f.close()}
})
test('Время раунда: расчёт использует текущие версии; старый результат скрывается до явной сверки',async()=>{
  const f=await fixture()
  try {
    closedTimeline(f,'a');await timelineFields(f,'a');await click('Рассчитать временную шкалу')
    assert(document.querySelector('[aria-label="Результат временной шкалы"]'))
    assert.deepEqual(f.previews[0].timings,[{actorId:'hero-a',entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}])
    assert.equal(f.previews[0].epoch,2);assert.equal(f.previews[0].revision,7)
    f.worlds.a.revision=8;f.context.events++;await f.render();await flush()
    assert.equal(document.querySelector('[aria-label="Результат временной шкалы"]'),null)
    assert.equal(document.querySelector('[aria-label="Бюджет Hero a, мс"]').value,'5000')
    assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать временную шкалу').disabled,true)
    await click('Параметры времени проверены');await click('Рассчитать временную шкалу')
    assert.equal(f.previews.at(-1).revision,8);assert(document.querySelector('[aria-label="Результат временной шкалы"]'))
    assert.equal(f.writes.length,0)
  }finally{await f.close()}
})
test('Время раунда: поздний расчёт другого лобби не показывает результат и сохраняет параметры',async()=>{
  const f=await fixture(),late=deferred()
  try {
    closedTimeline(f,'a');closedTimeline(f,'b');await timelineFields(f,'a')
    const c=f.worlds.a.campaign.declarations.active,response={revision:7,timeline:load('roundTimeline').previewRoundTimeline(c,[{actorId:'hero-a',entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}])}
    f.intercept(url=>url==='/lobbies/a/declarations/preview'?late.promise:undefined)
    await click('Рассчитать временную шкалу');await f.open('b');await click('Открыть инструменты заявлений')
    late.resolve(response);await flush()
    assert.equal(document.querySelector('[aria-label="Результат временной шкалы"]'),null)
    assert(!document.body.textContent.includes('Временная шкала рассчитана.'))
    assert.equal(document.querySelector('[aria-label="Бюджет Hero b, мс"]').value,'')
    await f.open('a');await click('Открыть инструменты заявлений')
    assert.equal(document.querySelector('[aria-label="Бюджет Hero a, мс"]').value,'5000')
    assert.equal(document.querySelector('[aria-label="Результат временной шкалы"]'),null);assert.equal(f.writes.length,0)
  }finally{await f.close()}
})
test('Время раунда: отзыв секретных прав во время расчёта убирает результат',async()=>{
  const f=await fixture(),late=deferred()
  try {
    closedTimeline(f,'a');await f.role('ASSISTANT');await f.permissions(['rounds','viewSecrets']);await timelineFields(f,'a')
    const response={revision:7,timeline:load('roundTimeline').previewRoundTimeline(f.worlds.a.campaign.declarations.active,[{actorId:'hero-a',entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}])}
    f.intercept(url=>url==='/lobbies/a/declarations/preview'?late.promise:undefined)
    await click('Рассчитать временную шкалу');await f.permissions(['rounds']);late.resolve(response);await flush()
    assert.equal(document.querySelector('[aria-label="Предпросмотр времени раунда"]'),null)
    assert(!document.body.textContent.includes('Временная шкала рассчитана.'));assert.equal(f.writes.length,0)
  }finally{await f.close()}
})

function executableRound(f,id) {
  closedTimeline(f,id)
  const c=f.worlds[id].campaign.declarations.active
  c.entries[0].actions=[{kind:'wait',seconds:1,note:''}]
}
async function executionFields(f,id) {
  await f.open(id);await click('Открыть инструменты заявлений')
  await input('[aria-label="Бюджет Hero '+id+', мс"]','5000')
  await click('Решения мастера проверены')
}
test('Исполнение: расчёт отделён от применения; подтверждение меняет мир один раз',async()=>{
  const f=await fixture()
  try {
    executableRound(f,'a');await executionFields(f,'a');await click('Рассчитать последствия раунда')
    assert(document.querySelector('[aria-label="Расчёт последствий"]'));assert.equal(f.applications.length,0);assert.equal(f.worlds.a.campaign.seconds,0)
    assert.equal(f.executions[0].revision,7);assert.equal(f.executions[0].input.timings[0].entryRevision,1)
    await click('Применить рассчитанный раунд');assert.equal(f.worlds.a.campaign.seconds,5);assert.equal(f.applications.length,1)
    assert(document.body.textContent.includes('Исходное состояние сохранено'))
    const key=load('lobbyFormDrafts').lobbyFormKey('round-execution',f.accountId,'a','collection-a')
    assert.equal(JSON.parse(localStorage.getItem(key)).command,null)
  }finally{await f.close()}
})
test('Исполнение: потерянный ответ и перемонтирование сохраняют ключ повтора при изменившейся версии',async()=>{
  const f=await fixture()
  try {
    executableRound(f,'a');await executionFields(f,'a');await click('Рассчитать последствия раунда')
    f.intercept((url,options)=> {
      if(!url.endsWith('/rounds/apply')) return undefined
      f.intercept(null)
      return f.request(url,options).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})
    })
    await click('Применить рассчитанный раунд')
    const original=f.applications[0];assert.equal(f.worlds.a.campaign.seconds,5)
    const key=load('lobbyFormDrafts').lobbyFormKey('round-execution',f.accountId,'a','collection-a')
    assert.equal(JSON.parse(localStorage.getItem(key)).command.commandKey,original.commandKey)
    await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений')
    await click('Проверить результат команды')
    assert.deepEqual(f.applications[1],original);assert.equal(f.worlds.a.campaign.seconds,5)
    assert(document.body.textContent.includes('Повторных последствий нет.'));assert.equal(JSON.parse(localStorage.getItem(key)).command,null)
  }finally{await f.close()}
})
test('Исполнение: старая версия скрывает расчёт; поздний ответ другого лобби не появляется',async()=>{
  const f=await fixture(),late=deferred()
  try {
    executableRound(f,'a');executableRound(f,'b');await executionFields(f,'a');await click('Рассчитать последствия раунда')
    const value={...f.executions[0],id:'old-preview',generation:1,summary:{durationSeconds:5,events:[],carried:[],warnings:['ЧУЖОЙ РАСЧЁТ'],missingDecisions:[]}}
    f.worlds.a.revision=8;f.context.events++;await f.render();await flush()
    assert.equal(document.querySelector('[aria-label="Расчёт последствий"]'),null)
    await click('Параметры времени проверены');await click('Решения мастера проверены')
    f.intercept(url=>url==='/lobbies/a/rounds/calculate'?late.promise:undefined)
    await click('Рассчитать последствия раунда');await f.open('b');await click('Открыть инструменты заявлений')
    late.resolve(value);await flush();assert(!document.body.textContent.includes('ЧУЖОЙ РАСЧЁТ'));assert.equal(f.applications.length,0)
  }finally{await f.close()}
})
test('Исполнение: решения об отсутствующих действиях и продолжении работы сохраняются отдельно',async()=>{
  const f=await fixture()
  try {
    executableRound(f,'a');executableRound(f,'b');f.worlds.a.campaign.declarations.active.entries=[]
    f.worlds.a.campaign.roundWork={version:1,entries:[{id:'wait-work',actorId:'hero-a',sceneId:'scene-a',origin:{collectionId:'older',epoch:2,entryRevision:1,actionIndex:0},
      action:{kind:'wait',seconds:15,note:''},amount:{unit:'world-ms',total:{numerator:'15000',denominator:'1'},remaining:{numerator:'5000',denominator:'1'}}}]}
    await f.open('a');await click('Открыть инструменты заявлений')
    assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда').disabled,true)
    await click('Продолжить работу Hero a');await input('[aria-label="Бюджет продолжения Hero a"]','6000')
    await f.open('b');await click('Открыть инструменты заявлений');assert.equal(document.querySelector('[aria-label="Бюджет продолжения Hero a"]'),null)
    await f.open('a');await click('Открыть инструменты заявлений');assert.equal(document.querySelector('[aria-label="Бюджет продолжения Hero a"]').value,'6000')
    await click('Рассчитать последствия раунда');assert.deepEqual(f.executions[0].input.continuations,[{actorId:'hero-a',mode:'continue',budgetMs:6000}])
    assert.equal(f.applications.length,0)
  }finally{await f.close()}
})
test('Исполнение: отзыв прав во время запроса убирает скрытые последствия',async()=>{
  const f=await fixture(),late=deferred()
  try {
    executableRound(f,'a');await f.role('ASSISTANT');await f.permissions(['rounds','viewSecrets']);await executionFields(f,'a')
    f.intercept(url=>url==='/lobbies/a/rounds/calculate'?late.promise:undefined)
    await click('Рассчитать последствия раунда');await f.permissions(['rounds'])
    late.resolve({id:'secret-preview',revision:7,collectionId:'collection-a',epoch:2,generation:1,summary:{durationSeconds:5,events:[],carried:[],warnings:['СКРЫТОЕ ИСПОЛНЕНИЕ'],missingDecisions:[]}});await flush()
    assert.equal(document.querySelector('[aria-label="Исполнение раунда"]'),null);assert(!document.body.textContent.includes('СКРЫТОЕ ИСПОЛНЕНИЕ'));assert.equal(f.applications.length,0)
  }finally{await f.close()}
})
test('Исполнение: недоступное хранилище блокирует отправку команды; явный конфликт допускает новый расчёт',async()=>{
  const f=await fixture(),original=dom.window.Storage.prototype.setItem
  try {
    executableRound(f,'a');await executionFields(f,'a');await click('Рассчитать последствия раунда')
    dom.window.Storage.prototype.setItem=()=>{throw Error('Quota exceeded')}
    await click('Применить рассчитанный раунд');assert.equal(f.applications.length,0);assert(document.body.textContent.includes('Не удалось сохранить команду повтора'))
    dom.window.Storage.prototype.setItem=original
    f.intercept(url=>url.endsWith('/rounds/apply')?Promise.reject(new(load('onlineClient').NetworkError)(409,'Версия изменилась')):undefined)
    await click('Проверить результат команды');assert.equal(document.querySelector('[aria-label="Расчёт последствий"]'),null)
    const key=load('lobbyFormDrafts').lobbyFormKey('round-execution',f.accountId,'a','collection-a')
    assert.equal(JSON.parse(localStorage.getItem(key)).command,null)
  }finally{dom.window.Storage.prototype.setItem=original;await f.close()}
})
test('Исполнение: длинные параметры раунда не теряют сохранённую команду после перемонтирования',async()=>{
  const f=await fixture()
  try {
    executableRound(f,'a');const w=f.worlds.a,c=w.campaign.declarations.active,first=c.entries[0]
    for(let i=1;i<10;i++) {
      const id='hero-extra-'+i,name='Extra '+i
      w.characters.push({...createDefaultCharacter(),id,name});c.participantIds.push(id);c.entries.push({...structuredClone(first),actorId:id,actorName:name})
    }
    await f.open('a');await click('Открыть инструменты заявлений')
    for(const e of c.entries) await input('[aria-label="Бюджет '+e.actorName+', мс"]','5000')
    await click('Решения мастера проверены');await click('Рассчитать последствия раунда')
    f.intercept(url=>url.endsWith('/rounds/apply')?Promise.reject(new(load('onlineClient').NetworkError)(0,'Связь потеряна')):undefined)
    await click('Применить рассчитанный раунд')
    const key=load('lobbyFormDrafts').lobbyFormKey('round-execution',f.accountId,'a','collection-a'),stored=JSON.parse(localStorage.getItem(key))
    assert(stored.source.length>500);assert(stored.command)
    await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений')
    assert([...document.querySelectorAll('button')].some(b=>b.textContent==='Проверить результат команды'))
    assert.equal(f.applications.length,0)
  }finally{await f.close()}
})

function executableMovement(f,id) {
  executableRound(f,id)
  const w=f.worlds[id],c=w.campaign.declarations.active
  c.entries[0].actions=[{kind:'move',route:[{x:6,y:2,z:0}],support:'ground',note:'Личный маршрут'}]
  w.campaign.scenes=load('scenes').createScene(load('scenes').emptyScenes(),'scene-'+id,'Сцена '+id,'side')
  w.campaign.scenes.scenes[0].tokens=[{actorId:'hero-'+id,x:2,y:2,z:0,diameter:1,support:{kind:'ground'}}]
}
async function movementFields(f,id) {
  await timelineFields(f,id,'5000','10000');await click('Решения мастера проверены')
  await input('[aria-label="Высота тела Hero '+id+', м"]','2')
  await flush(()=>document.querySelector('[aria-label="Движение подтверждено мастером"]').click())
}
test('Движение UI: расчёт показывает частичную позицию, а применение сохраняет исходную точку',async()=>{
  const f=await fixture()
  try {
    executableMovement(f,'a');await movementFields(f,'a');await click('Рассчитать последствия раунда')
    assert(document.querySelector('[aria-label="Позиции после движения"]'));assert(document.body.textContent.includes('(2; 2; 0) → (4; 2; 0)'))
    assert.equal(f.worlds.a.campaign.scenes.scenes[0].tokens[0].x,2)
    assert.deepEqual(f.executions[0].input.movement,{confirmed:true,bodies:[{actorId:'hero-a',heightM:2}]})
    await click('Применить рассчитанный раунд')
    assert.equal(f.worlds.a.campaign.scenes.scenes[0].tokens[0].x,4)
    assert.deepEqual(f.worlds.a.campaign.roundWork.entries[0].movement,{start:{x:2,y:2,z:0},diameter:1})
  }finally{await f.close()}
})
test('Движение UI: размеры разделены по лобби/аккаунту и доступны в следующем сборе той же сцены',async()=>{
  const f=await fixture()
  try {
    executableMovement(f,'a');executableMovement(f,'b');await movementFields(f,'a')
    await input('[aria-label="Высота тела Hero a, м"]','2,2')
    await movementFields(f,'b');await input('[aria-label="Высота тела Hero b, м"]','3,1')
    await f.open('a');await click('Открыть инструменты заявлений');assert.equal(document.querySelector('[aria-label="Высота тела Hero a, м"]').value,'2,2')
    f.context.user={id:'another-body-account'};f.context.events++;await f.render();await flush();await click('Открыть инструменты заявлений')
    assert.equal(document.querySelector('[aria-label="Высота тела Hero a, м"]').value,'')
    f.context.user={id:f.accountId};f.context.events++;await f.render();await flush();await click('Открыть инструменты заявлений')
    f.worlds.a.campaign.declarations.active.id='next-collection-a';f.context.events++;await f.render();await flush()
    assert.equal(document.querySelector('[aria-label="Высота тела Hero a, м"]').value,'2,2');assert.equal(document.querySelector('[aria-label="Движение подтверждено мастером"]').checked,false)
    assert.equal(f.applications.length,0)
  }finally{await f.close()}
})
test('Движение UI: неверные размеры и отсутствие подтверждения блокируют расчёт; правка скрывает прежние позиции',async()=>{
  const f=await fixture()
  try {
    executableMovement(f,'a');await timelineFields(f,'a','5000','10000');await click('Решения мастера проверены')
    const calculate=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда')
    assert(calculate().disabled)
    for(const h of ['0','-1','нечисло','1e-10']) {await input('[aria-label="Высота тела Hero a, м"]',h);assert(calculate().disabled)}
    await input('[aria-label="Высота тела Hero a, м"]','2');assert(calculate().disabled)
    await flush(()=>document.querySelector('[aria-label="Движение подтверждено мастером"]').click());await click('Рассчитать последствия раунда')
    assert(document.querySelector('[aria-label="Позиции после движения"]'))
    await input('[aria-label="Высота тела Hero a, м"]','2,1')
    assert.equal(document.querySelector('[aria-label="Позиции после движения"]'),null);assert.equal(document.querySelector('[aria-label="Движение подтверждено мастером"]').checked,false)
    assert.equal(f.applications.length,0)
  }finally{await f.close()}
})
test('Движение UI: потерянный ответ не применяет частичное перемещение повторно',async()=>{
  const f=await fixture()
  try {
    executableMovement(f,'a');await movementFields(f,'a');await click('Рассчитать последствия раунда')
    f.intercept((url,options)=>{if(!url.endsWith('/rounds/apply')) return undefined;f.intercept(null);return f.request(url,options).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})})
    await click('Применить рассчитанный раунд');const original=f.applications[0],work=structuredClone(f.worlds.a.campaign.roundWork)
    await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений');await click('Проверить результат команды')
    assert.deepEqual(f.applications[1],original);assert.equal(f.worlds.a.campaign.scenes.scenes[0].tokens[0].x,4);assert.deepEqual(f.worlds.a.campaign.roundWork,work);assert.equal(f.worlds.a.campaign.seconds,5)
  }finally{await f.close()}
})


test('Движение UI: магический полёт требует сохранённого основания, а его правка отменяет подтверждение',async()=>{
  const f=await fixture()
  try {
    executableMovement(f,'a');const action=f.worlds.a.campaign.declarations.active.entries[0].actions[0];action.support='air';action.route[0].z=4
    await movementFields(f,'a')
    const calculate=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда')
    assert(calculate().disabled)
    await input('[aria-label="Основание полёта Hero a"]','Подтверждённая мастером левитация')
    assert.equal(document.querySelector('[aria-label="Движение подтверждено мастером"]').checked,false)
    await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений')
    assert.equal(document.querySelector('[aria-label="Основание полёта Hero a"]').value,'Подтверждённая мастером левитация')
    await flush(()=>document.querySelector('[aria-label="Движение подтверждено мастером"]').click());await click('Рассчитать последствия раунда')
    assert.equal(f.executions[0].input.movement.bodies[0].flightReason,'Подтверждённая мастером левитация')
    assert(document.body.textContent.includes('основание полёта: Подтверждённая мастером левитация'))
    await input('[aria-label="Основание полёта Hero a"]','Изменённое основание');assert.equal(document.querySelector('[aria-label="Позиции после движения"]'),null)
    assert.equal(f.applications.length,0)
  }finally{await f.close()}
})


function executableRule(f,id,stage='prepare') {
 executableRound(f,id);const w=f.worlds[id],a=w.characters[0],c=w.campaign.declarations.active
 a.rpg.formulas=[];a.resources.mana={maximum:'50',current:'50'};a.statistics.energyRegeneration='0'
 a.rpg.abilities=[{...load('rpgSchema').emptyAbility(),id:'spell',templateId:'template',approved:true,name:'Заряд',mechanism:'effect',rangeM:10,preparation:999,duration:30,cost:{mana:7,shadow:0,stamina:0},modifiers:[{parameter:'movement',flat:2,percent:0}]}]
 c.entries[0].actions=[{kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''}]
 if(stage==='release') {
  const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
  const result=load('roundExecution').calculateRound(w,c,{timings:[{actorId:a.id,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:'+a.id+':0',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields}]},'ui-ready')
  w.characters=result.world.characters;w.campaign=result.world.campaign;w.campaign.declarations.active.entries[0].actions=[{kind:'ability',abilityId:'spell',stage:'release',target:{kind:'self'},note:''}]
 }
}
function editedReplayFixture(f,id='a') {
 executableRule(f,id,'release');const w=f.worlds[id],a=w.characters[0],c=w.campaign.declarations.active,cast=a.rpg.casts[0],key='new:'+a.id+':0'
 Object.assign(a.body.parts.torso,{maximum:100,current:50});cast.ability.mechanism='manual'
 const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
 const params={timings:[{actorId:a.id,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key,kind:'ability',confirmed:true,binding:'unbound',charge:'cast:'+cast.id,input:fields}]}
 const old=load('roundExecution').calculateRound(w,c,params,'old-edited-ui'),groups=old.summary.rules.find(r=>r.kind==='release').rollGroups
 const source={revision:w.revision,generation:1,receiptId:'old-edited-receipt',actions:[{key,actorId:a.id,abilityId:'spell',label:'PRIVATE-OLD-RELEASE',signature:load('roundReplay').releaseSignature(a.id,c.sceneId,'spell',a.id),canPreserve:true}]},requests=[]
 const handle=(url,options)=>{
  if(url==='/lobbies/'+id+'/rounds/replay/options')return Promise.resolve(structuredClone(source))
  if(url==='/lobbies/'+id+'/rounds/replay/edited/calculate'){
   const body=JSON.parse(options.body);requests.push(body)
   const replay={sourceReceiptId:body.receiptId,selections:body.choices.map(s=>s.mode==='preserve'?{...s,groups}:{...s})}
   return f.request('/lobbies/'+id+'/rounds/calculate',{...options,body:JSON.stringify({...body,input:{...body.input,replay}})})
  }
 }
 return {key,source,requests,handle,old}
}
test('R04 UI: изменённая переигровка требует явного выбора, показывает броски и сохраняет черновик',async()=>{
 const f=await fixture()
 try{
  const h=editedReplayFixture(f);f.intercept(h.handle);await ruleFields(f,'a','release')
  await flush(()=>document.querySelector('[aria-label="Сопоставить прежние броски"]').click())
  const selector='[aria-label="Броски переигровки '+h.key+'"]',button=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда')
  assert(button().disabled);assert(document.querySelector(selector).textContent.includes('совпадают герой, способность и цель'));await selectValue(selector,'preserve:'+h.key);assert(!button().disabled)
  await click('Рассчитать последствия раунда');assert(document.querySelector('[aria-label="Выбранные броски переигровки"]'))
  assert.deepEqual(h.requests[0].choices,[{key:h.key,mode:'preserve',sourceKey:h.key}]);assert.equal(h.requests[0].input.replay,undefined)
  assert.deepEqual(f.executions[0].input.replay.selections[0].groups,h.old.summary.rules[0].rollGroups)
  await selectValue(selector,'new');assert.equal(document.querySelector('[aria-label="Расчёт последствий"]'),null)
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений')
  assert.equal(document.querySelector(selector).value,'new');await click('Рассчитать последствия раунда');assert.equal(h.requests.at(-1).choices[0].mode,'new')
  await click('Применить рассчитанный раунд');assert.equal(f.worlds.a.characters[0].resources.mana.current,'43');assert.equal(f.applications.length,1)
 }finally{await f.close()}
})
test('R04 UI: потеря ответа при изменённой переигровке повторяет прежнюю команду без второго расхода',async()=>{
 const f=await fixture()
 try{
  const h=editedReplayFixture(f);let lost=false
  f.intercept((url,options)=>{
   if(!lost&&url==='/lobbies/a/rounds/apply'){lost=true;return f.request(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ потерян')})}
   return h.handle(url,options)
  })
  await ruleFields(f,'a','release');await flush(()=>document.querySelector('[aria-label="Сопоставить прежние броски"]').click());await selectValue('[aria-label="Броски переигровки '+h.key+'"]','preserve:'+h.key)
  await click('Рассчитать последствия раунда');await click('Применить рассчитанный раунд');const first=f.applications[0]
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений');await click('Проверить результат команды')
  assert.deepEqual(f.applications[1],first);assert.equal(f.worlds.a.characters[0].resources.mana.current,'43');assert(document.body.textContent.includes('Повторных последствий нет'))
 }finally{await f.close()}
})
test('R04 UI: поздний источник или расчёт другого лобби скрыт; новая версия сбрасывает сопоставление',async()=>{
 const f=await fixture(),late=deferred()
 try{
  const h=editedReplayFixture(f);executableRule(f,'b','release');f.intercept(h.handle);await ruleFields(f,'a','release')
  await flush(()=>document.querySelector('[aria-label="Сопоставить прежние броски"]').click());await selectValue('[aria-label="Броски переигровки '+h.key+'"]','preserve:'+h.key)
  f.worlds.a.revision++;h.source.revision++;f.context.events++;await f.render();await flush();await click('Параметры времени проверены');await click('Решения мастера проверены')
  assert.equal(document.querySelector('[aria-label="Броски переигровки '+h.key+'"]').value,'')
  await selectValue('[aria-label="Броски переигровки '+h.key+'"]','new');await flush(()=>document.querySelector('[aria-label="Правила подтверждены Hero a · 1"]').click())
  f.intercept((url,options)=>url==='/lobbies/a/rounds/replay/edited/calculate'?late.promise:h.handle(url,options))
  await click('Рассчитать последствия раунда');await f.open('b');await click('Открыть инструменты заявлений')
  late.resolve({id:'late-edited',revision:h.source.revision,generation:1,collectionId:'collection-a',epoch:2,summary:{durationSeconds:5,events:[],carried:[],missingDecisions:[],warnings:['PRIVATE-LATE-EDITED']}});await flush()
  assert(!document.body.textContent.includes('PRIVATE-LATE-EDITED'));assert(!document.body.textContent.includes('PRIVATE-OLD-RELEASE'))
  await f.permissions(['rounds']);assert(!document.body.textContent.includes('PRIVATE-OLD-RELEASE'));assert.equal(f.applications.length,0)
 }finally{await f.close()}
})
test('R04 UI: задержанный список прежних выпусков не раскрывается в другом лобби',async()=>{
 const f=await fixture(),late=deferred()
 try{
  const h=editedReplayFixture(f);executableRule(f,'b','release')
  f.intercept((url,options)=>url==='/lobbies/a/rounds/replay/options'?late.promise:h.handle(url,options))
  await ruleFields(f,'a','release');assert.equal(document.querySelector('[aria-label="Сопоставить прежние броски"]'),null)
  await f.open('b');await click('Открыть инструменты заявлений');late.resolve(h.source);await flush()
  assert(!document.body.textContent.includes('PRIVATE-OLD-RELEASE'));assert.equal(document.querySelector('[aria-label="Сопоставить прежние броски"]'),null)
 }finally{await f.close()}
})
async function ruleFields(f,id,stage='prepare') {
 await timelineFields(f,id,'5000',stage==='prepare'?'8000':'1000');await click('Решения мастера проверены')
 const title='Hero '+id+' · 1'
 if(stage==='prepare')await selectValue('[aria-label="Привязка '+title+'"]','unbound')
 else {
  await selectValue('[aria-label="Заряд '+title+'"]','cast:'+f.worlds[id].characters[0].rpg.casts[0].id)
  await flush(()=>document.querySelector('[aria-label="Цель доступна '+title+'"]').click())
 }
 await flush(()=>document.querySelector('[aria-label="Правила подтверждены '+title+'"]').click())
}
function npcFixture(f,rooms=['a','b']){
 const {emptyCampaign}=load('rpgSchema'),commands=new Map(),requests=[],npcs=Object.fromEntries(rooms.map(id=>[id,[]]))
 f.members[1].permissions=['npcs','viewSecrets']
 const context=id=>({...emptyCampaign(),seconds:f.worlds[id].campaign.seconds,abilities:f.worlds[id].campaign.abilities,items:f.worlds[id].campaign.items,anatomies:f.worlds[id].campaign.anatomies})
 const handle=(url,options)=>{
  const route=url.match(/^\/lobbies\/([ab])\/npcs(?:\/([^/]+))?(?:\/(edit|assign))?$/);if(!route)return
  const [,room,id,op]=route,w=f.worlds[room]
  if(options?.method!=='POST'){
   if(!id)return Promise.resolve({revision:w.revision,closed:false,campaign:context(room),npcs:structuredClone(npcs[room])})
   const n=npcs[room].find(n=>n.id===id);return Promise.resolve({revision:w.revision,actor:structuredClone(w.characters.find(c=>c.id===id)),campaign:context(room),approved:n.approved,controllerId:n.controllerId})
  }
  const body=JSON.parse(options.body);requests.push({url,body})
  if(commands.has(body.commandKey))return Promise.resolve({...commands.get(body.commandKey),duplicate:true})
  if(body.revision!==w.revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Версия NPC изменилась'))
  let target=id
  if(!id){target='npc-'+room+'-'+npcs[room].length;npcs[room].push({id:target,name:body.character.name,approved:true,controllerId:f.accountId});w.characters.push({...structuredClone(body.character),id:target,npc:true})}
  else if(op==='edit'){w.characters=w.characters.map(c=>c.id===id?{...structuredClone(body.character),npc:true}:c);Object.assign(npcs[room].find(n=>n.id===id),{name:body.character.name,approved:body.approved})}
  else if(op==='assign')npcs[room].find(n=>n.id===id).controllerId=body.userId
  w.revision++;const result={id:target,revision:w.revision,duplicate:false};commands.set(body.commandKey,result);return Promise.resolve(result)
 }
 const add=(room,name='NPC '+room)=>{const id='npc-'+room+'-'+npcs[room].length,a={...createDefaultCharacter(),id,name,npc:true};f.worlds[room].characters.push(a);npcs[room].push({id,name,approved:true,controllerId:f.accountId});return id}
 return {handle,add,requests,npcs}
}
async function openNpcs(f,id='a'){await f.open(id);await click('Открыть инструменты NPC')}
test('R05 NPC UI: отдельный лист сохраняет NPC, оставляя время и героя игрока прежними',async()=>{
 const f=await fixture()
 try{const n=npcFixture(f);f.intercept(n.handle);const before=structuredClone(f.worlds.a.characters[0]);await openNpcs(f)
  await click('Подготовить нового NPC');await input('[data-name]','Страж');await click('Создать NPC в кампании')
  assert.equal(n.npcs.a.length,1);assert.equal(n.npcs.a[0].name,'Страж');assert.deepEqual(f.worlds.a.characters[0],before);assert.equal(f.worlds.a.campaign.seconds,0)
  assert(!document.querySelector('[aria-label="Редактор NPC"]'));assert(n.requests[0].body.commandKey.startsWith('npc:'))
 }finally{await f.close()}
})
test('R05 NPC UI: незавершённый лист, причина и допуск сохраняются отдельно для лобби',async()=>{
 const f=await fixture()
 try{const n=npcFixture(f),id=n.add('a');n.add('b');f.intercept(n.handle);await openNpcs(f);await click('Открыть лист NPC NPC a')
  await input('[data-name]','');await input('[aria-label="Причина изменения NPC"]','PRIVATE-NPC-DRAFT');await flush(()=>document.querySelector('[aria-label="Допуск NPC к раундам"]').click())
  await openNpcs(f,'b');await click('Открыть лист NPC NPC b');assert.equal(document.querySelector('[aria-label="Причина изменения NPC"]').value,'')
  await f.mount(false);await f.mount(true);await openNpcs(f);await click('Открыть лист NPC NPC a')
  assert.equal(document.querySelector('[data-name]').value,'');assert.equal(document.querySelector('[aria-label="Причина изменения NPC"]').value,'PRIVATE-NPC-DRAFT');assert.equal(document.querySelector('[aria-label="Допуск NPC к раундам"]').checked,false)
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Сохранить изменения NPC').disabled);assert.equal(n.npcs.a.find(n=>n.id===id).approved,true);assert.equal(n.requests.length,0)
 }finally{await f.close()}
})
test('R05 NPC UI: потерянный ответ создания повторяется прежним ключом после перемонтирования',async()=>{
 const f=await fixture()
 try{const n=npcFixture(f);let lost=false;f.intercept((url,options)=>{if(url==='/lobbies/a/npcs'&&options?.method==='POST'&&!lost){lost=true;return n.handle(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ NPC потерян')})}return n.handle(url,options)})
  await openNpcs(f);await click('Подготовить нового NPC');await input('[data-name]','NPC без двойника');await click('Создать NPC в кампании');const first=n.requests[0]
  await f.mount(false);await f.mount(true);await openNpcs(f);await click('Подготовить нового NPC');await click('Проверить результат команды NPC')
  assert.deepEqual(n.requests[1],first);assert.equal(n.npcs.a.length,1);assert.equal(n.npcs.a[0].name,'NPC без двойника')
 }finally{await f.close()}
})
test('R05 NPC UI: потерянное назначение требует проверки до нового выбора управляющего',async()=>{
 const f=await fixture()
 try{const n=npcFixture(f),id=n.add('a');let lost=false;f.intercept((url,options)=>{if(url.endsWith('/npcs/'+id+'/assign')&&!lost){lost=true;return n.handle(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ назначения потерян')})}return n.handle(url,options)})
  await openNpcs(f);await selectValue('[aria-label="Управляющий NPC NPC a"]','friend-id');assert(document.querySelector('[aria-label="Управляющий NPC NPC a"]').disabled)
  await f.mount(false);await f.mount(true);await openNpcs(f);await click('Проверить назначение NPC NPC a');assert.deepEqual(n.requests[1],n.requests[0]);assert.equal(n.npcs.a[0].controllerId,'friend-id')
 }finally{await f.close()}
})
test('R05 NPC UI: поздний лист другого лобби и отзыв доступа не раскрывают NPC',async()=>{
 const f=await fixture(),late=deferred()
 try{const n=npcFixture(f),id=n.add('a','PRIVATE-NPC-A');n.add('b','NPC B');f.intercept((url,options)=>url==='/lobbies/a/npcs/'+id?late.promise:n.handle(url,options))
  await openNpcs(f);await click('Открыть лист NPC PRIVATE-NPC-A');await openNpcs(f,'b')
  late.resolve({revision:7,actor:{...createDefaultCharacter(),id,name:'PRIVATE-LATE-NPC'},campaign:load('rpgSchema').emptyCampaign(),approved:true,controllerId:f.accountId});await flush()
  assert(!document.body.textContent.includes('PRIVATE-LATE-NPC'));assert(!document.body.textContent.includes('PRIVATE-NPC-A'))
  await f.role('ASSISTANT');await f.permissions(['npcs']);assert(!document.body.textContent.includes('NPC B'));assert(!document.querySelector('[aria-label="Редактор NPC"]'));assert.equal(n.requests.length,0)
 }finally{await f.close()}
})
function tradeFixture(f){
 const model=load('campaignTrade'),schema=load('rpgSchema'),engine=load('rpgEngine'),commands=new Map(),previews=new Map(),requests=[]
 for(const id of ['a','b']){
  const template={...schema.emptyItem(),id:'template-'+id,name:'Флакон '+id,maximumDurability:10,artifactCharge:4,energyReserve:6}
  f.worlds[id].campaign.items=[template];f.worlds[id].campaign.trade={...model.emptyTrade(),currencies:[{id:'coin',name:'Монета',symbol:'м.'}],wallets:[{actorId:'hero-'+id,balances:[{currencyId:'coin',amount:100}]}],merchants:[{...model.newMerchant('shop-'+id),name:'Лавка '+id,secret:'PRIVATE-SHOP-'+id,visible:true,balances:[{currencyId:'coin',amount:100}],stock:[{item:{...engine.instantiateItem(template,'stock-'+id),quantity:4,durability:7},visible:true,prices:[{currencyId:'coin',unitPrice:7}]}]}]}
 }
 const view=id=>({revision:f.worlds[id].revision,closed:false,trade:structuredClone(f.worlds[id].campaign.trade),options:{actors:f.worlds[id].characters.map(a=>({id:a.id,name:a.name,inventory:structuredClone(a.rpg.inventory),approved:true,blocked:false})),templates:f.worlds[id].campaign.items,npcs:[],cities:[],organizations:[]}})
 const handle=(url,options)=>{
  const read=url.match(/^\/lobbies\/([ab])\/trade(?:\?view=master)?$/)
  if(read&&options?.method!=='POST'){const id=read[1],w=f.worlds[id];return Promise.resolve(url.endsWith('master')?view(id):{revision:w.revision,...model.publicTrade(w.campaign.trade,w.campaign.atlas),possessions:[{actorId:'hero-'+id,name:'Hero '+id,balances:w.campaign.trade.wallets[0].balances,inventory:w.characters[0].rpg.inventory}]})}
  const write=url.match(/^\/lobbies\/([ab])\/trade\/(settings|calculate|apply)$/);if(!write)return
  const [,id,operation]=write,body=JSON.parse(options.body),w=f.worlds[id];requests.push({url,body})
  if(commands.has(body.commandKey))return Promise.resolve({receipt:commands.get(body.commandKey),duplicate:true})
  if(operation==='calculate'){
   if(body.revision!==w.revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Имущество изменилось'))
   const result=model.calculateTrade(w,body.input,crypto.randomUUID()),p={id:crypto.randomUUID(),revision:w.revision,generation:1,expiresAt:'2099-01-01',summary:{...result.summary,reason:body.reason}};previews.set(p.id,{p,result});return Promise.resolve(p)
  }
  if(operation==='settings'){
   if(body.revision!==w.revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Имущество изменилось'))
   const c=body.change,t=w.campaign.trade;if(c.kind==='currency')t.currencies=t.currencies.some(x=>x.id===c.entry.id)?t.currencies.map(x=>x.id===c.entry.id?c.entry:x):[...t.currencies,c.entry]
   if(c.kind==='merchant')t.merchants=t.merchants.some(m=>m.id===c.entry.id)?t.merchants.map(m=>m.id===c.entry.id?c.entry:m):[...t.merchants,c.entry]
   if(c.kind==='wallet')t.wallets=t.wallets.some(x=>x.actorId===c.actorId)?t.wallets.map(x=>x.actorId===c.actorId?{actorId:c.actorId,balances:c.balances}:x):[...t.wallets,{actorId:c.actorId,balances:c.balances}]
  }else{
   const data=previews.get(body.previewId);if(!data||data.p.revision!==w.revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Предпросмотр устарел'))
   w.characters=data.result.world.characters;w.campaign=data.result.world.campaign;previews.delete(body.previewId)
  }
  w.revision++;const receipt={revision:w.revision};commands.set(body.commandKey,receipt);return Promise.resolve({receipt,duplicate:false})
 }
 return {model,view,handle,requests,previews}
}
function economyFixture(f){
 const trade=tradeFixture(f),model=load('campaignEconomy'),schema=load('rpgSchema'),engine=load('rpgEngine'),commands=new Map(),previews=new Map(),requests=[]
 for(const id of ['a','b']){
  const w=f.worlds[id];w.characters[0].rpg.inventory=[{...engine.instantiateItem({...schema.emptyItem(),id:'ore-template-'+id,name:'Сырьё '+id,maximumDurability:10},'ore-'+id),quantity:20,durability:7}]
  const line=(lineId,resource,resourceId,amount,target='actor',targetId='hero-'+id)=>({id:lineId,resource,resourceId,amount,target,targetId})
  w.campaign.economy={...model.emptyEconomy(),periodName:'Период мастера',rules:[{...model.newEconomyRule('rule-'+id),name:'Мастерская '+id,secret:'PRIVATE-RULE-'+id,enabled:true,inputs:[line('in-item','item','ore-'+id,2),line('in-money','money','coin',4)],outputs:[line('out-item','item','template-'+id,3,'merchant','shop-'+id),line('out-money','money','coin',9)]}]}
 }
 const view=id=>({...trade.view(id),economy:structuredClone(f.worlds[id].campaign.economy)})
 const handle=(url,options)=>{
  const read=url.match(/^\/lobbies\/([ab])\/trade\?view=master$/);if(read)return Promise.resolve(view(read[1]))
  const write=url.match(/^\/lobbies\/([ab])\/economy\/(settings|calculate|apply)$/);if(!write)return trade.handle(url,options)
  const [,id,operation]=write,body=JSON.parse(options.body),w=f.worlds[id];requests.push({url,body})
  if(commands.has(body.commandKey))return Promise.resolve({receipt:commands.get(body.commandKey),duplicate:true})
  if(operation==='calculate'){
   if(body.revision!==w.revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Учёт изменился'))
   const previewId=crypto.randomUUID(),ids=body.input.ruleIds.flatMap(rid=>w.campaign.economy.rules.find(r=>r.id===rid).outputs.filter(l=>l.resource==='item')).map(()=>crypto.randomUUID()),result=model.calculateEconomy(w,body.input,previewId,ids),p={id:previewId,revision:w.revision,generation:1,expiresAt:'2099-01-01',summary:result.summary};previews.clear();previews.set(p.id,{p,result});return Promise.resolve(p)
  }
  let summary
  if(operation==='settings'){
   if(body.revision!==w.revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Правила изменились'))
   w.campaign.economy={...w.campaign.economy,periodName:body.periodName,rules:structuredClone(body.rules)}
  }else{const data=previews.get(body.previewId);if(!data||data.p.revision!==w.revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Предпросмотр периода устарел'));w.characters=data.result.world.characters;w.campaign=data.result.world.campaign;summary=data.result.summary;previews.delete(body.previewId)}
  w.revision++;const receipt={revision:w.revision,...(summary?{summary}:{})};commands.set(body.commandKey,receipt);return Promise.resolve({receipt,duplicate:false})
 }
 return {model,view,handle,requests}
}
async function openEconomy(f,id='a'){await openTrade(f,id);await click('Открыть периоды учёта')}
async function periodFields(id='a'){await flush(()=>document.querySelector('[aria-label="Учесть правило Мастерская '+id+'"]').click());await input('[aria-label="Число периодов учёта"]','2');await input('[aria-label="Причина учёта периода"]','Условия мастера');await flush(()=>document.querySelector('[aria-label="Условия периода подтверждены"]').click())}
test('R05 Period UI: общий предпросмотр не применяет расход и требует отдельного подтверждения',async()=>{
 const f=await fixture()
 try{const e=economyFixture(f);f.intercept(e.handle);await openEconomy(f);await periodFields();await click('Рассчитать период учёта');assert(document.querySelector('[aria-label="Последствия периода"]'));assert(document.body.textContent.includes('100 − расход 8 + поступление 18 = 110'));assert.equal(f.worlds.a.characters[0].rpg.inventory[0].quantity,20)
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Применить период учёта').disabled);await flush(()=>document.querySelector('[aria-label="Подтверждаю последствия периода"]').click());await click('Применить период учёта');assert.equal(f.worlds.a.campaign.economy.completedPeriods,2);assert.equal(f.worlds.a.characters[0].rpg.inventory[0].quantity,16);assert.equal(f.worlds.a.campaign.trade.merchants[0].stock[1].item.quantity,6);assert(e.requests.at(-1).body.commandKey.startsWith('economy:'))
 }finally{await f.close()}
})
test('R05 Period UI: пробелы, неполные ссылки и ошибочные нормы сохраняются между лобби',async()=>{
 const f=await fixture()
 try{const e=economyFixture(f);f.intercept(e.handle);await openEconomy(f);await click('Добавить правило учёта');await input('[aria-label="Название правила 2"]','  ');await input('[aria-label="Секрет правила 2"]','PRIVATE-DRAFT-A');await click('Добавить расход в правило 2');await input('[aria-label="Расход 2.1 Количество"]','-');await input('[aria-label="Причина записи правил"]','Неполные правила A')
  await openEconomy(f,'b');assert.equal(document.querySelector('[aria-label="Название правила 2"]'),null);assert(!document.body.textContent.includes('PRIVATE-DRAFT-A'))
  await f.mount(false);await f.mount(true);await openEconomy(f);assert.equal(document.querySelector('[aria-label="Название правила 2"]').value,'  ');assert.equal(document.querySelector('[aria-label="Расход 2.1 Количество"]').value,'-');assert.equal(document.querySelector('[aria-label="Секрет правила 2"]').value,'PRIVATE-DRAFT-A');assert.equal(document.querySelector('[aria-label="Причина записи правил"]').value,'Неполные правила A');assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Сохранить правила учёта').disabled)
  await click('Убрать Расход 2.1');await click('Добавить расход в правило 2');assert.equal(document.querySelector('[aria-label="Расход 2.1 Количество"]').value,'1');assert.equal(e.requests.length,0)
 }finally{await f.close()}
})
test('R05 Period UI: потерянное применение повторяет команду, сохраняя один выпуск и расход',async()=>{
 const f=await fixture()
 try{const e=economyFixture(f);let lost=false;f.intercept((url,options)=>{if(url==='/lobbies/a/economy/apply'&&!lost){lost=true;return e.handle(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ учёта потерян')})}return e.handle(url,options)})
  await openEconomy(f);await periodFields();await click('Рассчитать период учёта');await flush(()=>document.querySelector('[aria-label="Подтверждаю последствия периода"]').click());await click('Применить период учёта');const first=e.requests.find(r=>r.url.endsWith('/apply'))
  await f.mount(false);await f.mount(true);await openEconomy(f);await click('Проверить результат периода');assert.deepEqual(e.requests.filter(r=>r.url.endsWith('/apply'))[1],first);assert.equal(f.worlds.a.campaign.economy.completedPeriods,2);assert.equal(f.worlds.a.characters[0].rpg.inventory[0].quantity,16);assert.equal(f.worlds.a.campaign.trade.wallets[0].balances[0].amount,110);assert.equal(f.worlds.a.campaign.trade.merchants[0].stock.length,2)
 }finally{await f.close()}
})
test('R05 Period UI: изменение условий и новой версии снимает предпросмотр, сохраняя выбор и причину',async()=>{
 const f=await fixture()
 try{const e=economyFixture(f);f.intercept(e.handle);await openEconomy(f);await periodFields();await click('Рассчитать период учёта');await input('[aria-label="Число периодов учёта"]','1');assert.equal(document.querySelector('[aria-label="Последствия периода"]'),null);assert.equal(document.querySelector('[aria-label="Условия периода подтверждены"]').checked,false)
  await flush(()=>document.querySelector('[aria-label="Условия периода подтверждены"]').click());await click('Рассчитать период учёта');f.worlds.a.revision++;f.notify();await flush();await click('Управлять имуществом и торговлей');await click('Открыть периоды учёта');assert.equal(document.querySelector('[aria-label="Последствия периода"]'),null);assert.equal(document.querySelector('[aria-label="Причина учёта периода"]').value,'Условия мастера');assert(document.querySelector('[aria-label="Учесть правило Мастерская a"]').checked)
  await click('Период и имущество сверены');assert.equal(document.querySelector('[aria-label="Условия периода подтверждены"]').checked,false);await flush(()=>document.querySelector('[aria-label="Условия периода подтверждены"]').click());await click('Рассчитать период учёта');assert.equal(e.requests.at(-1).body.revision,8)
 }finally{await f.close()}
})
test('R05 Period UI: потерянная запись правил повторяется без сброса счётчика',async()=>{
 const f=await fixture()
 try{const e=economyFixture(f);f.worlds.a.campaign.economy.completedPeriods=5;let lost=false;f.intercept((url,options)=>{if(url==='/lobbies/a/economy/settings'&&!lost){lost=true;return e.handle(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ правил потерян')})}return e.handle(url,options)})
  await openEconomy(f);await input('[aria-label="Описание правила 1"]','Описание изменено');await input('[aria-label="Причина записи правил"]','Изменить описание');await click('Сохранить правила учёта');const first=e.requests[0];assert.equal(first.body.completedPeriods,undefined);assert.equal(first.body.lastRun,undefined)
  await f.mount(false);await f.mount(true);await openEconomy(f);await click('Проверить запись правил учёта');assert.deepEqual(e.requests[1],first);assert.equal(f.worlds.a.campaign.economy.completedPeriods,5)
 }finally{await f.close()}
})
test('R05 Period UI: поздний расчёт и секретная форма другого лобби не отображаются после перехода и отзыва прав',async()=>{
 const f=await fixture(),late=deferred()
 try{const e=economyFixture(f);let result;f.intercept((url,options)=>{if(url==='/lobbies/a/economy/calculate'){e.handle(url,options).then(r=>{result=r});return late.promise}return e.handle(url,options)})
  await openEconomy(f);await periodFields();await click('Рассчитать период учёта');await openEconomy(f,'b');late.resolve({...result,summary:{...result.summary,ruleNames:['PRIVATE-LATE-PERIOD']}});await flush();assert(!document.body.textContent.includes('PRIVATE-LATE-PERIOD'));assert(!document.body.textContent.includes('PRIVATE-RULE-a'))
  await f.role('ASSISTANT');await f.permissions(['economy']);assert.equal(document.querySelector('[aria-label="Учёт периода"]'),null);assert.equal(document.querySelector('[aria-label="Правила производства и расходов"]'),null);assert(!document.body.textContent.includes('PRIVATE-RULE-b'))
 }finally{await f.close()}
})
test('R05 Period UI: открытое имущество игрока не включает секретные правила или последний учёт',async()=>{
 const f=await fixture()
 try{const e=economyFixture(f);f.intercept(e.handle);await openEconomy(f);await periodFields();await click('Рассчитать период учёта');await flush(()=>document.querySelector('[aria-label="Подтверждаю последствия периода"]').click());await click('Применить период учёта');await f.role('PLAYER');assert.equal(document.querySelector('[aria-label="Последний применённый учёт"]'),null);assert(!document.body.textContent.includes('PRIVATE-RULE-a'));assert(!document.body.textContent.includes('Мастерская a'))
 }finally{await f.close()}
})
async function openTrade(f,id='a',master=true){await f.open(id);await click('Открыть имущество и торговлю');if(master)await click('Управлять имуществом и торговлей')}
async function tradeFields(id='a'){await selectValue('[aria-label="Участник сделки"]','hero-'+id);await selectValue('[aria-label="Торговец сделки"]','shop-'+id);await selectValue('[aria-label="Предмет сделки"]','stock-'+id);await selectValue('[aria-label="Валюта сделки"]','coin');await input('[aria-label="Количество сделки"]','2');await input('[aria-label="Причина сделки"]','Встреча и покупка разрешены')}
test('R05 Trade UI: предпросмотр показывает обе суммы и требует отдельного подтверждения',async()=>{
 const f=await fixture()
 try{const a=tradeFixture(f);f.intercept(a.handle);await openTrade(f);await tradeFields();await click('Предпросмотр сделки')
  assert(document.querySelector('[aria-label="Последствия сделки"]'));assert(document.body.textContent.includes('100 → 86'));assert(document.body.textContent.includes('100 → 114'));assert.equal(f.worlds.a.characters[0].rpg.inventory.length,0)
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Применить сделку').disabled);await flush(()=>document.querySelector('[aria-label="Подтверждаю последствия сделки"]').click());await click('Применить сделку')
  assert.equal(f.worlds.a.characters[0].rpg.inventory[0].durability,7);assert.equal(f.worlds.a.characters[0].rpg.inventory[0].artifactCharge,4);assert(a.requests.find(r=>r.url.endsWith('/apply')).body.commandKey.startsWith('trade:'))
 }finally{await f.close()}
})
test('R05 Trade UI: незавершённая валюта и ошибочное количество сохраняются между лобби',async()=>{
 const f=await fixture()
 try{const a=tradeFixture(f);f.intercept(a.handle);await openTrade(f);await click('Подготовить валюту');await input('[aria-label="Название валюты"]','  ');await input('[aria-label="Обозначение валюты"]','  ');await input('[aria-label="Причина записи имущества"]','Причина валюты A')
  await openTrade(f,'b');await click('Подготовить валюту');assert.equal(document.querySelector('[aria-label="Название валюты"]').value,'')
  await f.mount(false);await f.mount(true);await openTrade(f);await click('Подготовить валюту');assert.equal(document.querySelector('[aria-label="Название валюты"]').value,'  ');assert.equal(document.querySelector('[aria-label="Причина записи имущества"]').value,'Причина валюты A')
  await click('Имущество торговца Лавка a');await input('[aria-label="Цена Флакон a coin"]','12');await click('Убрать цену Флакон a coin');await click('Задать цену Флакон a Монета');assert.equal(document.querySelector('[aria-label="Цена Флакон a coin"]').value,'0');await input('[aria-label="Запас Флакон a"]','0');await input('[aria-label="Цена Флакон a coin"]','999999999999');await input('[aria-label="Торговец secret"]','PRIVATE-MY-STOCK');await input('[aria-label="Причина записи имущества"]','Неполная правка')
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Сохранить имущество').disabled)
  await f.mount(false);await f.mount(true);await openTrade(f);await click('Имущество торговца Лавка a');assert.equal(document.querySelector('[aria-label="Запас Флакон a"]').value,'0');assert.equal(document.querySelector('[aria-label="Цена Флакон a coin"]').value,'999999999999');assert.equal(document.querySelector('[aria-label="Торговец secret"]').value,'PRIVATE-MY-STOCK');assert.equal(a.requests.length,0)
 }finally{await f.close()}
})
test('R05 Trade UI: ручные запасы берут существующий шаблон, скрыты и без цены по умолчанию',async()=>{
 const f=await fixture()
 try{const a=tradeFixture(f);f.intercept(a.handle);await openTrade(f);await click('Подготовить торговца');await input('[aria-label="Торговец name"]','Склад');await selectValue('[aria-label="Шаблон запаса"]','template-a');await click('Добавить запас из каталога')
  assert.equal(document.querySelector('[aria-label="Открыть товар Флакон a"]').checked,false);assert.equal(document.querySelector('[aria-label="Цена Флакон a coin"]'),null)
  await input('[aria-label="Причина записи имущества"]','Запас подготовлен вручную');await click('Сохранить имущество');const c=a.requests[0].body.change;assert.equal(c.entry.stock[0].item.artifactCharge,4);assert.equal(c.entry.stock[0].visible,false);assert.deepEqual(c.entry.stock[0].prices,[])
 }finally{await f.close()}
})
test('R05 Trade UI: потерянное применение повторяет тот же ключ без второго списания',async()=>{
 const f=await fixture()
 try{const a=tradeFixture(f);let lost=false;f.intercept((url,options)=>{if(url==='/lobbies/a/trade/apply'&&!lost){lost=true;return a.handle(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ сделки потерян')})}return a.handle(url,options)})
  await openTrade(f);await tradeFields();await click('Предпросмотр сделки');await flush(()=>document.querySelector('[aria-label="Подтверждаю последствия сделки"]').click());await click('Применить сделку');const first=a.requests.find(r=>r.url.endsWith('/apply'))
  await f.mount(false);await f.mount(true);await openTrade(f);await click('Проверить результат сделки');const repeats=a.requests.filter(r=>r.url.endsWith('/apply'));assert.deepEqual(repeats[1],first);assert.equal(f.worlds.a.campaign.trade.wallets[0].balances[0].amount,86);assert.equal(f.worlds.a.characters[0].rpg.inventory[0].quantity,2)
 }finally{await f.close()}
})
test('R05 Trade UI: новая версия и правка снимают предпросмотр, сохраняя условия и причину',async()=>{
 const f=await fixture()
 try{const a=tradeFixture(f);f.intercept(a.handle);await openTrade(f);await tradeFields();await click('Предпросмотр сделки');await input('[aria-label="Количество сделки"]','1');assert.equal(document.querySelector('[aria-label="Последствия сделки"]'),null)
  await click('Предпросмотр сделки');f.worlds.a.revision++;f.notify();await flush();await click('Управлять имуществом и торговлей');assert.equal(document.querySelector('[aria-label="Последствия сделки"]'),null);assert.equal(document.querySelector('[aria-label="Причина сделки"]').value,'Встреча и покупка разрешены')
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Предпросмотр сделки').disabled);await click('Имущество и условия сверены');await click('Предпросмотр сделки');assert.equal(a.requests.at(-1).body.revision,8)
 }finally{await f.close()}
})
test('R05 Trade UI: потерянная настройка сохраняет команду и не создаёт второго торговца',async()=>{
 const f=await fixture()
 try{const a=tradeFixture(f);let lost=false;f.intercept((url,options)=>{if(url==='/lobbies/a/trade/settings'&&!lost){lost=true;return a.handle(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ настройки потерян')})}return a.handle(url,options)})
  await openTrade(f);await click('Подготовить торговца');await input('[aria-label="Торговец name"]','Один торговец');await input('[aria-label="Причина записи имущества"]','Создать');await click('Сохранить имущество');const first=a.requests[0]
  await f.mount(false);await f.mount(true);await openTrade(f);await click('Подготовить торговца');await click('Проверить запись имущества');assert.deepEqual(a.requests[1],first);assert.equal(f.worlds.a.campaign.trade.merchants.filter(m=>m.name==='Один торговец').length,1)
 }finally{await f.close()}
})
test('R05 Trade UI: поздний секретный ответ и отзыв прав не раскрывают имущество другой комнаты',async()=>{
 const f=await fixture(),late=deferred()
 try{const a=tradeFixture(f);f.intercept((url,options)=>url==='/lobbies/a/trade?view=master'?late.promise:a.handle(url,options));await openTrade(f);await openTrade(f,'b');late.resolve(a.view('a'));await flush();assert(!document.body.textContent.includes('PRIVATE-SHOP-a'))
  await click('Имущество торговца Лавка b');assert(document.body.textContent.includes('PRIVATE-SHOP-b'));await f.role('ASSISTANT');await f.permissions(['economy']);assert.equal(document.querySelector('[aria-label="Редактор имущества"]'),null);assert.equal(document.querySelector('[aria-label="Сделка мастера"]'),null);assert(!document.body.textContent.includes('PRIVATE-SHOP-b'))
 }finally{await f.close()}
})
function atlasFixture(f){
 const model=load('campaignAtlas'),atlases={a:model.emptyAtlas(),b:model.emptyAtlas()},commands=new Map(),requests=[]
 const view=id=>({revision:f.worlds[id].revision,closed:false,atlas:structuredClone(atlases[id]),options:{npcs:[{id:'npc-'+id,name:'PRIVATE-NPC-'+id}],scenes:[{id:'scene-'+id,name:'PRIVATE-SCENE-'+id}]}})
 const handle=(url,options)=>{
  const read=url.match(/^\/lobbies\/([ab])\/atlas(?:\?view=(master|public))?$/)
  if(read&&options?.method!=='POST')return Promise.resolve(read[2]==='master'?view(read[1]):{revision:f.worlds[read[1]].revision,atlas:model.publicAtlas(atlases[read[1]])})
  const write=url.match(/^\/lobbies\/([ab])\/atlas\/(cities|organizations)(?:\/([^/]+))?$/);if(!write)return
  const [,id,kind,target]=write,body=JSON.parse(options.body);requests.push({url,body})
  if(commands.has(body.commandKey))return Promise.resolve({receipt:commands.get(body.commandKey),duplicate:true})
  if(body.revision!==f.worlds[id].revision)return Promise.reject(new (load('onlineClient').NetworkError)(409,'Карточка изменилась'))
  if(target)atlases[id][kind]=atlases[id][kind].map(r=>r.id===target?structuredClone(body.entry):r);else atlases[id][kind].push(structuredClone(body.entry))
  f.worlds[id].campaign.atlas=structuredClone(atlases[id]);f.worlds[id].revision++
  const receipt={id:body.entry.id,revision:f.worlds[id].revision};commands.set(body.commandKey,receipt);return Promise.resolve({receipt,duplicate:false})
 }
 return {atlases,requests,view,handle,model}
}
async function openAtlas(f,id='a',master=true){await f.open(id);await click('Открыть города и организации');if(master)await click('Редактировать города и организации')}
test('R05 Atlas UI: явное раскрытие показывает только публичное описание и обозначение NPC',async()=>{
 const f=await fixture()
 try{const a=atlasFixture(f);f.context.refresh=f.notify;await f.render();f.intercept(a.handle);await openAtlas(f);await click('Подготовить город')
  await input('[aria-label="Карточка name"]','Порт');await input('[aria-label="Карточка summary"]','PUBLIC-CITY-DESCRIPTION');await input('[aria-label="Карточка secret"]','PRIVATE-CITY-NOTE');await input('[aria-label="Причина записи карточки"]','Создать порт')
  await click('Добавить связь с NPC');await selectValue('[aria-label="NPC связи 1"]','npc-a');await flush(()=>document.querySelector('[aria-label="Открыть связь NPC 1"]').click())
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Сохранить карточку города').disabled)
  await input('[aria-label="Публичное имя NPC 1"]','Страж ворот');await input('[aria-label="Роль NPC 1"]','страж');await flush(()=>document.querySelector('[aria-label="Сцена карточки PRIVATE-SCENE-a"]').click());await flush(()=>document.querySelector('[aria-label="Открыть карточку участникам"]').click())
  await click('Сохранить карточку города');await flush();assert.equal(a.atlases.a.cities.length,1);assert(a.requests[0].body.commandKey.startsWith('atlas:'))
  await f.role('PLAYER');assert(document.body.textContent.includes('Страж ворот'));assert(document.body.textContent.includes('PUBLIC-CITY-DESCRIPTION'))
  for(const privateText of ['PRIVATE-CITY-NOTE','PRIVATE-NPC-a','PRIVATE-SCENE-a'])assert(!document.body.textContent.includes(privateText),privateText)
  assert.equal(document.querySelector('[aria-label="Редактор города или организации"]'),null)
 }finally{await f.close()}
})
test('R05 Atlas UI: незавершённые поля, открытая связь без имени и причина переживают смену лобби',async()=>{
 const f=await fixture()
 try{const a=atlasFixture(f);f.intercept(a.handle);await openAtlas(f);await click('Подготовить город');await input('[aria-label="Карточка secret"]','PRIVATE-DRAFT-A');await input('[aria-label="Причина записи карточки"]','Причина A')
  await click('Добавить связь с NPC');await selectValue('[aria-label="NPC связи 1"]','npc-a');await flush(()=>document.querySelector('[aria-label="Открыть связь NPC 1"]').click())
  await input('[aria-label="Карточка name"]','  ');await input('[aria-label="Карточка kind"]','  ');await input('[aria-label="Публичное имя NPC 1"]','  ')
  await openAtlas(f,'b');await click('Подготовить город');assert.equal(document.querySelector('[aria-label="Карточка secret"]').value,'')
  await f.mount(false);await f.mount(true);await openAtlas(f);await click('Подготовить город')
  assert.equal(document.querySelector('[aria-label="Карточка name"]').value,'  ');assert.equal(document.querySelector('[aria-label="Карточка kind"]').value,'  ');assert.equal(document.querySelector('[aria-label="Карточка secret"]').value,'PRIVATE-DRAFT-A');assert.equal(document.querySelector('[aria-label="Причина записи карточки"]').value,'Причина A')
  assert.equal(document.querySelector('[aria-label="Открыть связь NPC 1"]').checked,true);assert.equal(document.querySelector('[aria-label="Публичное имя NPC 1"]').value,'  ');assert.equal(a.requests.length,0)
 }finally{await f.close()}
})
test('R05 Atlas UI: потерянный ответ повторяет сохранённую команду, не создавая второй город',async()=>{
 const f=await fixture()
 try{const a=atlasFixture(f);let lost=false;f.intercept((url,options)=>{if(url==='/lobbies/a/atlas/cities'&&!lost){lost=true;return a.handle(url,options).then(()=>{throw new (load('onlineClient').NetworkError)(0,'Ответ справочника потерян')})}return a.handle(url,options)})
  await openAtlas(f);await click('Подготовить город');await input('[aria-label="Карточка name"]','Один город');await input('[aria-label="Причина записи карточки"]','Создание');await click('Сохранить карточку города');const first=a.requests[0]
  await f.mount(false);await f.mount(true);await openAtlas(f);await click('Подготовить город');await click('Проверить результат команды справочника')
  assert.deepEqual(a.requests[1],first);assert.equal(a.atlases.a.cities.length,1)
 }finally{await f.close()}
})
test('R05 Atlas UI: новая ревизия сохраняет черновик и требует сверки перед записью',async()=>{
 const f=await fixture()
 try{const a=atlasFixture(f);a.atlases.a.cities.push({...a.model.newAtlasEntry('city','city-a'),name:'Город A'});f.intercept(a.handle);await openAtlas(f);await click('Редактировать карточку Город A')
  await input('[aria-label="Карточка secret"]','PRIVATE-MY-EDIT');await input('[aria-label="Причина записи карточки"]','Изменение заметок')
  a.atlases.a.cities[0].secret='PRIVATE-SERVER-CHANGE';f.worlds.a.revision++;f.notify();await flush()
  assert.equal(document.querySelector('[aria-label="Карточка secret"]').value,'PRIVATE-MY-EDIT');assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Сохранить карточку города').disabled)
  await click('Карточка и связи сверены');await click('Сохранить карточку города');assert.equal(a.requests[0].body.revision,8);assert.equal(a.requests[0].body.entry.secret,'PRIVATE-MY-EDIT')
 }finally{await f.close()}
})
test('R05 Atlas UI: поздний ответ другого лобби и отзыв секретного доступа скрывают редактор',async()=>{
 const f=await fixture(),late=deferred()
 try{const a=atlasFixture(f);f.intercept((url,options)=>url==='/lobbies/a/atlas?view=master'?late.promise:a.handle(url,options))
  await openAtlas(f);await openAtlas(f,'b');late.resolve({...a.view('a'),atlas:{...a.model.emptyAtlas(),cities:[{...a.model.newAtlasEntry('city','private-city'),name:'PRIVATE-LATE-CITY',secret:'PRIVATE-LATE-NOTE'}]}});await flush()
  assert(!document.body.textContent.includes('PRIVATE-LATE-CITY'));assert(!document.body.textContent.includes('PRIVATE-LATE-NOTE'))
  await click('Подготовить организацию');await input('[aria-label="Карточка secret"]','PRIVATE-ORG-DRAFT');await f.role('ASSISTANT');await f.permissions(['economy'])
  assert.equal(document.querySelector('[aria-label="Редактор города или организации"]'),null);assert(!document.body.textContent.includes('PRIVATE-ORG-DRAFT'));assert.equal(a.requests.length,0)
 }finally{await f.close()}
})
test('R03 UI: мастер подтверждает привязку; расчёт показывает расход и сохраняет частичную подготовку',async()=>{
 const f=await fixture()
 try {
  executableRule(f,'a');await ruleFields(f,'a');await click('Рассчитать последствия раунда')
  assert(document.querySelector('[aria-label="Последствия предметов и способностей"]'));assert(document.body.textContent.includes('Оплачено'))
  assert.equal(f.worlds.a.characters[0].resources.mana.current,'50');assert.equal(f.executions[0].input.rules[0].binding,'unbound')
  await click('Применить рассчитанный раунд');assert.equal(f.worlds.a.characters[0].resources.mana.current,'43');assert.equal(f.worlds.a.campaign.roundWork.entries[0].amount.remaining.numerator,'3000');assert.equal(f.worlds.a.characters[0].rpg.casts[0].status,'preparing')
 }finally{await f.close()}
})
test('R03 UI: сохранённый заряд выбирается отдельно; выпуск не списывает начальный ресурс повторно',async()=>{
 const f=await fixture()
 try {
  executableRule(f,'a','release');await ruleFields(f,'a','release');await click('Рассчитать последствия раунда');assert(document.querySelector('[aria-label="Последствия предметов и способностей"]'))
  assert.equal(f.worlds.a.characters[0].rpg.effects.length,0);await click('Применить рассчитанный раунд')
  assert.equal(f.worlds.a.characters[0].resources.mana.current,'43');assert.equal(f.worlds.a.characters[0].rpg.effects.length,1);assert.equal(f.worlds.a.characters[0].rpg.casts[0].status,'ended')
 }finally{await f.close()}
})
test('R03 UI: неверное число сохраняется как черновик и блокирует расчёт; правка скрывает старый эффект',async()=>{
 const f=await fixture()
 try {
  executableRule(f,'a','release');await ruleFields(f,'a','release');await click('Рассчитать последствия раунда')
  await input('[aria-label="Локальное повреждение Hero a · 1"]','ошибка')
  assert.equal(document.querySelector('[aria-label="Последствия предметов и способностей"]'),null)
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений')
  assert.equal(document.querySelector('[aria-label="Локальное повреждение Hero a · 1"]').value,'ошибка')
  await flush(()=>document.querySelector('[aria-label="Правила подтверждены Hero a · 1"]').click())
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда').disabled);assert.equal(f.applications.length,0)
 }finally{await f.close()}
})
test('R03 UI: решения разделены по аккаунту/лобби; новая версия требует повторного подтверждения',async()=>{
 const f=await fixture()
 try {
  executableRule(f,'a');executableRule(f,'b');await ruleFields(f,'a');await input('[aria-label="Условия Hero a · 1"]','PRIVATE-A')
  await ruleFields(f,'b');assert.equal(document.querySelector('[aria-label="Условия Hero b · 1"]').value,'')
  await f.open('a');await click('Открыть инструменты заявлений');assert.equal(document.querySelector('[aria-label="Условия Hero a · 1"]').value,'PRIVATE-A')
  f.worlds.a.revision++;f.context.events++;await f.render();await flush();await click('Решения мастера проверены')
  assert.equal(document.querySelector('[aria-label="Правила подтверждены Hero a · 1"]').checked,false)
  f.context.user={id:'other-rule-account'};f.context.events++;await f.render();await flush();await click('Открыть инструменты заявлений')
  assert.equal(document.querySelector('[aria-label="Условия Hero a · 1"]').value,'');assert.equal(f.applications.length,0)
 }finally{await f.close()}
})
test('R03 UI: потеря ответа и перемонтирование возвращают прежний расход/заряд без нового исполнения',async()=>{
 const f=await fixture()
 try {
  executableRule(f,'a');await ruleFields(f,'a');await click('Рассчитать последствия раунда')
  f.intercept((url,options)=>{if(!url.endsWith('/rounds/apply'))return undefined;f.intercept(null);return f.request(url,options).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})})
  await click('Применить рассчитанный раунд');const original=f.applications[0],saved=structuredClone(f.worlds.a.characters[0].rpg.casts)
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений');await click('Проверить результат команды')
  assert.deepEqual(f.applications[1],original);assert.equal(f.worlds.a.characters[0].resources.mana.current,'43');assert.deepEqual(f.worlds.a.characters[0].rpg.casts,saved);assert.equal(f.worlds.a.campaign.seconds,5)
 }finally{await f.close()}
})

function executableDose(f,id) {
 executableRound(f,id);const w=f.worlds[id],a=w.characters[0]
 a.rpg.formulas=[];a.statistics.energyRegeneration='0';a.resources.mana={maximum:'50',current:'40'}
 a.rpg.inventory=[{...load('rpgSchema').emptyItem(),id:'dose',templateId:'dose-template',name:'Доза',category:'consumable',quantity:2,durability:100,equipped:false,
  consumable:{...load('rpgSchema').emptyConsumableEffect(),restore:{mana:7,shadow:0,stamina:0}}}]
 w.campaign.declarations.active.entries[0].actions=[{kind:'item',itemId:'dose',operation:'consume',quantity:1,target:{kind:'self'},note:''}]
}
async function doseFields(f,id,cost='1000') {
 await timelineFields(f,id,'5000',cost);await click('Решения мастера проверены')
 await flush(()=>document.querySelector('[aria-label="Цель доступна Hero '+id+' · 1"]').click())
 await flush(()=>document.querySelector('[aria-label="Правила подтверждены Hero '+id+' · 1"]').click())
}
test('R03 UI расходники: явное подтверждение, предпросмотр дозы и отдельное применение',async()=>{
 const f=await fixture()
 try {
  executableDose(f,'a');await timelineFields(f,'a');await click('Решения мастера проверены')
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда');assert(button.disabled)
  assert(document.querySelector('[aria-label="Эффект расходника Hero a · 1"]').textContent.includes('Мана +7'));assert.equal(document.querySelector('[aria-label="Предмет Hero a · 1"]').value,'consume');assert.equal(document.querySelector('[aria-label="Предмет Hero a · 1"]').disabled,true)
  await flush(()=>document.querySelector('[aria-label="Цель доступна Hero a · 1"]').click());await flush(()=>document.querySelector('[aria-label="Правила подтверждены Hero a · 1"]').click())
  await click('Рассчитать последствия раунда');assert(document.body.textContent.includes('40 → 47'));assert.equal(f.worlds.a.characters[0].rpg.inventory[0].quantity,2)
  await click('Применить рассчитанный раунд');assert.equal(f.worlds.a.characters[0].rpg.inventory[0].quantity,1);assert.equal(f.worlds.a.characters[0].resources.mana.current,'47')
 }finally{await f.close()}
})
test('R03 UI расходники: область/условие сохраняются при перемонтировании; правка отменяет подтверждение',async()=>{
 const f=await fixture()
 try {
  executableDose(f,'a');await doseFields(f,'a');await input('[aria-label="Область Hero a · 1"]','leftArm');await input('[aria-label="Условия Hero a · 1"]','Основание для дозы')
  assert.equal(document.querySelector('[aria-label="Правила подтверждены Hero a · 1"]').checked,false)
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений')
  assert.equal(document.querySelector('[aria-label="Область Hero a · 1"]').value,'leftArm');assert.equal(document.querySelector('[aria-label="Условия Hero a · 1"]').value,'Основание для дозы');assert.equal(document.querySelector('[aria-label="Цель доступна Hero a · 1"]').checked,true)
  assert.equal(f.applications.length,0)
 }finally{await f.close()}
})
test('R03 UI расходники: потерянный ответ повторяет прежнюю команду без второй дозы',async()=>{
 const f=await fixture()
 try {
  executableDose(f,'a');await doseFields(f,'a');await click('Рассчитать последствия раунда')
  f.intercept((url,options)=>{if(!url.endsWith('/rounds/apply'))return undefined;f.intercept(null);return f.request(url,options).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})})
  await click('Применить рассчитанный раунд');const command=f.applications[0]
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений');await click('Проверить результат команды')
  assert.deepEqual(f.applications[1],command);assert.equal(f.worlds.a.characters[0].rpg.inventory[0].quantity,1);assert.equal(f.worlds.a.characters[0].resources.mana.current,'47');assert.equal(f.worlds.a.campaign.seconds,5)
 }finally{await f.close()}
})
test('R03 UI расходники: редактор начинает с нулевого эффекта и сохраняет явные значения',async()=>{
 const tree=createRoot(document.getElementById('root'));let value={...load('rpgSchema').emptyItem(),category:'consumable'},changed=[]
 const Fields=modules(undefined,true)('ConsumableFields').default
 function Editor(){const [state,setState]=React.useState(value);return React.createElement(Fields,{value:state,onChange:next=>{value=next;changed.push(next);setState(next)}})}
 try {
  await flush(()=>tree.render(React.createElement(Editor)))
  const enable=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Задать эффект расходника')).querySelector('input');await flush(()=>enable.click())
  assert.equal(value.consumable.restore.mana,0);assert.equal(value.consumable.healAmount,0);assert.equal(value.consumable.duration,0)
  await selectValue('[aria-label="Разрешённая цель расходника"]','creature')
  const mana=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Восстановление: Мана')).querySelector('input');mana.setAttribute('aria-label','editor-dose-mana');await input('[aria-label="editor-dose-mana"]','7')
  assert.equal(value.consumable.targets,'creature');assert.equal(value.consumable.restore.mana,7);assert(changed.length>=3)
 }finally{await flush(()=>tree.unmount());localStorage.clear()}
})

function executableSpatial(f,id) {
 executableRule(f,id);const w=f.worlds[id],a=w.characters[0]
 a.rpg.abilities[0].spatial={shape:'sphere',includeCaster:false,radiusM:1}
 w.characters.push({...createDefaultCharacter(),id:'npc-b-'+id,name:'NPC B'},{...createDefaultCharacter(),id:'npc-c-'+id,name:'NPC C'})
 for(const c of w.characters.slice(1)){c.rpg.formulas=[];c.statistics.energyRegeneration='0';Object.assign(c.body.parts.torso,{maximum:100,current:50})}
 w.campaign.scenes=load('scenes').createScene(load('scenes').emptyScenes(),'scene-'+id,'Scene','top')
 w.campaign.scenes.scenes[0].tokens=[{actorId:a.id,x:2,y:2,z:0},{actorId:'npc-b-'+id,x:8,y:2,z:0},{actorId:'npc-c-'+id,x:9,y:2,z:0}].map(t=>({...t,diameter:1,support:{kind:'ground'}}))
 const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''},c=w.campaign.declarations.active
 const result=load('roundExecution').calculateRound(w,c,{timings:[{actorId:a.id,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:'+a.id+':0',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields}]},'ui-space-ready-'+id)
 w.characters=result.world.characters;w.campaign=result.world.campaign;w.campaign.declarations.active.entries[0].actions=[{kind:'ability',abilityId:'spell',stage:'release',target:{kind:'area',point:{x:8,y:2,z:0}},note:''}]
}
async function spatialFields(f,id) {
 await timelineFields(f,id);await click('Решения мастера проверены');const title='Hero '+id+' · 1'
 await selectValue('[aria-label="Заряд '+title+'"]','cast:'+f.worlds[id].characters[0].rpg.casts[0].id)
 await flush(()=>document.querySelector('[aria-label="Цель доступна '+title+'"]').click())
 await flush(()=>document.querySelector('[aria-label="Пространство подтверждено '+title+'"]').click())
 await flush(()=>document.querySelector('[aria-label="Правила подтверждены '+title+'"]').click())
}
test('Пространство UI: мастер подтверждает геометрию и видит всех получателей до применения',async()=>{
 const f=await fixture()
 try {
  executableSpatial(f,'a');await ruleFields(f,'a','release')
  const calculate=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда');assert(calculate().disabled)
  assert(document.body.textContent.includes('Сфера · радиус 1 м'))
  await flush(()=>document.querySelector('[aria-label="Пространство подтверждено Hero a · 1"]').click());await flush(()=>document.querySelector('[aria-label="Правила подтверждены Hero a · 1"]').click())
  await click('Рассчитать последствия раунда');const result=document.querySelector('[aria-label="Цели пространственного выпуска"]');assert(result);assert(result.textContent.includes('Получателей: 2'));assert(result.textContent.includes('NPC B'));assert(result.textContent.includes('NPC C'))
  assert.equal(f.worlds.a.characters[1].rpg.effects.length,0);await click('Применить рассчитанный раунд');assert.equal(f.worlds.a.characters[1].rpg.effects.length,1);assert.equal(f.worlds.a.characters[2].rpg.effects.length,1);assert.equal(f.worlds.a.characters[0].resources.mana.current,'43')
 }finally{await f.close()}
})
test('Пространство UI: индивидуальный неверный ввод сохраняется и не смешивается между лобби',async()=>{
 const f=await fixture()
 try {
  executableSpatial(f,'a');executableSpatial(f,'b');await spatialFields(f,'a')
  await flush(()=>document.querySelector('[aria-label="Отдельные параметры NPC C · Hero a · 1"]').click())
  await input('[aria-label="Локальное повреждение цели NPC C · Hero a · 1"]','1e-')
  assert.equal(document.querySelector('[aria-label="Пространство подтверждено Hero a · 1"]').checked,false)
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений')
  assert.equal(document.querySelector('[aria-label="Локальное повреждение цели NPC C · Hero a · 1"]').value,'1e-')
  await flush(()=>document.querySelector('[aria-label="Пространство подтверждено Hero a · 1"]').click());await flush(()=>document.querySelector('[aria-label="Правила подтверждены Hero a · 1"]').click())
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда').disabled)
  await spatialFields(f,'b');assert.equal(document.querySelector('[aria-label="Локальное повреждение цели NPC C · Hero b · 1"]'),null);assert.equal(f.applications.length,0)
 }finally{await f.close()}
})
test('Пространство UI: потерянный ответ повторяет тот же выпуск и сохраняет список целей',async()=>{
 const f=await fixture()
 try {
  executableSpatial(f,'a');await spatialFields(f,'a');await click('Рассчитать последствия раунда')
  f.intercept((url,options)=>{if(!url.endsWith('/rounds/apply'))return undefined;f.intercept(null);return f.request(url,options).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})})
  await click('Применить рассчитанный раунд');const command=f.applications[0],release=structuredClone(f.worlds.a.characters[0].rpg.casts[0].spatialRelease)
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений');await click('Проверить результат команды')
  assert.deepEqual(f.applications[1],command);assert.deepEqual(f.worlds.a.characters[0].rpg.casts[0].spatialRelease,release);assert.equal(f.worlds.a.characters[1].rpg.effects.length,1);assert.equal(f.worlds.a.characters[2].rpg.effects.length,1);assert.equal(f.worlds.a.characters[0].resources.mana.current,'43')
 }finally{await f.close()}
})
test('Пространство UI: игрок сохраняет область/направление и незавершённую высоту как выбранные координаты',async()=>{
 const f=await fixture()
 try {
  await ownActions(f,'a');f.declarations.a.options.abilities=[{id:'sphere',name:'Сфера',spatial:{shape:'sphere',includeCaster:false,radiusM:1}},{id:'beam',name:'Луч',spatial:{shape:'beam',includeCaster:false,lengthM:6,radiusM:1}}]
  f.context.events++;await f.render();await flush()
  await selectValue('[aria-label="Категория действия"]','ability');await selectValue('[aria-label="Способность для действия"]','sphere');await selectValue('[aria-label="Этап способности"]','release');await selectValue('[aria-label="Вид цели"]','area')
  await input('[aria-label="Действие X"]','8');await input('[aria-label="Действие Y"]','2');await input('[aria-label="Действие Z"]','1e-')
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть экран героя');assert.equal(document.querySelector('[aria-label="Действие Z"]').value,'1e-')
  assert.equal(document.querySelector('[aria-label="Способность для действия"]').value,'sphere')
  await input('[aria-label="Действие Z"]','3');await click('Добавить действие в последовательность');assert(document.body.textContent.includes('Область (8; 2; 3)'))
  await selectValue('[aria-label="Способность для действия"]','beam');await selectValue('[aria-label="Вид цели"]','direction');await input('[aria-label="Действие X"]','7');await click('Добавить действие в последовательность')
  await click('Отправить заявление');assert.deepEqual(f.writes.at(-1).actions.map(a=>a.target),[{kind:'area',point:{x:8,y:2,z:3}},{kind:'direction',point:{x:7,y:2,z:3}}])
 }finally{await f.close()}
})
test('Пространство UI: редактор требует явных размеров и сохраняет форму/выбор применяющего',async()=>{
 const tree=createRoot(document.getElementById('root'));let value={...load('rpgSchema').emptyAbility(),name:'Test',rangeM:10};const Fields=modules(undefined,true)('AbilitySpatialFields').default
 function render(){tree.render(React.createElement(Fields,{value,onChange:next=>{value=next;render()}}))}
 try {
  await flush(render);await selectValue('[aria-label="Форма пространственного выпуска"]','cone');assert.equal(load('rpgSchema').isAbility(value),false)
  for(const [label,text] of [['Длина по оси эффекта','6'],['Полный угол конуса','60']]){const field=[...document.querySelectorAll('label')].find(l=>l.textContent.includes(label)).querySelector('input');field.setAttribute('aria-label','spatial-editor-field');await input('[aria-label="spatial-editor-field"]',text);field.removeAttribute('aria-label')}
  const include=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Эффект может затронуть применяющего')).querySelector('input');await flush(()=>include.click())
  assert(load('rpgSchema').isAbility(value));assert.deepEqual(value.spatial,{shape:'cone',includeCaster:true,lengthM:6,angleDeg:60})
 }finally{await flush(()=>tree.unmount());localStorage.clear()}
})

function executableCharge(f,id,preparing=false) {
 executableRule(f,id);const w=f.worlds[id],a=w.characters[0],c=w.campaign.declarations.active
 a.rpg.abilities[0].chargePolicy={maxHoldSeconds:100,holdCost:{mana:2,shadow:0,stamina:0},requireConditions:false,refundPreparingPercent:50,refundReadyPercent:25}
 const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:0,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''}
 const result=load('roundExecution').calculateRound(w,c,{timings:[{actorId:a.id,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:preparing?8000:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:'+a.id+':0',kind:'ability',confirmed:true,binding:'unbound',charge:'',input:fields}]},'ui-hold-'+id)
 w.characters=result.world.characters;w.campaign=result.world.campaign
 w.campaign.declarations.active.entries=preparing?[]:[{...c.entries[0],actions:[{kind:'ability',abilityId:'spell',stage:'release',target:{kind:'self'},note:''}]}]
}
async function interruptionFields(f,id,reason='Остановить подготовку') {
 await f.open(id);await click('Открыть инструменты заявлений');await click('Продолжить работу Hero '+id)
 await selectValue('[aria-label="Решение по заряду Hero '+id+' · Заряд"]','interrupt')
 await input('[aria-label="Причина прерывания Hero '+id+' · Заряд"]',reason)
 await input('[aria-label="Решение для Hero '+id+'"]','Мастер отменил подготовку')
 await flush(()=>document.querySelector('[aria-label="Заряд подтверждён Hero '+id+' · Заряд"]').click())
}
test('Удержание UI: подтверждение заряда обязательно, выпуск останавливает секундный расход',async()=>{
 const f=await fixture()
 try {
  executableCharge(f,'a');await ruleFields(f,'a','release');const calculate=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда');assert(calculate().disabled)
  await selectValue('[aria-label="Решение по заряду Hero a · Заряд"]','keep');await flush(()=>document.querySelector('[aria-label="Заряд подтверждён Hero a · Заряд"]').click())
  await click('Рассчитать последствия раунда');assert(document.body.textContent.includes('Заряд: сохранён'));assert.equal(f.worlds.a.characters[0].resources.mana.current,'35')
  await click('Применить рассчитанный раунд');assert.equal(f.worlds.a.characters[0].resources.mana.current,'33');assert.equal(f.worlds.a.characters[0].rpg.casts[0].status,'ended')
 }finally{await f.close()}
})
test('Удержание UI: незавершённая причина сохраняется, комнаты разделены, правка снимает подтверждение',async()=>{
 const f=await fixture()
 try {
  executableCharge(f,'a',true);executableCharge(f,'b',true);await interruptionFields(f,'a','   ')
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Рассчитать последствия раунда').disabled)
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений');assert.equal(document.querySelector('[aria-label="Причина прерывания Hero a · Заряд"]').value,'   ')
  await f.open('b');await click('Открыть инструменты заявлений');assert.equal(document.querySelector('[aria-label="Причина прерывания Hero b · Заряд"]'),null)
  await f.open('a');await click('Открыть инструменты заявлений');await input('[aria-label="Причина прерывания Hero a · Заряд"]','Остановить по решению мастера');assert.equal(document.querySelector('[aria-label="Заряд подтверждён Hero a · Заряд"]').checked,false)
  await flush(()=>document.querySelector('[aria-label="Заряд подтверждён Hero a · Заряд"]').click());await click('Рассчитать последствия раунда');assert(document.body.textContent.includes('Снято действий: 1.'));assert.equal(f.applications.length,0)
 }finally{await f.close()}
})
test('Удержание UI: потерянный ответ и перемонтирование не дублируют возврат платежа',async()=>{
 const f=await fixture()
 try {
  executableCharge(f,'a',true);await interruptionFields(f,'a');await click('Рассчитать последствия раунда')
  f.intercept((url,options)=>{if(!url.endsWith('/rounds/apply'))return undefined;f.intercept(null);return f.request(url,options).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})})
  await click('Применить рассчитанный раунд');const command=f.applications[0];assert.equal(f.worlds.a.characters[0].resources.mana.current,'46.5')
  await f.mount(false);await f.mount(true);await flush();await f.open('a');await click('Открыть инструменты заявлений');await click('Проверить результат команды')
  assert.deepEqual(f.applications[1],command);assert.equal(f.worlds.a.characters[0].resources.mana.current,'46.5');assert.equal(f.worlds.a.campaign.roundWork.entries.length,0)
 }finally{await f.close()}
})
test('Удержание UI: реальный редактор проверяет срок и сохраняет отдельные затраты/доли возврата',async()=>{
 const tree=createRoot(document.getElementById('root'));let value={...load('rpgSchema').emptyAbility(),name:'Test'};const Fields=modules(undefined,true)('AbilityChargeFields').default
 function render(){tree.render(React.createElement(Fields,{value,onChange:next=>{value=next;render()}}))}
 async function number(label,text){const field=[...document.querySelectorAll('label')].find(l=>l.textContent.includes(label)).querySelector('input');field.setAttribute('aria-label','charge-number');await input('[aria-label="charge-number"]',text);field.removeAttribute('aria-label')}
 try {
  await flush(render);await flush(()=>[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Задать условия заряда')).querySelector('input').click())
  await selectValue('[aria-label="Срок готового заряда"]','limited');assert.equal(load('rpgSchema').isAbility(value),false)
  await number('Срок удержания готового заряда','20');await number('Удержание: Мана','1.5');await number('прерывании подготовки','75');await number('прерывании готового заряда','25')
  assert(load('rpgSchema').isAbility(value));assert.deepEqual(value.chargePolicy,{maxHoldSeconds:20,holdCost:{mana:1.5,shadow:0,stamina:0},requireConditions:false,refundPreparingPercent:75,refundReadyPercent:25})
 }finally{await flush(()=>tree.unmount());localStorage.clear()}
})

function historyFixture(f,rooms,rollbackState=null) {
 const previews=new Map(),commands=new Map(),calls=[],generations={a:1,b:1};let replay=null,index=0
 function value(id){const w=f.worlds[id];return {revision:w.revision,generation:generations[id],closed:false,canRollback:true,latestId:rollbackState&&id==='a'&&!replay?'original-round':null,actors:w.characters.map(a=>({id:a.id,name:a.name})),rounds:rollbackState&&!replay?[{id:'original-round',author_id:f.accountId,applied_revision:8,applied_at:'2026-10-12T00:00:00Z'}]:[],replay:replay&&id==='a'?{receiptId:'original-round',parameters:rollbackState.input}:null,work:(w.campaign.roundWork?.entries??[]).map(e=>({id:e.id,actorId:e.actorId,name:w.characters.find(a=>a.id===e.actorId)?.name,kind:e.action.kind})),declarations:[]}}
 const handler=(url,options)=>{
  const match=url.match(/^\/lobbies\/([ab])\/rounds\/(.+)$/);if(!match||!rooms.includes(match[1]))return undefined
  const [,id,operation]=match,w=f.worlds[id],body=options?.body?JSON.parse(options.body):null
  if(operation==='history')return structuredClone(value(id))
  if(operation==='cancel/calculate'){
   const result=load('roundCancellation').cancelPendingActions(w,body,'ui-cancel-'+(++index),f.accountId,'2026-10-12T00:00:00Z',true),p={id:'history-preview-'+index,revision:w.revision,generation:generations[id],summary:result.summary};previews.set(p.id,{p,world:result.world,id,kind:'change'});return p
  }
  if(operation==='rollback/calculate'){
   const p={id:'history-rollback-'+(++index),revision:w.revision,generation:generations[id],summary:{operation:'rollback',reason:body.reason,fromSeconds:w.campaign.seconds,toSeconds:rollbackState.before.campaign.seconds,characters:[{actorId:w.characters[0].id,name:w.characters[0].name,fields:['тело','инвентарь, заряды и эффекты']}],sections:['игровое время','журнал мира'],includesLaterChanges:false,canReplay:true}};previews.set(p.id,{p,world:structuredClone(rollbackState.before),id,kind:'change'});return p
  }
  if(operation==='replay/calculate'){
   const result=load('roundExecution').calculateRound(w,w.campaign.declarations.active,rollbackState.input,rollbackState.seed),p={id:'history-replay-'+(++index),revision:w.revision,generation:generations[id],collectionId:w.campaign.declarations.active.id,epoch:w.campaign.declarations.active.epoch,summary:result.summary};previews.set(p.id,{p,world:result.world,id,kind:'round'});return p
  }
  if(operation==='change/apply'||operation==='apply'&&previews.has(body.previewId)){
   calls.push({operation,...body});const old=commands.get(body.commandKey);if(old)return {receipt:old,duplicate:true}
   const p=previews.get(body.previewId);assert(p,'missing preview');f.worlds[id]={...p.world,revision:w.revision+1};if(p.p.summary.operation==='rollback'){generations[id]++;replay=true}else if(p.kind==='round')replay=false
   const receipt={id:'history-receipt-'+index,revision:w.revision+1,generation:generations[id],summary:p.p.summary};commands.set(body.commandKey,receipt);return {receipt,duplicate:false}
  }
  return undefined
 }
 f.context.refresh=f.notify;f.intercept(handler);return {handler,calls,value}
}
async function openHistory(f,id){await f.render();await f.open(id);await click('Открыть историю и отмену');await flush()}
async function cancelFields(f,id){await openHistory(f,id);await input('[aria-label="Причина отмены или отката"]','Отменить подготовку');await flush(()=>[...document.querySelectorAll('input[aria-label]')].find(x=>x.getAttribute('aria-label').startsWith('Отменить остаток Hero '+id)).click());await click('Предпросмотр отмены действий')}
test('История UI: отмена показывает возврат и не меняет подготовку до явного применения',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);historyFixture(f,['a']);await cancelFields(f,'a')
  assert(document.querySelector('[aria-label="Предпросмотр изменения истории"]'));assert(document.body.textContent.includes('возврат: Мана 3.5'));assert.equal(f.worlds.a.characters[0].resources.mana.current,'43')
  const apply=[...document.querySelectorAll('button')].find(b=>b.textContent==='Применить изменение истории');assert(apply.disabled)
  await flush(()=>document.querySelector('[aria-label="Последствия истории проверены"]').click());await click('Применить изменение истории');assert.equal(f.worlds.a.characters[0].resources.mana.current,'46.5');assert.equal(f.worlds.a.campaign.roundWork.entries.length,0)
 }finally{await f.close()}
})
test('История UI: причины разделены по лобби, сохраняются; поздний предпросмотр не смешивает комнаты',async()=>{
 const f=await fixture(),late=deferred()
 try{
  executableCharge(f,'a',true);executableCharge(f,'b',true);const h=historyFixture(f,['a','b']);await openHistory(f,'a');await input('[aria-label="Причина отмены или отката"]','Причина A')
  await flush(()=>[...document.querySelectorAll('input[aria-label]')].find(x=>x.getAttribute('aria-label').startsWith('Отменить остаток Hero a')).click());const p=h.handler('/lobbies/a/rounds/cancel/calculate',{body:JSON.stringify({workIds:[f.worlds.a.campaign.roundWork.entries[0].id],actorIds:[],reason:'Причина A'})})
  f.intercept((url,options)=>url.endsWith('/cancel/calculate')?late.promise:h.handler(url,options));await click('Предпросмотр отмены действий');await openHistory(f,'b');await input('[aria-label="Причина отмены или отката"]','Причина B');late.resolve(p);await flush()
  assert.equal(document.querySelector('[aria-label="Предпросмотр изменения истории"]'),null);assert.equal(document.querySelector('[aria-label="Причина отмены или отката"]').value,'Причина B')
  await f.mount(false);await f.mount(true);await flush();await openHistory(f,'a');assert.equal(document.querySelector('[aria-label="Причина отмены или отката"]').value,'Причина A')
 }finally{await f.close()}
})
test('История UI: потерянный ответ и перемонтирование повторяют тот же ключ без второго возврата',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=historyFixture(f,['a']);await cancelFields(f,'a');await flush(()=>document.querySelector('[aria-label="Последствия истории проверены"]').click())
  f.intercept((url,options)=>{const result=h.handler(url,options);if(url.endsWith('/change/apply')){f.intercept(h.handler);return Promise.resolve(result).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})}return result})
  await click('Применить изменение истории');assert.equal(f.worlds.a.characters[0].resources.mana.current,'46.5');const command=h.calls[0]
  await f.mount(false);await f.mount(true);await flush();await openHistory(f,'a');await click('Проверить команду истории');assert.deepEqual(h.calls[1],command);assert.equal(f.worlds.a.characters[0].resources.mana.current,'46.5')
 }finally{await f.close()}
})
test('История UI: откат и переигровка показывают прежние броски, применение использует отдельный расчёт',async()=>{
 const f=await fixture()
 try{
  executableRule(f,'a','release');const w=f.worlds.a,a=w.characters[0],c=w.campaign.declarations.active;Object.assign(a.body.parts.torso,{maximum:100,current:50});a.rpg.casts[0].ability.mechanism='manual'
  const fields={region:'torso',distanceM:0,accessible:true,conditionsConfirmed:true,canSpeak:true,armorPath:'covered',gapConfirmed:false,criticalChance:0,dodgeChance:0,criticalContactFactor:1,manualLocal:10,manualSystemic:0,bleedingMlPerSecond:0,injury:'',note:''},roundInput={timings:[{actorId:a.id,entryRevision:1,budgetMs:5000,costs:[{index:0,personalMs:1000}]}],continuations:[],missingDecisions:[],interactionsConfirmed:false,rules:[{key:'new:'+a.id+':0',kind:'ability',confirmed:true,binding:'unbound',charge:'cast:'+a.rpg.casts[0].id,input:fields}]},before=structuredClone(w),seed='ui-replay-seed',original=load('roundExecution').calculateRound(w,c,roundInput,seed)
  f.worlds.a={...original.world,revision:8};const h=historyFixture(f,['a'],{before,input:roundInput,seed});await openHistory(f,'a');await input('[aria-label="Причина отмены или отката"]','Переиграть удар');await click('Предпросмотр отката последнего раунда');assert(document.body.textContent.includes('Игровое время: 10 → 5 с.'));assert(f.worlds.a.characters[0].body.parts.torso.current<50)
  await flush(()=>document.querySelector('[aria-label="Последствия истории проверены"]').click());await click('Применить изменение истории');await flush();assert.equal(f.worlds.a.characters[0].body.parts.torso.current,50)
  await click('История проверена с текущей версией');await click('Рассчитать переигровку с прежними бросками');const rolls=original.summary.rules[0].rolls;assert(document.body.textContent.includes('Броски: '+rolls.join('; ')))
  await flush(()=>document.querySelector('[aria-label="Последствия истории проверены"]').click());await click('Применить изменение истории');assert.equal(h.calls.at(-1).operation,'apply');assert.equal(f.worlds.a.characters[0].body.parts.torso.current,original.world.characters[0].body.parts.torso.current)
 }finally{await f.close()}
})
test('История UI: отзыв секретного доступа скрывает историю и поздний предпросмотр',async()=>{
 const f=await fixture(),late=deferred()
 try{
  executableCharge(f,'a',true);await f.role('ASSISTANT');await f.permissions(['rounds','viewSecrets','rollback']);const h=historyFixture(f,['a']);await openHistory(f,'a');await input('[aria-label="Причина отмены или отката"]','PRIVATE-HISTORY-REASON')
  await flush(()=>[...document.querySelectorAll('input[aria-label]')].find(x=>x.getAttribute('aria-label').startsWith('Отменить остаток Hero a')).click())
  const p=h.handler('/lobbies/a/rounds/cancel/calculate',{body:JSON.stringify({workIds:[f.worlds.a.campaign.roundWork.entries[0].id],actorIds:[],reason:'PRIVATE-HISTORY-REASON'})});f.intercept((url,options)=>url.endsWith('/cancel/calculate')?late.promise:h.handler(url,options))
  await click('Предпросмотр отмены действий');await f.permissions(['rounds']);late.resolve(p);await flush();assert.equal(document.querySelector('[aria-label="История и отмена действий"]'),null);assert(!document.body.textContent.includes('PRIVATE-HISTORY-REASON'));assert.equal(h.calls.length,0)
 }finally{await f.close()}
})

function continuationFixture(f){
 const rounds={a:[{id:'r3',author_id:f.accountId,applied_revision:9,applied_at:'2026-10-12T00:03:00Z'},{id:'r2',author_id:f.accountId,applied_revision:8,applied_at:'2026-10-12T00:02:00Z'},{id:'r1',author_id:f.accountId,applied_revision:7,applied_at:'2026-10-12T00:01:00Z'}],b:[]},checkpoints={a:[],b:[]},paused={a:false,b:false},generations={a:1,b:1},commands=new Map(),previews=new Map(),calls=[];let next=0
 function view(id){const w=f.worlds[id];return {revision:w.revision,generation:generations[id],session:{paused:paused[id],reason:'Перерыв друзей'},checkpoints:checkpoints[id].map(({snapshot:_snapshot,...p})=>p),closed:false,canRollback:true,latestId:rounds[id][0]?.id??null,actors:w.characters.map(a=>({id:a.id,name:a.name})),rounds:rounds[id],replay:null,work:[],declarations:[]}}
 function handler(url,options){
  const match=url.match(/^\/lobbies\/([ab])\/rounds\/(.+)$/);if(!match)return undefined
  const [,id,operation]=match,body=options?.body?JSON.parse(options.body):null,w=f.worlds[id]
  if(operation==='history')return structuredClone(view(id))
  if(operation==='checkpoints'||operation==='pause'){
   calls.push({id,operation,...body});if(commands.has(body.commandKey))return {...commands.get(body.commandKey),duplicate:true}
   let result
   if(operation==='checkpoints'){const p={id:'cp-'+(++next),name:body.name,source_revision:w.revision,created_at:'2026-10-12T00:00:00Z',snapshot:structuredClone(w)};checkpoints[id].push(p);result={checkpoint:p,duplicate:false}}
   else {paused[id]=body.paused;f.worlds[id]={...w,revision:w.revision+1};result={receipt:{id:'pause-'+(++next)},duplicate:false}}
   commands.set(body.commandKey,result);return result
  }
  if(operation==='rollback/calculate'){
   calls.push({id,operation,...body});const cp=checkpoints[id].find(c=>c.id===body.checkpointId),index=rounds[id].findIndex(r=>r.id===body.receiptId),removed=cp?[]:rounds[id].slice(0,index+1).toReversed()
   const target=cp?structuredClone(cp.snapshot):{...structuredClone(w),campaign:{...structuredClone(w.campaign),seconds:index===2?0:5}},p={id:'continuation-preview-'+(++next),revision:w.revision,generation:generations[id],summary:{operation:'rollback',reason:body.reason,checkpointName:cp?.name,fromSeconds:w.campaign.seconds,toSeconds:target.campaign.seconds,characters:[],sections:['игровое время'],includesLaterChanges:true,canReplay:false,removedRounds:removed.map(r=>({id:r.id,revision:r.applied_revision,appliedAt:r.applied_at})),restoredRoundIds:[],affectedChanges:[{id:'cancel-1',revision:10,operation:'cancel',reason:'Отмена после раунда'}]}};previews.set(p.id,{target,p,removed});return p
  }
  if(operation==='change/apply'){
   calls.push({id,operation,...body});if(commands.has(body.commandKey))return {...commands.get(body.commandKey),duplicate:true}
   const p=previews.get(body.previewId);assert(p);f.worlds[id]={...p.target,revision:w.revision+1};rounds[id]=rounds[id].filter(r=>!p.removed.some(x=>x.id===r.id));generations[id]++;const result={receipt:{id:'change-'+next},duplicate:false};commands.set(body.commandKey,result);return result
  }
  return undefined
 }
 f.context.refresh=f.notify;f.intercept(handler);return {handler,calls,paused,checkpoints,view}
}
test('Продолжение UI: выбор раннего раунда показывает весь зависимый хвост и требует подтверждения',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=continuationFixture(f);f.worlds.a.campaign.seconds=15;const before=structuredClone(f.worlds.a)
  await openHistory(f,'a');await input('[aria-label="Причина отмены или отката"]','Откат к первому');await selectValue('[aria-label="Раунд для отката"]','r1');await click('Предпросмотр отката выбранного раунда')
  assert.equal(h.calls[0].receiptId,'r1');assert(document.body.textContent.includes('Будут сняты раунды: 3.'));assert(document.body.textContent.includes('Отмена после раунда'));assert.deepEqual(f.worlds.a,before)
  const applyButton=[...document.querySelectorAll('button')].find(b=>b.textContent==='Применить изменение истории');assert(applyButton.disabled)
  await flush(()=>document.querySelector('[aria-label="Последствия истории проверены"]').click());await click('Применить изменение истории');assert.equal(f.worlds.a.campaign.seconds,0);assert.equal(h.view('a').rounds.length,0)
 }finally{await f.close()}
})
test('Продолжение UI: именованная точка восстанавливается через предпросмотр, сохраняя паузу',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=continuationFixture(f);await openHistory(f,'a');await input('[aria-label="Название контрольной точки"]','У входа в город');await click('Сохранить контрольную точку');const saved=structuredClone(f.worlds.a)
  assert.equal(h.checkpoints.a.length,1);assert.deepEqual(f.worlds.a,saved)
  f.worlds.a={...f.worlds.a,revision:f.worlds.a.revision+1,campaign:{...f.worlds.a.campaign,seconds:20}};h.paused.a=true;await flush(f.notify);await click('История проверена с текущей версией')
  await input('[aria-label="Причина отмены или отката"]','Вернуться к городу');await selectValue('[aria-label="Контрольная точка для восстановления"]',h.checkpoints.a[0].id);await click('Предпросмотр восстановления точки')
  assert(document.body.textContent.includes('Контрольная точка: У входа в город.'));assert.equal(f.worlds.a.campaign.seconds,20)
  await flush(()=>document.querySelector('[aria-label="Последствия истории проверены"]').click());await click('Применить изменение истории');assert.equal(f.worlds.a.campaign.seconds,saved.campaign.seconds);assert(h.paused.a)
 }finally{await f.close()}
})
test('Продолжение UI: потерянное сохранение точки повторяется после возврата с тем же ключом',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=continuationFixture(f);await openHistory(f,'a');await input('[aria-label="Название контрольной точки"]','Перед перерывом')
  f.intercept((url,options)=>{const result=h.handler(url,options);if(url.endsWith('/checkpoints')){f.intercept(h.handler);return Promise.resolve(result).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})}return result})
  await click('Сохранить контрольную точку');assert.equal(h.checkpoints.a.length,1);const body=h.calls[0]
  await f.mount(false);await f.mount(true);await flush();await openHistory(f,'a');await click('Проверить команду кампании');assert.deepEqual(h.calls[1],body);assert.equal(h.checkpoints.a.length,1)
 }finally{await f.close()}
})
test('Продолжение UI: пауза и продолжение не меняют время и подготовку, требуют свежей версии',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=continuationFixture(f),before=structuredClone(f.worlds.a.campaign);await openHistory(f,'a');await input('[aria-label="Причина отмены или отката"]','Перерыв друзей');await click('Поставить кампанию на паузу')
  assert(h.paused.a);assert(document.body.textContent.includes('Кампания на паузе.'));assert.deepEqual(f.worlds.a.campaign,before)
  assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Продолжить кампанию').disabled);await click('История проверена с текущей версией');await click('Продолжить кампанию');assert(!h.paused.a);assert.deepEqual(f.worlds.a.campaign,before)
 }finally{await f.close()}
})
test('Продолжение UI: имя точки и незавершённая команда принадлежат своей комнате',async()=>{
 const f=await fixture(),late=deferred()
 try{
  executableCharge(f,'a',true);executableCharge(f,'b',true);const h=continuationFixture(f);await openHistory(f,'a');await input('[aria-label="Название контрольной точки"]','PRIVATE-POINT-A')
  f.intercept((url,options)=>url==='/lobbies/a/rounds/checkpoints'?late.promise:h.handler(url,options));await click('Сохранить контрольную точку');await openHistory(f,'b');assert.equal(document.querySelector('[aria-label="Название контрольной точки"]').value,'');assert(!document.body.textContent.includes('PRIVATE-POINT-A'))
  await input('[aria-label="Название контрольной точки"]','Точка B');late.resolve({duplicate:false});await flush();assert.equal(document.querySelector('[aria-label="Название контрольной точки"]').value,'Точка B');assert(!document.body.textContent.includes('Контрольная точка сохранена.'))
  await openHistory(f,'a');assert.equal(document.querySelector('[aria-label="Название контрольной точки"]').value,'PRIVATE-POINT-A');assert([...document.querySelectorAll('button')].some(b=>b.textContent==='Проверить команду кампании'))
 }finally{await f.close()}
})

function archiveFixture(f){
 const calls=[],commands=new Map(),previews=new Map();let index=0
 const handler=(url,options)=>{
  const match=url.match(/^\/lobbies\/([ab])\/archive(?:\/(.+))?$/);if(!match)return undefined
  const [,id,operation]=match
  if(operation==='recoveries')return []
  if(operation?.startsWith('calculate?revision=')){
   calls.push({id,operation:'calculate',headers:options.headers,file:options.body});const w=f.worlds[id],p={id:'archive-preview-'+(++index),generation:1,revision:w.revision,summary:{fromSeconds:w.campaign.seconds,toSeconds:2,characters:w.characters.map(a=>({id:a.id,name:a.name})),rounds:3,changes:2,activeRounds:1,resources:[{actorId:'hero-'+id,name:'Hero '+id,label:'Мана',from:{current:'40',maximum:'50'},to:{current:'30',maximum:'50'}}],sections:['сцены и позиции'],checkpoints:['PRIVATE-ARCHIVE-POINT-'+id],paused:true,fromPaused:false,oldRounds:5,oldCheckpoints:4}};previews.set(p.id,{p,id});return p
  }
  if(operation==='apply'){
   const body=JSON.parse(options.body);calls.push({id,operation,...body});if(commands.has(body.commandKey))return {duplicate:true,receipt:commands.get(body.commandKey)}
   assert.equal(previews.get(body.previewId)?.id,id);f.worlds[id]={...f.worlds[id],revision:f.worlds[id].revision+1,campaign:{...f.worlds[id].campaign,seconds:2}};const receipt={id:'restore-'+index};commands.set(body.commandKey,receipt);return {duplicate:false,receipt}
  }
  return undefined
 }
 f.context.refresh=f.notify;f.intercept(handler);return {handler,calls}
}
async function openComplete(f,id){await f.render();await f.open(id);await click('Открыть полные копии');await flush()}
async function archiveFile(file={size:100,name:'save.w6.gz'}){const field=document.querySelector('[aria-label="Файл полной игровой копии"]');assert(field);await flush(()=>{Object.defineProperty(field,'files',{configurable:true,value:[file]});field.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
async function restoreFields(){await archiveFile();await input('[aria-label="Причина восстановления полной копии"]','Вернуться к прошлому сеансу');await flush(()=>document.querySelector('[aria-label="Последствия полной копии проверены"]').click())}
test('Полная копия UI: последствия показаны, применение требует причины и подтверждения',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=archiveFixture(f),before=structuredClone(f.worlds.a);await openComplete(f,'a');await archiveFile();assert.deepEqual(f.worlds.a,before);assert.equal(h.calls[0].headers['Content-Type'],'application/gzip');assert(document.body.textContent.includes('PRIVATE-ARCHIVE-POINT-a'));assert(document.body.textContent.includes('Пауза после восстановления: включена.'));assert(document.body.textContent.includes('Мана: 40 / 50 → 30 / 50.'));assert(document.body.textContent.includes('Разделы мира: сцены и позиции.'))
  const button=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Восстановить полную игровую копию');assert(button().disabled)
  await input('[aria-label="Причина восстановления полной копии"]','Проверка');await flush(()=>document.querySelector('[aria-label="Последствия полной копии проверены"]').click());assert(!button().disabled)
  await input('[aria-label="Причина восстановления полной копии"]','Изменённая причина');assert(button().disabled);await flush(()=>document.querySelector('[aria-label="Последствия полной копии проверены"]').click());await click('Восстановить полную игровую копию');assert.equal(f.worlds.a.campaign.seconds,2);assert.equal(h.calls.at(-1).reason,'Изменённая причина')
 }finally{await f.close()}
})
test('Полная копия UI: потерянный ответ и перемонтирование повторяют сохранённую команду',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=archiveFixture(f);await openComplete(f,'a');await restoreFields();f.intercept((url,options)=>{const result=h.handler(url,options);if(url.endsWith('/archive/apply')){f.intercept(h.handler);return Promise.resolve(result).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})}return result})
  await click('Восстановить полную игровую копию');const command=h.calls.at(-1),revision=f.worlds.a.revision;await f.mount(false);await f.mount(true);await flush();await openComplete(f,'a');await click('Проверить восстановление полной копии');assert.deepEqual(h.calls.at(-1),command);assert.equal(f.worlds.a.revision,revision)
 }finally{await f.close()}
})
test('Полная копия UI: поздний файл другой комнаты не раскрывает старый предпросмотр',async()=>{
 const f=await fixture(),late=deferred()
 try{
  executableCharge(f,'a',true);executableCharge(f,'b',true);const h=archiveFixture(f);await openComplete(f,'a');await input('[aria-label="Причина восстановления полной копии"]','PRIVATE-REASON-A')
  const p=h.handler('/lobbies/a/archive/calculate?revision='+f.worlds.a.revision,{headers:{},body:{}});f.intercept((url,options)=>url.includes('/a/archive/calculate')?late.promise:h.handler(url,options));await archiveFile();await openComplete(f,'b');late.resolve(p);await flush();assert(!document.body.textContent.includes('PRIVATE-ARCHIVE-POINT-a'));assert.equal(document.querySelector('[aria-label="Причина восстановления полной копии"]').value,'');await openComplete(f,'a');assert.equal(document.querySelector('[aria-label="Причина восстановления полной копии"]').value,'PRIVATE-REASON-A')
 }finally{await f.close()}
})
test('Полная копия UI: смена версии и отзыв полного доступа снимают предпросмотр',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);await f.role('ASSISTANT');await f.permissions([...lobbyPermissions]);archiveFixture(f);await openComplete(f,'a');await restoreFields();f.worlds.a={...f.worlds.a,revision:f.worlds.a.revision+1};await flush(f.notify);assert.equal(document.querySelector('[aria-label="Предпросмотр полной копии"]'),null)
  await archiveFile();assert(document.querySelector('[aria-label="Предпросмотр полной копии"]'));await f.permissions(['rounds','rollback','viewSecrets']);assert.equal(document.querySelector('[aria-label="Предпросмотр полной копии"]'),null);assert.equal(document.querySelector('[aria-label="Файл полной игровой копии"]'),null);assert([...document.querySelectorAll('button')].some(b=>b.textContent==='Скачать полную игровую копию'))
 }finally{await f.close()}
})
test('Полная копия UI: слишком большой файл не отправляется на сервер',async()=>{
 const f=await fixture()
 try{executableCharge(f,'a',true);const h=archiveFixture(f);await openComplete(f,'a');await archiveFile({size:33*1024*1024});assert.equal(h.calls.length,0);assert(document.body.textContent.includes('Полная копия превышает 32 МиБ.'))}finally{await f.close()}
})
test('Полная копия UI: скачивание проверяет контрольную сумму и не сохраняет повреждённый ответ',async()=>{
 const f=await fixture(),original=dom.window.HTMLAnchorElement.prototype.click,downloads=[]
 try{
  executableCharge(f,'a',true);const h=archiveFixture(f),data=require('node:zlib').gzipSync('test archive'),value={filename:'copy.w6.gz',data:data.toString('base64'),bytes:data.length,sha256:require('node:crypto').createHash('sha256').update(data).digest('hex')};dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download)}
  f.intercept((url,options)=>url==='/lobbies/a/archive'?value:h.handler(url,options));await openComplete(f,'a');await click('Скачать полную игровую копию');await flush();assert.equal(downloads.length,1)
  value.sha256='0'.repeat(64);await click('Скачать полную игровую копию');assert.equal(downloads.length,1);assert(document.body.textContent.includes('Контрольная сумма файла не совпала.'))
 }finally{dom.window.HTMLAnchorElement.prototype.click=original;await f.close()}
})

function retentionFixture(f){
 const calls=[],commands=new Map(),points={a:[{id:'point-a',name:'Начало A',dependencies:2}],b:[{id:'point-b',name:'Начало B',dependencies:2}]},recoveries={a:[{id:'recovery-a',at:'2026-10-12T00:00:00Z',reason:'До восстановления A'}],b:[]};let stamp=0,next=0
 const view=id=>({revision:f.worlds[id].revision,generation:1,storageStamp:'storage-'+id+'-'+stamp,activeRounds:3,compactedCollections:0,archivedCollections:2,meters:[{name:'История раундов и изменений',bytes:3*1024*1024,limitBytes:64*1024*1024,count:3,limitCount:1000}],checkpoints:points[id],recoveries:recoveries[id]})
 const handler=(url,options)=>{
  const match=url.match(/^\/lobbies\/([ab])\/storage(?:\/(.+))?$/);if(!match)return undefined
  const [,id,operation]=match,body=options?.body?JSON.parse(options.body):null
  if(!operation)return structuredClone(view(id))
  if(operation==='calculate'){
   calls.push({id,operation,...body});const selected=body.selection.checkpointIds.includes('point-'+id),s={rounds:selected?[{id:'old-1',revision:3},{id:'old-2',revision:4}]:[],compactedRounds:selected?2:0,retainedActiveRounds:selected?1:3,anchorCount:selected?2:0,changes:0,checkpoints:selected?[{id:'point-'+id,name:'Начало '+id.toUpperCase()}]:[],recoveries:body.selection.recoveryIds.map(r=>({id:r,reason:'До восстановления A'})),removedCollections:Number(body.selection.keepArchivedCollections)===0?[{id:'collection-1',scene:'Сцена'}]:[],discardedCalculations:0,blocked:selected?[]:[{id:'old-1',reasons:['Точка «Начало '+id.toUpperCase()+'»']}],freed:{history:selected?2*1024*1024:0,checkpoints:selected?1024*1024:0,recoveries:0,calculations:0}}
   return {id:'cleanup-preview-'+(++next),revision:f.worlds[id].revision,generation:1,summary:s}
  }
  if(operation==='apply'){
   calls.push({id,operation,...body});if(commands.has(body.commandKey))return {receipt:commands.get(body.commandKey),duplicate:true}
   f.worlds[id]={...f.worlds[id],revision:f.worlds[id].revision+1};points[id]=[];recoveries[id]=[];stamp++;const receipt={id:'cleanup-'+next};commands.set(body.commandKey,receipt);return {receipt,duplicate:false}
  }
  return undefined
 }
 f.context.refresh=f.notify;f.intercept(handler);return {handler,calls,view,changeStorage:()=>{stamp++}}
}
async function openStorage(f,id){await f.render();await f.open(id);await click('Открыть объём истории');await flush()}
async function cleanupFields(){await input('[aria-label="Сохранить последних раундов"]','1');await flush(()=>document.querySelector('[aria-label="Удалить точку Начало A"]').click());await input('[aria-label="Причина очистки истории"]','Освободить старые снимки');await click('Предпросмотр очистки истории')}
test('Очистка UI: показывает объём, зависимости и точный выбор; причина и подтверждение обязательны',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=retentionFixture(f),before=structuredClone(f.worlds.a);await openStorage(f,'a');assert(document.body.textContent.includes('записей 3 / 1000'))
  await click('Предпросмотр очистки истории');assert(document.body.textContent.includes('Сохранён раунд: Точка «Начало A»'));assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Применить очистку истории').disabled)
  await cleanupFields();assert.equal(h.calls.at(-1).selection.keepActiveRounds,1);assert.deepEqual(h.calls.at(-1).selection.checkpointIds,['point-a']);assert(document.body.textContent.includes('Удаляется полный снимок раунда версии 3'));assert(document.body.textContent.includes('Удаляется точка «Начало A»'));assert.deepEqual(f.worlds.a,before)
  await flush(()=>document.querySelector('[aria-label="Последствия очистки проверены"]').click());await input('[aria-label="Причина очистки истории"]','Новая причина');assert.equal(document.querySelector('[aria-label="Последствия очистки проверены"]'),null)
  await click('Предпросмотр очистки истории');await flush(()=>document.querySelector('[aria-label="Последствия очистки проверены"]').click());await click('Применить очистку истории');assert.deepEqual(f.worlds.a.characters,before.characters);assert.deepEqual(f.worlds.a.campaign,before.campaign)
 }finally{await f.close()}
})
test('Очистка UI: потерянный ответ повторяется после перемонтирования с тем же ключом',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=retentionFixture(f);await openStorage(f,'a');await cleanupFields();await flush(()=>document.querySelector('[aria-label="Последствия очистки проверены"]').click())
  f.intercept((url,options)=>{const result=h.handler(url,options);if(url.endsWith('/storage/apply')){f.intercept(h.handler);return Promise.resolve(result).then(()=>{throw new(load('onlineClient').NetworkError)(0,'Ответ потерян')})}return result})
  await click('Применить очистку истории');const body=h.calls.at(-1),revision=f.worlds.a.revision;await f.mount(false);await f.mount(true);await flush();await openStorage(f,'a');await click('Проверить команду очистки');assert.deepEqual(h.calls.at(-1),body);assert.equal(f.worlds.a.revision,revision)
 }finally{await f.close()}
})
test('Очистка UI: поздний предпросмотр и причины разделены между комнатами',async()=>{
 const f=await fixture(),late=deferred()
 try{
  executableCharge(f,'a',true);executableCharge(f,'b',true);const h=retentionFixture(f);await openStorage(f,'a');await input('[aria-label="Причина очистки истории"]','PRIVATE-CLEANUP-A')
  const p=h.handler('/lobbies/a/storage/calculate',{body:JSON.stringify({selection:{checkpointIds:['point-a'],recoveryIds:[],keepArchivedCollections:20}})});f.intercept((url,options)=>url==='/lobbies/a/storage/calculate'?late.promise:h.handler(url,options));await click('Предпросмотр очистки истории');await openStorage(f,'b');late.resolve(p);await flush();assert(!document.body.textContent.includes('Удаляется точка «Начало A»'));assert.equal(document.querySelector('[aria-label="Причина очистки истории"]').value,'');await input('[aria-label="Причина очистки истории"]','Причина B');await openStorage(f,'a');assert.equal(document.querySelector('[aria-label="Причина очистки истории"]').value,'PRIVATE-CLEANUP-A')
 }finally{await f.close()}
})
test('Очистка UI: изменение точек без новой версии требует сверки и скрывает старый результат',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=retentionFixture(f);await openStorage(f,'a');await cleanupFields();assert(document.querySelector('[aria-label="Предпросмотр очистки истории"]'));h.changeStorage();await flush(f.notify);assert.equal(document.querySelector('[aria-label="Предпросмотр очистки истории"]'),null);assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Предпросмотр очистки истории').disabled);await click('Выбор очистки проверен с текущей версией');await click('Предпросмотр очистки истории');assert(document.querySelector('[aria-label="Предпросмотр очистки истории"]'))
 }finally{await f.close()}
})
test('Очистка UI: секретный просмотр доступен узкому помощнику, удаление требует всех полномочий',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);await f.role('ASSISTANT');await f.permissions([...lobbyPermissions]);retentionFixture(f);await openStorage(f,'a');await cleanupFields();await f.permissions(['viewSecrets','rounds','rollback']);assert.equal(document.querySelector('[aria-label="Предпросмотр очистки истории"]'),null);assert.equal(document.querySelector('[aria-label="Причина очистки истории"]'),null);assert(document.body.textContent.includes('История раундов и изменений:'))
  await f.permissions([]);assert.equal(document.querySelector('[aria-label="Объём и очистка истории"]'),null)
 }finally{await f.close()}
})
test('Очистка UI: неверное количество и пустая причина не разрешают удаление',async()=>{
 const f=await fixture()
 try{
  executableCharge(f,'a',true);const h=retentionFixture(f);await openStorage(f,'a');await input('[aria-label="Сохранить последних раундов"]','0');assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Предпросмотр очистки истории').disabled);assert.equal(h.calls.length,0)
  await input('[aria-label="Сохранить последних раундов"]','1');await flush(()=>document.querySelector('[aria-label="Удалить точку Начало A"]').click());await click('Предпросмотр очистки истории');await flush(()=>document.querySelector('[aria-label="Последствия очистки проверены"]').click());assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Применить очистку истории').disabled)
 }finally{await f.close()}
})

const starterTitle='input[aria-label="Название лобби из примера"]'
const starterSlots='input[aria-label="Мест для друзей в примере"]'
async function acceptStarter(){await flush(()=>document.querySelector('.gb-starter input[type=checkbox]').click())}
test('R06: пример требует выбора, сохраняет название и число друзей при выходе и возвращении',async()=>{
 const f=await fixture()
 try{
  const create=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Создать лобби из примера')
  assert(create().disabled);await input(starterTitle,'Моя редактируемая история');await input(starterSlots,'3');await acceptStarter();assert(!create().disabled)
  await f.mount(false);await f.mount(true);assert.equal(document.querySelector(starterTitle).value,'Моя редактируемая история');assert.equal(document.querySelector(starterSlots).value,'3');assert(document.querySelector('.gb-starter input[type=checkbox]').checked)
  await input(starterSlots,'0');assert(create().disabled)
 }finally{await f.close()}
})
test('R06: потерянный ответ повторяет точную сохранённую команду и открывает то же лобби',async()=>{
 const f=await fixture(),attempts=[]
 try{
  f.intercept((url,options)=>{if(url==='/lobbies/from-example'){attempts.push(options.body);if(attempts.length===1)throw new (load('onlineClient').NetworkError)(0,'Ответ потерян');return {id:'a',duplicate:true}}})
  await input(starterTitle,'История с потерянным ответом');await acceptStarter();await click('Создать лобби из примера');assert(document.body.textContent.includes('Результат создания ещё не подтверждён'))
  const b=JSON.parse(attempts[0]);assert.equal(b.exampleId,'night-crossing');assert.equal(b.version,1);assert.match(b.commandKey,/^starter:/);assert(document.querySelector(starterTitle).matches(':disabled'))
  await f.mount(false);await f.mount(true);await click('Проверить создание лобби');assert.equal(attempts[0],attempts[1]);assert(document.body.textContent.includes('Открыто то же лобби'));assert(document.querySelector('.w6-lobby-room'));assert(!document.querySelector('.gb-starter input[type=checkbox]').checked)
 }finally{await f.close()}
})
test('R06: поздний ответ старого аккаунта не открывает лобби и не сбрасывает его сохранённый черновик',async()=>{
 const f=await fixture(),late=deferred(),old=f.context.user
 try{
  f.intercept((url)=>url==='/lobbies/from-example'?late.promise:undefined)
  await input(starterTitle,'Черновик старого аккаунта');await acceptStarter();await click('Создать лобби из примера')
  f.context.user={...old,id:crypto.randomUUID()};await f.render();assert.equal(document.querySelector(starterTitle).value,'Ночной переход');assert(!document.querySelector('.gb-starter input[type=checkbox]').checked)
  await flush(()=>late.resolve({id:'a',duplicate:false}));assert(!document.querySelector('.w6-lobby-room'));assert.equal(document.querySelector(starterTitle).value,'Ночной переход')
  f.context.user=old;await f.render();assert.equal(document.querySelector(starterTitle).value,'Черновик старого аккаунта');assert(document.body.textContent.includes('Результат создания ещё не подтверждён'))
 }finally{await f.close()}
})
test('R06: ошибка сервера сохраняет поля; окончательный отказ освобождает редактирование',async()=>{
 const f=await fixture()
 try{
  f.intercept(url=>{if(url==='/lobbies/from-example')throw new (load('onlineClient').NetworkError)(409,'Предел лобби')})
  await input(starterTitle,'Оставить мой текст');await input(starterSlots,'5');await acceptStarter();await click('Создать лобби из примера')
  assert.equal(document.querySelector(starterTitle).value,'Оставить мой текст');assert.equal(document.querySelector(starterSlots).value,'5');assert(!document.querySelector(starterTitle).disabled);assert(document.body.textContent.includes('Предел лобби'));assert(!document.body.textContent.includes('Результат создания ещё не подтверждён'))
 }finally{await f.close()}
})
test('R06: без сохранения команды на устройстве запрос создания не отправляется',async()=>{
 const f=await fixture(),prototype=Object.getPrototypeOf(localStorage),original=prototype.setItem;let requests=0
 try{
  f.intercept(url=>{if(url==='/lobbies/from-example'){requests++;return {id:'a',duplicate:false}}})
  await acceptStarter();prototype.setItem=()=>{throw Error('Storage full')};await click('Создать лобби из примера');assert.equal(requests,0);assert(document.body.textContent.includes('Не удалось сохранить команду повтора'))
 }finally{prototype.setItem=original;await f.close()}
})
test('R06: подменённая команда из хранилища не отправляется по чужому адресу',async()=>{
 const f=await fixture(),key=load('lobbyFormDrafts').lobbyFormKey('starter-create',f.accountId,'new')
 try{
  await f.mount(false);load('lobbyFormDrafts').writeLobbyForm(key,{title:'Подмена',slots:'4',accepted:true,command:{path:'/lobbies/b/restore',body:'{"commandKey":"starter:abcdefgh"}'}})
  await f.mount(true);assert.equal(document.querySelector(starterTitle).value,'Ночной переход');assert(!document.body.textContent.includes('Результат создания ещё не подтверждён'));assert.equal(f.writes.length,0)
 }finally{await f.close()}
})

async function tutorialFixture({user={id:crypto.randomUUID(),displayName:'Учебный пользователь',role:'PLAYER'},search='',recovering=false,forbid=true}={}){
 const localLoad=modules(),tree=createRoot(document.getElementById('root')),App=localLoad('App').default,Context=localLoad('onlineContext').OnlineContext,requests=[]
 dom.reconfigure({url:'https://world6.example.test/'+search})
 const context={user,recovering,connected:false,loading:false,error:'',config:null,events:0,refresh(){},socket:null,supabase:null,request:async(path,options)=>{requests.push({path,options});if(forbid)throw Error('Tutorial cannot access API');return path.startsWith('/lobbies?')?{items:[],hasMore:false}:[]}}
 const render=()=>tree.render(React.createElement(Context.Provider,{value:{...context}},React.createElement(App)))
 await flush(render)
 return {load:localLoad,context,requests,render:()=>flush(render),close:async()=>{await flush(()=>tree.unmount());dom.reconfigure({url:'https://world6.example.test/'})}}
}
const tutorialTime=()=>document.querySelector('[data-tutorial-time]')?.textContent
const buttonByText=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function tutorialRound(){await click('Заявить учебное действие');await click('Рассчитать учебный раунд');await click('Применить учебный расчёт')}
async function startPlayer(){await click('Я игрок');await flush()}
test('R07: пропуск и повтор через настоящее меню App; выбор мастера не даёт роль',async()=>{
 const f=await tutorialFixture()
 try{
  assert(document.querySelector('.gb-welcome'));await click('Пропустить вступление');assert(!document.querySelector('.gb-welcome'))
  await click('Обучение');await flush();assert(tutorialTime().includes('0 с'));await click('Путь мастера');assert.equal(f.context.user.role,'PLAYER');assert(!document.body.textContent.includes('Редактор мира'))
  await click('Отметить прочитанное');assert(document.body.textContent.includes('Шаг уже отмечен'));await click('Завершить маршрут');assert(document.body.textContent.includes('Маршрут отмечен завершённым'))
  await click('Выйти из обучения');assert(!document.querySelector('.gb-tutorial'));assert(!document.querySelector('.gb-welcome'));await click('Обучение');await flush();assert(tutorialTime().includes('0 с'));assert(document.body.textContent.includes('Шаг уже отмечен'))
  assert.deepEqual(f.requests,[])
 }finally{await f.close()}
})
test('R07: заявление, предпросмотр, 5/8, пауза, продолжение и отдельный выпуск не трогают персонажа',async()=>{
 const f=await tutorialFixture(),cs=f.load('characterStorage'),real={...createDefaultCharacter(),id:'real-tutorial-'+crypto.randomUUID(),name:'Настоящий герой'}
 try{
  cs.writeCharacters(localStorage,[real],emptyCampaign());const before=localStorage.getItem(cs.STORAGE_KEY)
  await startPlayer();await selectValue('select[aria-label="Учебное действие"]','ability');await click('Заявить учебное действие');await click('Рассчитать учебный раунд')
  assert(tutorialTime().includes('0 с'));assert(document.body.textContent.includes('Мана: 10 / 10'));assert(document.querySelector('[aria-label="Учебные последствия"]'))
  await click('Применить учебный расчёт');assert(tutorialTime().includes('5 с'));assert(document.body.textContent.includes('5 / 8 с'));assert(document.body.textContent.includes('Мана: 9 / 10'))
  await click('Заявить продолжение работы');await click('Рассчитать учебный раунд');await click('Поставить площадку на паузу');assert(buttonByText('Применить учебный расчёт').disabled);assert(buttonByText('Рассчитать учебный раунд').disabled);assert(!document.querySelector('[aria-label="Учебные последствия"]'));assert(tutorialTime().includes('5 с'));assert(document.body.textContent.includes('5 / 8 с'))
  await click('Возобновить площадку');await click('Рассчитать учебный раунд');await click('Применить учебный расчёт');assert(tutorialTime().includes('10 с'));assert(document.body.textContent.includes('заряд готов к отдельному выпуску'))
  await selectValue('select[aria-label="Учебный этап способности"]','release');await tutorialRound();assert(tutorialTime().includes('15 с'));assert(document.body.textContent.includes('Активных учебных эффектов: 1'));assert(document.body.textContent.includes('Мана: 9 / 10'))
  assert.equal(localStorage.getItem(cs.STORAGE_KEY),before);assert.deepEqual(f.requests,[])
  const marks=JSON.parse(localStorage.getItem(f.load('tutorialProgress').tutorialProgressKey(f.load('tutorialProgress').tutorialScope(f.context.user.id))));assert(!JSON.stringify(marks).includes('world'));assert(!JSON.stringify(marks).includes('mana'))
 }finally{await f.close()}
})
test('R07: мастер открывает три сцены, размещает и адресно раскрывает NPC, показывает опору Z=3',async()=>{
 const f=await tutorialFixture()
 try{
  await click('Я мастер');await flush();const heroView=()=>document.querySelector('[aria-label="Учебный вид героя"]'),masterView=()=>document.querySelector('[aria-label="Учебная сцена мастера"]')
  assert(masterView());assert(!heroView().textContent.includes('Учебный проводник'));await click('Разместить проводника в выбранной точке');assert(masterView().textContent.includes('Проводник'));assert(!heroView().textContent.includes('Учебный проводник'))
  await click('Раскрыть проводника герою');assert(heroView().textContent.includes('Учебный проводник'));await click('Скрыть проводника от героя');assert(!heroView().textContent.includes('Учебный проводник'));assert(masterView().textContent.includes('Проводник'))
  await click('Открыть учебную сцену: Двор запасов');assert(heroView().textContent.includes('Двор запасов'));await click('Открыть учебную сцену: Боковая галерея');assert(heroView().textContent.includes('Боковая галерея'))
  await click('Герой на верхнюю опору Z=3');assert(heroView().textContent.includes('На опоре · Z 3 м'));assert(tutorialTime().includes('0 с'));await click('Герой на землю');assert(heroView().textContent.includes('На земле · Z 0 м'))
  assert.equal(f.context.user.role,'PLAYER');assert.deepEqual(f.requests,[])
 }finally{await f.close()}
})
test('R07: смена аккаунта, пути, выход и новое открытие создают свежий мир с отдельными отметками',async()=>{
 const f=await tutorialFixture(),old=f.context.user
 try{
  await startPlayer();await click('Отметить прочитанное');await selectValue('select[aria-label="Учебное действие"]','ability');await tutorialRound();assert(tutorialTime().includes('5 с'))
  await click('Сохранить учебную точку');f.context.user={...old,id:crypto.randomUUID()};await f.render();await flush();assert(tutorialTime().includes('0 с'));assert(document.body.textContent.includes('Мана: 10 / 10'));assert(buttonByText('Вернуть учебную точку').disabled);assert(!document.body.textContent.includes('Шаг уже отмечен'))
  f.context.user=old;await f.render();await flush();assert(tutorialTime().includes('0 с'));assert(document.body.textContent.includes('Шаг уже отмечен'))
  await selectValue('select[aria-label="Учебное действие"]','wait');await tutorialRound();assert(tutorialTime().includes('5 с'));await click('Путь мастера');assert(tutorialTime().includes('0 с'));assert(!document.body.textContent.includes('Шаг уже отмечен'))
  await click('Выйти из обучения');await click('Обучение');await flush();assert(tutorialTime().includes('0 с'));await click('Путь игрока');assert(document.body.textContent.includes('Шаг уже отмечен'));assert.deepEqual(f.requests,[])
 }finally{await f.close()}
})
test('R07: правка черновика и изменение мира сбрасывают прежний предпросмотр',async()=>{
 const f=await tutorialFixture()
 try{
  await startPlayer();await click('Заявить учебное действие');await click('Рассчитать учебный раунд');assert(!buttonByText('Применить учебный расчёт').disabled)
  await input('input[aria-label="Учебная точка X"]','8.125');assert(!document.querySelector('[aria-label="Учебные последствия"]'));assert(buttonByText('Применить учебный расчёт').disabled);assert(buttonByText('Рассчитать учебный раунд').disabled);assert(tutorialTime().includes('0 с'))
  await click('Заявить учебное действие');await click('Рассчитать учебный раунд');await click('Сохранить учебную точку');assert(buttonByText('Применить учебный расчёт').disabled);await click('Рассчитать учебный раунд');await click('Применить учебный расчёт');assert(tutorialTime().includes('5 с'))
  await click('Вернуть последний учебный раунд');assert(tutorialTime().includes('0 с'));await click('Рассчитать учебный раунд');await click('Применить учебный расчёт');assert(tutorialTime().includes('5 с'));await click('Вернуть учебную точку');assert(tutorialTime().includes('0 с'));assert(buttonByText('Применить учебный расчёт').disabled);assert.deepEqual(f.requests,[])
 }finally{await f.close()}
})
test('R07: недоступное хранилище сохраняет отметки в памяти и позволяет пройти обучение',async()=>{
 const prototype=Object.getPrototypeOf(localStorage),get=prototype.getItem,set=prototype.setItem;let f
 try{
  prototype.getItem=()=>{throw Error('Blocked')};prototype.setItem=()=>{throw Error('Full')};f=await tutorialFixture();await startPlayer();assert(document.body.textContent.includes('Отметки доступны только в памяти'))
  await click('Отметить прочитанное');await click('Выйти из обучения');assert(!document.querySelector('.gb-welcome'));await click('Обучение');await flush();assert(document.body.textContent.includes('Шаг уже отмечен'));assert(tutorialTime().includes('0 с'));assert.deepEqual(f.requests,[])
 }finally{prototype.getItem=get;prototype.setItem=set;if(f)await f.close()}
})
test('R07: приглашение, восстановление пароля и обязательный MFA сохраняют свои страницы',async()=>{
 let f=await tutorialFixture({search:'?invite=INVITE-CODE',forbid:false})
 try{assert(!document.querySelector('.gb-welcome'));assert(!document.querySelector('.gb-tutorial'));assert(buttonByText('Вступить по приглашению'));assert(f.requests.some(r=>r.path.startsWith('/lobbies')))}finally{await f.close()}
 f=await tutorialFixture({recovering:true})
 try{assert(!document.querySelector('.gb-welcome'));assert(document.body.textContent.includes('Новый пароль'));await click('Обучение');assert(!document.querySelector('.gb-tutorial'));assert(document.body.textContent.includes('Новый пароль'))}finally{await f.close()}
 f=await tutorialFixture({user:{id:crypto.randomUUID(),displayName:'MFA',role:'PLAYER',mfaRequired:true}})
 try{assert(!document.querySelector('.gb-welcome'));await click('Обучение');assert(!document.querySelector('.gb-tutorial'));assert(!document.querySelector('[data-tutorial-time]'))}finally{await f.close()}
})
test('R07: повреждённый прогресс не выдаёт роли и перезапуск сохраняет только известные отметки',async()=>{
 const f=await tutorialFixture(),p=f.load('tutorialProgress'),scope=p.tutorialScope(f.context.user.id),key=p.tutorialProgressKey(scope)
 try{
  localStorage.setItem(key,JSON.stringify({...p.emptyTutorialProgress(),role:'GM',world:{campaign:{seconds:100}}}));await click('Обучение');await flush();assert(tutorialTime().includes('0 с'));assert.equal(f.context.user.role,'PLAYER');assert(!document.body.textContent.includes('Шаг уже отмечен'))
  await click('Отметить прочитанное');await tutorialRound();assert(tutorialTime().includes('5 с'));await click('Перезапустить площадку');assert(tutorialTime().includes('0 с'));assert(document.body.textContent.includes('Шаг уже отмечен'))
  const value=JSON.parse(localStorage.getItem(key));assert(p.isTutorialProgress(value));assert.equal(value.world,undefined);assert.equal(value.role,undefined);assert.deepEqual(f.requests,[])
 }finally{await f.close()}
})

async function lobbyTab(label, list = 'Инструменты лобби') {
  const tabs = document.querySelector('[role="tablist"][aria-label="' + list + '"]')
  const button = [...(tabs?.querySelectorAll('[role="tab"]') ?? [])].find(b => b.textContent === label)
  assert(button, 'Missing accessible tab ' + label)
  await flush(() => button.click())
  assert.equal(button.getAttribute('aria-selected'), 'true')
  const panel = document.getElementById(button.getAttribute('aria-controls'))
  assert(panel && !panel.hidden, 'Selected panel is available')
  return panel
}

test('R07 navigation: вкладки сохраняют открытые формы, заметку и незавершённые координаты', async () => {
  const f = await fixture()
  try {
    await ownActions(f, 'a')
    const coordinate = document.querySelector('[aria-label="Действие X"]')
    await input('[aria-label="Действие X"]', '-')
    await lobbyTab('Журнал', 'Разделы героя Hero a')
    const note = document.querySelector('[aria-label="Текст личной заметки"]')
    await input('[aria-label="Текст личной заметки"]', 'Неоконченная мысль')
    const heroPanel = await lobbyTab('Чат')
    const chat = heroPanel.querySelector('textarea')
    await input('[aria-labelledby="' + heroPanel.getAttribute('aria-labelledby') + '"] textarea', 'Черновик чата')
    await lobbyTab('Раунд'); await click('Открыть инструменты заявлений')
    await lobbyTab('Герои'); await lobbyTab('Сцена и действия', 'Разделы героя Hero a')
    assert.equal(document.querySelector('[aria-label="Действие X"]'), coordinate)
    assert.equal(coordinate.value, '-')
    await lobbyTab('Журнал', 'Разделы героя Hero a')
    assert.equal(document.querySelector('[aria-label="Текст личной заметки"]'), note)
    assert.equal(note.value, 'Неоконченная мысль')
    await lobbyTab('Чат'); assert.equal(chat.value, 'Черновик чата')
    await lobbyTab('Раунд'); assert(document.body.textContent.includes('Свернуть приём заявлений'))
    assert.equal(f.writes.length, 0)
  } finally { await f.close() }
})

test('R07 navigation: клавиатура переключает вкладки; отзыв прав удаляет секретный инструмент', async () => {
  const f = await fixture()
  try {
    await f.open('a')
    const tabs = document.querySelector('[aria-label="Инструменты лобби"]')
    const hero = tabs.querySelector('[role="tab"]')
    await flush(() => { hero.focus(); hero.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true})) })
    assert.equal(document.activeElement.textContent, 'Раунд')
    assert.equal(document.activeElement.getAttribute('aria-selected'), 'true')
    await click('Открыть инструменты заявлений')
    await f.role('ASSISTANT'); await f.permissions(['rounds'])
    assert(!document.querySelector('[aria-label="Инструменты лобби"] [role="tab"][aria-controls$="-round"]'))
    assert(!document.body.textContent.includes('Свернуть приём заявлений'))
    assert.equal(document.querySelector('[aria-label="Инструменты лобби"] [aria-selected="true"]').textContent, 'Герои')
    await f.role('PLAYER'); await f.permissions([])
    const labels = [...document.querySelector('[aria-label="Инструменты лобби"]').children].map(b=>b.textContent)
    assert.deepEqual(labels, ['Герои','Мир','Чат','Подготовка'])
    assert(!document.body.textContent.includes('Общий редактор ГМ'))
  } finally { await f.close() }
})

async function until(predicate, description) {
  for (let n=0; n<240; n++) { if (predicate()) return; await flush() }
  assert.fail('Did not reach ' + description)
}
function enabledButton(text) {
  return [...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)&&!b.disabled&&!b.closest('fieldset[disabled]'))
}
async function labelledCheck(text) {
  const label=[...document.querySelectorAll('label')].find(l=>l.textContent.includes(text))
  assert(label?.querySelector('input[type="checkbox"]'), 'Missing checkbox '+text)
  await flush(()=>label.querySelector('input').click())
}

test('R07 play path: мастер и два игрока через HTTP/UI: приглашение, сцена, раунд, пауза и продолжение', async t => {
  const { fixture: serverFixture } = await import('../server/test/fixtures.mjs')
  const f = await serverFixture(t), gm = await f.register('play-gm'), player = await f.register('play-player'), player2 = await f.register('play-player-two')
  const native = modules({BASE_URL:'/',DEV:true}, true), Panel = native('LobbiesPanel').default, Context = native('onlineContext').OnlineContext
  const tree = createRoot(document.getElementById('root')), calls=[]
  let session=gm, events=0, accountVersion=0
  const request=async (url, options={})=>{
    const token=session.token, method=options.method??'GET'
    const response=await fetch(f.base+'/api'+url,{...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}})
    const data=await response.json(); calls.push({url,method,body:options.body?JSON.parse(options.body):undefined,status:response.status})
    if(!response.ok)throw Error(data.error??'HTTP '+response.status)
    return data
  }
  const api=async (...args)=>{let result;await act(async()=>{result=await f.api(...args);await new Promise(r=>setTimeout(r,5))});return result}
  const render=()=>tree.render(React.createElement(Context.Provider,{value:{user:session.user,events,request,refresh:()=>{events++;render()},socket:null,connected:true}},React.createElement(Panel,{key:accountVersion,onAccount:()=>assert.fail('Already signed in')})))
  async function account(next, title) {
    session=next;accountVersion++;await flush(render)
    if(title){await until(()=>enabledButton(title),'own lobby list');await click(title);await until(()=>document.querySelector('[aria-label="Инструменты лобби"]'),'lobby tools')}
  }
  try {
    // Accounts are test fixtures; all lobby/game transitions below use the real UI.
    await account(gm)
    await input('[aria-label="Название лобби из примера"]','Совместная игра')
    await labelledCheck('Создать отдельную кампанию')
    await click('Создать лобби из примера')
    await until(()=>document.querySelector('[aria-label="Инструменты лобби"]'),'created lobby')
    const created=calls.find(c=>c.url==='/lobbies/from-example'&&c.method==='POST')
    assert.equal(created.status,201)
    const room=(await api('/lobbies/mine',gm.token))[0], path='/lobbies/'+room.id
    const lobby=await api(path,gm.token), initial=await api(path+'/world',gm.token)
    assert.equal(initial.campaign.seconds,0)
    const hero={...native('characterModel').createDefaultCharacter(),id:'play-path-source',name:'Герой друзей'}
    await api('/characters/'+hero.id,player.token,'PUT',{character:hero,revision:-1})
    await account(player)
    const invite=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Код приглашения')).querySelector('input')
    invite.setAttribute('data-play-invite','')
    await input('[data-play-invite]',lobby.inviteCode);await click('Вступить по приглашению')
    await until(()=>document.querySelector('[aria-label="Инструменты лобби"]'),'joined lobby')
    const beforeHero=JSON.stringify(await api(path+'/world',player.token))
    assert(!beforeHero.includes(initial.characters[0].id),'Private NPC sheet is absent')
    await selectValue('[aria-label="Герой из аккаунта"]',hero.id);await click('Добавить героя в кампанию')
    await until(()=>document.body.textContent.includes('Герой друзей')&&enabledButton('Открыть экран героя'),'submitted hero')
    const heroId=(await api(path+'/world',gm.token)).characters.find(c=>c.name===hero.name).id
    await click('Открыть экран героя')
    await until(()=>document.body.textContent.includes('Мастер ещё не открыл этому герою сцену'),'undisclosed scene')
    assert.deepEqual([...document.querySelector('[aria-label="Инструменты лобби"]').children].map(b=>b.textContent),['Герои','Мир','Чат','Подготовка'])
    await account(gm,room.title)
    await click('Открыть заявку и проверяемый лист');await until(()=>enabledButton('Принять героя'),'hero review')
    await click('Принять героя в кампанию');await until(()=>document.body.textContent.includes('Решение по листу сохранено.'),'approved hero')
    // GM fixture puts the approved hero on the existing gate; UI disclosure remains explicit.
    const placed=await api(path+'/world',gm.token), gate=placed.campaign.scenes.scenes[0]
    gate.tokens.push({id:'play-path-token',actorId:heroId,x:5,y:6,z:0,diameter:1,visible:true,support:{kind:'ground'}})
    await api(path+'/world',gm.token,'PUT',{revision:placed.revision,world:placed})
    events++;await flush(render)
    await until(()=>enabledButton('Настроить видимость героя'),'fresh disclosure access')
    await click('Настроить видимость героя');await until(()=>document.querySelector('[aria-label="Сцена раскрытия"]'),'disclosure editor')
    await selectValue('[aria-label="Сцена раскрытия"]',gate.id);await click('Открыть выбранную сцену герою');await click('Раскрыть всю местность')
    await click('Сохранить раскрытие героя');await until(()=>document.body.textContent.includes('Раскрытие сохранено только'),'saved individual disclosure')
    // A second independent account/hero is prepared by the authorized test API,
    // just as the first account/hero fixture. Both declarations below use UI.
    const hero2={...native('characterModel').createDefaultCharacter(),id:'play-path-source-two',name:'Герой второго игрока'}
    await api('/lobbies/join',player2.token,'POST',{code:lobby.inviteCode})
    await api('/characters/'+hero2.id,player2.token,'PUT',{character:hero2,revision:-1})
    const hero2Id=(await api(path+'/characters',player2.token,'POST',{characterId:hero2.id},201)).id
    await api(path+'/characters/'+hero2Id+'/review',gm.token,'POST',{revision:(await api(path+'/world',gm.token)).revision,decision:'approve',note:''})
    const together=await api(path+'/world',gm.token)
    together.campaign.scenes.scenes.find(s=>s.id===gate.id).tokens.push({id:'play-path-token-two',actorId:hero2Id,x:7,y:6,z:2,diameter:1,visible:true,support:{kind:'air'}})
    together.campaign.perceptions.heroes.push({...structuredClone(together.campaign.perceptions.heroes.find(h=>h.actorId===heroId)),actorId:hero2Id})
    await api(path+'/world',gm.token,'PUT',{revision:together.revision,world:together})
    assert.equal((await api(path,gm.token)).members.length,3)
    events++;await flush(render)
    await lobbyTab('Раунд');await until(()=>enabledButton('Открыть инструменты заявлений'),'fresh round access');await click('Открыть инструменты заявлений')
    await until(()=>document.querySelector('[aria-label="Сцена приёма"]'),'collection editor')
    await selectValue('[aria-label="Сцена приёма"]',gate.id);await input('[aria-label="Длительность раунда, с"]','5')
    await flush(()=>document.querySelector('[aria-label="Участник сбора Герой друзей"]').click())
    await flush(()=>document.querySelector('[aria-label="Участник сбора Герой второго игрока"]').click())
    await click('Начать приём заявлений');await until(()=>enabledButton('Закрыть приём заявлений'),'open collection')
    await account(player,room.title);await click('Открыть экран героя')
    await until(()=>document.querySelector('[aria-label="Категория действия"]')&&!document.querySelector('[aria-label="Категория действия"]').closest('fieldset').disabled,'editable declaration')
    assert(document.querySelector('.gb-player-map'),'Individual scene rendered')
    await waitAction('1','Наблюдаю за переходом')
    await lobbyTab('Чат');await lobbyTab('Герои')
    assert(enabledButton('Отправить заявление'),'Navigation kept the plan')
    await click('Отправить заявление');await until(()=>document.body.textContent.includes('Моё отправленное заявление'),'submitted plan')
    assert.equal((await api(path+'/world',gm.token)).campaign.seconds,0,'Declaring does not advance time')
    await account(player2,room.title);await click('Открыть экран героя')
    await until(()=>document.querySelector('[aria-label="Категория действия"]')&&!document.querySelector('[aria-label="Категория действия"]').closest('fieldset').disabled,'second editable declaration')
    assert(document.querySelector('.gb-player-map'))
    await waitAction('2','PRIVATE-SECOND-PLAN');await click('Отправить заявление')
    await until(()=>document.body.textContent.includes('Моё отправленное заявление'),'second submitted plan')
    assert(!JSON.stringify(await api(path+'/world',player.token)).includes('PRIVATE-SECOND-PLAN'))
    await account(gm,room.title);await lobbyTab('Раунд');await click('Открыть инструменты заявлений')
    await until(()=>enabledButton('Закрыть приём заявлений'),'master collection');await click('Закрыть приём заявлений')
    await until(()=>document.querySelector('[aria-label="Бюджет Герой друзей, мс"]'),'timing decisions')
    await input('[aria-label="Бюджет Герой друзей, мс"]','3000')
    await input('[aria-label="Бюджет Герой второго игрока, мс"]','5000')
    if(enabledButton('Решения мастера проверены'))await click('Решения мастера проверены')
    await until(()=>enabledButton('Рассчитать последствия раунда'),'calculation readiness')
    await click('Рассчитать последствия раунда');await until(()=>enabledButton('Применить рассчитанный раунд'),'server preview')
    const beforeApply=await api(path+'/world',gm.token)
    assert.equal(beforeApply.campaign.seconds,0)
    await lobbyTab('Чат');await lobbyTab('Раунд')
    assert(enabledButton('Применить рассчитанный раунд'),'Preview survives navigation')
    await click('Применить рассчитанный раунд');await until(()=>calls.some(c=>c.url===path+'/rounds/apply'&&c.status===200),'applied receipt')
    const applied=calls.find(c=>c.url===path+'/rounds/apply'), after=await api(path+'/world',gm.token)
    assert.equal(after.campaign.seconds,5);assert.equal(after.revision,beforeApply.revision+1)
    assert.equal(after.campaign.declarations.active.entries[0].actions[0].kind,'wait')
    assert.equal(after.campaign.declarations.active.entries.length,2)
    assert.equal(after.campaign.scenes.scenes.find(s=>s.id===gate.id).tokens.find(t=>t.actorId===hero2Id).z,2)
    const pause=await api(path+'/rounds/pause',gm.token,'POST',{revision:after.revision,paused:true,reason:'Перерыв тестовой группы',commandKey:crypto.randomUUID()})
    const saved=await api(path+'/rounds/checkpoints',gm.token,'POST',{revision:pause.receipt.revision,name:'После раунда друзей',commandKey:crypto.randomUUID()})
    assert(saved.checkpoint.id)
    const pausedWorld=await api(path+'/world',gm.token)
    await act(async()=>{await f.restart()})
    const repeat=await api(path+'/rounds/apply',gm.token,'POST',applied.body)
    assert.equal(repeat.duplicate,true);assert.deepEqual(await api(path+'/world',gm.token),pausedWorld)
    const history=await api(path+'/rounds/history',gm.token);assert.equal(history.session.paused,true);assert(history.checkpoints.some(c=>c.id===saved.checkpoint.id))
    await api(path+'/rounds/pause',gm.token,'POST',{revision:pausedWorld.revision,paused:false,reason:'Возвращение друзей',commandKey:crypto.randomUUID()})
    await account(player2,room.title);await click('Открыть экран героя');await until(()=>document.querySelector('.gb-player-map'),'continued scene of second player')
    assert(!calls.some(c=>c.method!=='GET'&&c.status>=400),'UI sent no rejected mutation')
  } finally { await flush(()=>tree.unmount()) }
})

function speechRound(f,id) {
  executableRound(f,id)
  const w=f.worlds[id],c=w.campaign.declarations.active
  c.entries[0].actions=[{kind:'speak',target:{kind:'none'},volume:'whisper',text:'Пароль ЛУНА у северных ворот',note:'PRIVATE-NOTE'}]
  const listener={...createDefaultCharacter(),id:'listener-'+id,name:'Listener '+id}
  w.characters.push(listener)
  w.campaign.scenes=load('scenes').createScene(load('scenes').emptyScenes(),'scene-'+id,'Scene '+id,'top')
  w.campaign.scenes.scenes[0].tokens=[w.characters[0],listener].map((a,i)=>({id:'speech-'+a.id,actorId:a.id,x:3+i,y:5,z:0,diameter:1,support:{kind:'ground'}}))
}
const speechSelect=id=>'[data-speech-key="new:hero-'+id+':0"] [data-hearer-id="listener-'+id+'"] select'
const speechFragment=id=>'[data-speech-key="new:hero-'+id+':0"] [data-hearer-id="listener-'+id+'"] textarea[aria-label^="Фрагмент"]'
const speechReason=id=>'[data-speech-key="new:hero-'+id+':0"] textarea[aria-label^="Условия"]'
async function speechFields(f,id) {
  await timelineFields(f,id);await click('Решения мастера проверены')
  await input(speechReason(id),'Проверены слух, стена и ветер')
  await selectValue(speechSelect(id),'fragment');await input(speechFragment(id),'у северных ворот')
  await flush(()=>document.querySelector('[data-speech-key="new:hero-'+id+':0"] input[type="checkbox"]').click())
}

test('R08 UI: фрагмент требует проверки, предпросмотр адресный, правка сбрасывает подтверждение и результат',async()=>{
 const f=await fixture()
 try{
  speechRound(f,'a');await speechFields(f,'a')
  assert(enabledButton('Рассчитать последствия раунда'))
  await input(speechFragment('a'),'НЕИЗВЕСТНЫЕ СЛОВА')
  await flush(()=>document.querySelector('[data-speech-key="new:hero-a:0"] input[type="checkbox"]').click())
  assert(!enabledButton('Рассчитать последствия раунда'));assert.equal(f.executions.length,0)
  await input(speechFragment('a'),'у северных ворот')
  assert(!document.querySelector('[data-speech-key="new:hero-a:0"] input[type="checkbox"]').checked)
  await flush(()=>document.querySelector('[data-speech-key="new:hero-a:0"] input[type="checkbox"]').click())
  await click('Рассчитать последствия раунда')
  const preview=document.querySelector('[aria-label="Расчёт слышимости"]');assert(preview);assert(preview.textContent.includes('Других слушателей: 1'))
  assert.equal(f.executions[0].input.speech[0].hearers[0].fragment,'у северных ворот');assert.equal(f.worlds.a.characters[1].journal.length,0)
  await input(speechFragment('a'),'северных ворот');assert(!document.querySelector('[aria-label="Расчёт слышимости"]'));assert(!enabledButton('Применить рассчитанный раунд'))
 }finally{await f.close()}
})
test('R08 UI: слышимость и незавершённый фрагмент разделены по лобби и сохраняются при переключении вкладок',async()=>{
 const f=await fixture()
 try{
  speechRound(f,'a');speechRound(f,'b');await speechFields(f,'a');await input(speechFragment('a'),'у север')
  await lobbyTab('Чат');await lobbyTab('Раунд');assert.equal(document.querySelector(speechFragment('a')).value,'у север')
  await f.open('b');await click('Открыть инструменты заявлений');await input(speechReason('b'),'Решение B')
  assert.equal(document.querySelector(speechSelect('b')).value,'none')
  await f.open('a');await click('Открыть инструменты заявлений');assert.equal(document.querySelector(speechFragment('a')).value,'у север');assert(!document.querySelector(speechReason('a')).value.includes('Решение B'))
  assert(!document.querySelector('[data-speech-key="new:hero-a:0"] input[type="checkbox"]').checked)
  assert.equal(f.executions.length,0)
 }finally{await f.close()}
})
test('R08 UI: поздний расчёт после правки или отзыва секретов не раскрывается',async()=>{
 const f=await fixture(),pending=deferred()
 try{
  speechRound(f,'a');await speechFields(f,'a')
  f.intercept((url,options)=>url.endsWith('/rounds/calculate')&&options?.method==='POST'?pending.promise:undefined)
  await click('Рассчитать последствия раунда');await input('[aria-label="Бюджет Hero a, мс"]','4000')
  await flush(()=>pending.resolve({id:'late',revision:7,collectionId:'collection-a',epoch:2,generation:1,summary:{speech:[{key:'old',actorId:'hero-a',text:'LATE-SECRET',heard:[]}],durationSeconds:5,events:[],carried:[],missingDecisions:[],warnings:[]}}))
  assert(!document.body.textContent.includes('LATE-SECRET'));assert(!document.querySelector('[aria-label="Расчёт слышимости"]'))
  await f.role('ASSISTANT');await f.permissions(['rounds']);assert(!document.querySelector('.gb-speech-decisions'))
  assert(!document.body.textContent.includes('Пароль ЛУНА'))
 }finally{await f.close()}
})

test('R08 UI HTTP: мастер выбирает слышимость, слушатель видит фрагмент, остальные не получают слова',async t=>{
 const {fixture:serverFixture,lobbyBody}=await import('../server/test/fixtures.mjs'),f=await serverFixture(t)
 const gm=await f.register('speech-ui-gm'),speaker=await f.register('speech-ui-speaker'),listener=await f.register('speech-ui-listener'),silent=await f.register('speech-ui-silent')
 const {id}=await f.api('/lobbies',gm.token,'POST',lobbyBody,201),path='/lobbies/'+id,ids={}
 const native=modules({BASE_URL:'/',DEV:true},true),Panel=native('LobbiesPanel').default,Context=native('onlineContext').OnlineContext
 for(const [name,user,label] of [['speaker',speaker,'Говорящий'],['listener',listener,'Слушатель'],['silent',silent,'Неслышащий']]){
  await f.api(path+'/join',user.token,'POST');const hero={...native('characterModel').createDefaultCharacter(),id:'source-'+name,name:label}
  await f.api('/characters/'+hero.id,user.token,'PUT',{character:hero,revision:-1});ids[name]=(await f.api(path+'/characters',user.token,'POST',{characterId:hero.id},201)).id
  await f.api(path+'/characters/'+ids[name]+'/review',gm.token,'POST',{revision:(await f.api(path+'/world',gm.token)).revision,decision:'approve',note:''})
 }
 const initial=await f.api(path+'/world',gm.token);initial.campaign.scenes=native('scenes').createScene(native('scenes').emptyScenes(),'conversation-scene','PRIVATE-SCENE','top')
 initial.campaign.scenes.scenes[0].tokens=Object.values(ids).map((actorId,index)=>({id:'conversation-token-'+index,actorId,x:2+index,y:5,z:0,diameter:1,support:{kind:'ground'}}))
 await f.api(path+'/world',gm.token,'PUT',{revision:initial.revision,world:initial})
 await f.api(path+'/declarations',gm.token,'POST',{revision:(await f.api(path+'/world',gm.token)).revision,sceneId:'conversation-scene',durationSeconds:5,participantIds:[ids.speaker,ids.listener],allowReplace:true},201)
 const declared=await f.api(path+'/characters/'+ids.speaker+'/declarations',speaker.token)
 await f.api(path+'/characters/'+ids.speaker+'/declarations',speaker.token,'PUT',{collectionId:declared.collection.id,epoch:declared.collection.epoch,baseVersion:0,controlStamp:declared.controlStamp,actions:[{kind:'speak',target:{kind:'none'},volume:'whisper',text:'У северных ворот. Пароль: ЛУНА.',note:'PRIVATE-PLAN'}]})
 const listenView=await f.api(path+'/characters/'+ids.listener+'/declarations',listener.token)
 await f.api(path+'/characters/'+ids.listener+'/declarations',listener.token,'PUT',{collectionId:listenView.collection.id,epoch:listenView.collection.epoch,baseVersion:0,controlStamp:listenView.controlStamp,actions:[{kind:'wait',seconds:7,note:'LISTENING-SECRET',listening:{mode:'eavesdrop',target:{kind:'none'}}}]})
 const state=await f.api(path+'/world',gm.token),collection=state.campaign.declarations.active
 await f.api(path+'/declarations',gm.token,'PATCH',{collectionId:collection.id,epoch:collection.epoch,operation:'close'})
 const tree=createRoot(document.getElementById('root')),calls=[];let session=gm,events=0,version=0
 const request=async(url,options={})=>{const response=await fetch(f.base+'/api'+url,{...options,headers:{Authorization:'Bearer '+session.token,...(options.body?{'Content-Type':'application/json'}:{})}}),data=await response.json();calls.push({url,method:options.method??'GET',status:response.status});if(!response.ok)throw Error(data.error??'HTTP '+response.status);return data}
 const render=()=>tree.render(React.createElement(Context.Provider,{value:{user:session.user,events,request,refresh:()=>{events++;render()},socket:null,connected:true}},React.createElement(Panel,{key:version,onAccount:()=>assert.fail('Signed in')})))
 async function mount(user){session=user;version++;await flush(render);await until(()=>enabledButton(lobbyBody.title),'my lobby');await click(lobbyBody.title);await until(()=>document.querySelector('[aria-label="Инструменты лобби"]'),'lobby tools')}
 try{
  await mount(gm);await lobbyTab('Раунд');await click('Открыть инструменты заявлений');await until(()=>document.querySelector('[aria-label="Бюджет Говорящий, мс"]'),'timings')
  await input('[aria-label="Бюджет Говорящий, мс"]','5000');await input('[aria-label="Стоимость Говорящий, действие 1, мс"]','1000');await input('[aria-label="Бюджет Слушатель, мс"]','5000');await click('Решения мастера проверены')
  const row='[data-speech-key="new:'+ids.speaker+':0"]',chosen=row+' [data-hearer-id="'+ids.listener+'"]'
  await input(row+' textarea[aria-label^="Условия"]','Шум скрывает часть шёпота')
  await flush(()=>{document.querySelector(chosen).open=true});await selectValue(chosen+' select','fragment');await input(chosen+' textarea[aria-label^="Фрагмент"]','У северных ворот')
  await input(chosen+' input[aria-label^="Говорящий"]','Голос за углом');await flush(()=>document.querySelector(row+' input[type="checkbox"]').click())
  await click('Рассчитать последствия раунда');await until(()=>enabledButton('Применить рассчитанный раунд'),'speech preview')
  assert.equal(document.querySelector('[aria-label="Расчёт слышимости"]').textContent.includes('Голос за углом'),true);assert(document.querySelector('[aria-label="Время внимания слушателей"]').textContent.includes('Подслушивать'))
  await click('Применить рассчитанный раунд');await until(()=>calls.some(c=>c.url===path+'/rounds/apply'&&c.status===200),'speech apply')
  await mount(listener);await until(()=>enabledButton('Открыть экран героя'),'listener access loaded');await click('Открыть экран героя');await until(()=>document.querySelector('[role="tablist"][aria-label="Разделы героя Слушатель"]'),'listener screen')
  const heard=await lobbyTab('Разговоры','Разделы героя Слушатель');assert(heard.textContent.includes('У северных ворот'));assert(heard.textContent.includes('Голос за углом'));assert(!heard.textContent.includes('ЛУНА'));assert(!heard.textContent.includes('PRIVATE-PLAN'))
  assert(!document.body.textContent.includes('ЛУНА'),'Listener response never renders the whole secret')
  await mount(silent);await until(()=>enabledButton('Открыть экран героя'),'silent access loaded');await click('Открыть экран героя');await until(()=>document.querySelector('[role="tablist"][aria-label="Разделы героя Неслышащий"]'),'silent screen')
  const empty=await lobbyTab('Разговоры','Разделы героя Неслышащий');assert(empty.textContent.includes('Пока нет'));assert(!document.body.textContent.includes('ЛУНА'));assert(!document.body.textContent.includes('У северных ворот'))
  await mount(speaker);await until(()=>enabledButton('Открыть экран героя'),'speaker access loaded');await click('Открыть экран героя');await until(()=>document.querySelector('[role="tablist"][aria-label="Разделы героя Говорящий"]'),'speaker screen')
  const own=await lobbyTab('Разговоры','Разделы героя Говорящий');assert(own.textContent.includes('ЛУНА'));assert(!own.textContent.includes('Голос за углом'));assert(!own.textContent.includes(ids.listener));assert(!document.body.textContent.includes('LISTENING-SECRET'))
  assert(!calls.some(c=>c.method!=='GET'&&c.status>=400))
 }finally{await flush(()=>tree.unmount())}
})

test('R08 listening UI: режим, XYZ и частичный ввод сохраняются по лобби и отправляются как ожидание',async()=>{
 const f=await fixture()
 try{
  await ownActions(f,'a');await selectValue('[aria-label="Категория действия"]','wait');await selectValue('[aria-label="Режим ожидания"]','eavesdrop');await input('[aria-label="Ожидание, с"]','7')
  await selectValue('[aria-label="Вид цели"]','point');await input('[aria-label="Действие X"]','10.25');await input('[aria-label="Действие Y"]','5.5');await input('[aria-label="Действие Z"]','-')
  await lobbyTab('Чат');await lobbyTab('Герои');assert.equal(document.querySelector('[aria-label="Действие Z"]').value,'-')
  await ownActions(f,'b');await selectValue('[aria-label="Категория действия"]','wait');assert.equal(document.querySelector('[aria-label="Режим ожидания"]').value,'')
  await f.open('a');await click('Открыть экран героя');assert.equal(document.querySelector('[aria-label="Режим ожидания"]').value,'eavesdrop');assert.equal(document.querySelector('[aria-label="Действие Z"]').value,'-')
  await input('[aria-label="Действие Z"]','3');await click('Добавить действие в последовательность');await click('Отправить заявление')
  const a=f.writes[0].actions[0];assert.equal(a.kind,'wait');assert.equal(a.seconds,7);assert.deepEqual(a.listening,{mode:'eavesdrop',target:{kind:'point',point:{x:10.25,y:5.5,z:3}}});assert(!Object.hasOwn(a.listening,'success'))
 }finally{await f.close()}
})
test('R08 listening UI: старый черновик без нового поля сохраняет последовательность и незавершённые значения',async()=>{
 const f=await fixture()
 try{
  const key=load('lobbyFormDrafts').lobbyFormKey('action-sequence',f.accountId,'a','hero-a')
  localStorage.setItem(key,JSON.stringify({form:{kind:'move',targetKind:'none',targetId:'',x:'-',y:'5.5',z:'3',seconds:'1,',quantity:'1',itemId:'',abilityId:'',stage:'prepare',volume:'normal',speech:'',operation:'inspect',note:'Старый незавершённый текст',support:'ground',route:[]},actions:[{kind:'wait',seconds:2,note:'OLD-SAVED-ACTION'}]}))
  await ownActions(f,'a');assert.equal(document.querySelector('[aria-label="Действие X"]').value,'-');assert.equal(document.querySelector('[aria-label="Пояснение действия"]').value,'Старый незавершённый текст');assert(document.body.textContent.includes('OLD-SAVED-ACTION'))
  await selectValue('[aria-label="Категория действия"]','wait');assert.equal(document.querySelector('[aria-label="Ожидание, с"]').value,'1,');assert.equal(document.querySelector('[aria-label="Режим ожидания"]').value,'');assert(enabledButton('Отправить заявление'))
  assert.equal(f.writes.length,0)
 }finally{await f.close()}
})
test('R08 listening UI: доступная отметка копируется в намерение; отказ сервера сохраняет весь план',async()=>{
 const f=await fixture()
 try{
  f.worlds.a.characters[0].ownerId=f.accountId;f.declarations.a=readyDeclarations('a');f.declarations.a.options.targets=[{id:'known-voice',kind:'contact',label:'Известный голос'}]
  await f.open('a');await click('Открыть экран героя');await selectValue('[aria-label="Категория действия"]','wait');await input('[aria-label="Ожидание, с"]','2');await selectValue('[aria-label="Режим ожидания"]','listen');await selectValue('[aria-label="Вид цели"]','contact');await selectValue('[aria-label="Доступная цель"]','known-voice');await click('Добавить действие в последовательность')
  assert(document.body.textContent.includes('Известный голос'))
  f.intercept((url,options)=>options?.method==='PUT'&&url.endsWith('/declarations')?Promise.reject(new(load('onlineClient').NetworkError)(409,'Отметка изменилась')):undefined)
  await click('Отправить заявление');assert(document.body.textContent.includes('Отметка изменилась'));assert(document.body.textContent.includes('Прислушиваться: 2 с'));assert(enabledButton('Отправить заявление'))
  const key=load('lobbyFormDrafts').lobbyFormKey('action-sequence',f.accountId,'a','hero-a'),saved=JSON.parse(localStorage.getItem(key));assert.equal(saved.actions[0].listening.target.id,'known-voice');assert.equal(f.writes.length,0)
 }finally{await f.close()}
})
test('R08 listening UI: мастер видит план и интервал внимания, отзыв секретов убирает закрытые сведения',async()=>{
 const f=await fixture()
 try{
  speechRound(f,'a');const c=f.worlds.a.campaign.declarations.active
  c.participantIds.push('listener-a');c.entries.push({actorId:'listener-a',actorName:'Listener a',revision:1,status:'submitted',actions:[{kind:'wait',seconds:7,note:'LISTENING-SECRET',listening:{mode:'eavesdrop',target:{kind:'point',point:{x:13.25,y:8,z:3}}}}],resolved:[],submittedBy:'friend-id',submittedAt:'',note:''})
  const current=f.worlds.a.campaign.scenes.scenes[0];current.objects.push(load('scenes').sceneObject('door','same-local-id',{x:14,y:12,z:0}));current.objects.at(-1).name='CURRENT-LISTEN-DOOR'
  f.worlds.a.campaign.scenes=load('scenes').createScene(f.worlds.a.campaign.scenes,'elsewhere','Elsewhere','top');const other=f.worlds.a.campaign.scenes.scenes[1];other.objects.push({...structuredClone(current.objects[0]),name:'OTHER-SCENE-DOOR'});f.worlds.a.campaign.scenes.scenes=[other,current]
  c.entries[1].actions.push({kind:'wait',seconds:1,note:'',listening:{mode:'listen',target:{kind:'object',id:'same-local-id'}}})
  await speechFields(f,'a');await input('[aria-label="Бюджет Listener a, мс"]','5000');await click('Решения мастера проверены')
  assert(document.querySelector('[aria-label="Намерения слушателей"]').textContent.includes('Подслушивать'));assert(document.querySelector('[aria-label="Намерения слушателей"]').textContent.includes('13.25'))
  const plans=document.querySelector('[aria-label="Намерения слушателей"]');assert(plans.textContent.includes('CURRENT-LISTEN-DOOR'));assert(!plans.textContent.includes('OTHER-SCENE-DOOR'))
  await flush(()=>document.querySelector('[data-speech-key="new:hero-a:0"] input[type="checkbox"]').click());await click('Рассчитать последствия раунда')
  const time=document.querySelector('[aria-label="Время внимания слушателей"]');assert(time);assert(time.textContent.includes('следующем раунде'));assert.equal(f.executions[0].input.timings.length,2)
  await f.role('ASSISTANT');await f.permissions(['rounds']);assert(!document.querySelector('[aria-label="Намерения слушателей"]'));assert(!document.body.textContent.includes('LISTENING-SECRET'));assert(!document.body.textContent.includes('13.25'))
 }finally{await f.close()}
})
