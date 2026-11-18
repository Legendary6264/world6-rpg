const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{pathToFileURL}=require('node:url')
const React=require('react'),{act}=React,{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://interface.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,location:dom.window.location,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true})
let scrolledTo
window.scrollTo=options=>{scrolledTo=options}
const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'))
let online
function modules(stubs={}){const cache=new Map();function load(name){name=name.replace(/\.tsx?$/,'');if(name.endsWith('.css'))return {};if(stubs[name])return stubs[name];if(name==='onlineContext')return {useOnline:()=>online};if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name);const mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href)).replaceAll('import.meta.env',JSON.stringify({BASE_URL:'/'}))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports
}return load}
const load=modules(),flush=async fn=>act(async()=>{fn?.();await new Promise(resolve=>setTimeout(resolve,15))})
async function mount(Component,props={}){await flush(()=>root.render(null));await flush(()=>root.render(React.createElement(Component,props)));await flush()}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function input(element,value){await flush(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})}
function context(){return {user:null,connected:true,loading:false,recovering:false,error:'',config:{authMode:'local'},supabase:null,refresh(){},request:async()=>({}),reloadUser:async()=>{},login:async()=>{},register:async()=>{},logout:async()=>{}}}
test.after(async()=>{await flush(()=>root.unmount());dom.window.close()})

test('Навигация: глубокие ссылки и параметры приглашения сохраняются, прототипные страницы отклонены',()=>{
 const {readSitePage,sitePageUrl}=load('siteRoutes')
 assert.equal(readSitePage('https://example.test/?invite=abc'),'lobbies');assert.equal(readSitePage('https://example.test/?page=character'),'character')
 for(const page of ['__proto__','constructor','unknown'])assert.equal(readSitePage('https://example.test/?page='+page),'home')
 const url=new URL(sitePageUrl('https://example.test/base/?invite=abc&keep=1#fragment','guide'));assert.equal(url.pathname,'/base/');assert.equal(url.searchParams.get('invite'),'abc');assert.equal(url.searchParams.get('keep'),'1');assert.equal(url.hash,'#fragment');assert.equal(readSitePage(url.href),'guide')
})

test('Навигация: административные разделы сохраняют роли и закрываются после отзыва полномочий',()=>{
 const {sitePageAllowed}=load('siteRoutes')
 for(const role of [undefined,'PLAYER','GM','__proto__']){assert(!sitePageAllowed('admin',role));assert(!sitePageAllowed('worldEditor',role))}
 assert(sitePageAllowed('worldEditor','WORLD_EDITOR'));assert(!sitePageAllowed('admin','WORLD_EDITOR'));assert(sitePageAllowed('admin','ADMIN'));assert(sitePageAllowed('admin','OWNER'))
})

test('Главная навигация: мобильное раскрытие закрывается после выбора и привилегии не показываются гостю',async()=>{
 const Nav=load('SiteNavigation').default,selections=[]
 await mount(Nav,{page:'home',onNavigate:id=>selections.push(id),connected:true,loading:false,user:null})
 assert.equal(document.querySelectorAll('.ui-site-links>button').length,5);assert(!button('Редактор мира'));assert(!button('Управление'))
 await flush(()=>button('Разделы').click());assert.equal(button('Разделы').getAttribute('aria-expanded'),'true')
 await flush(()=>document.querySelector('.ui-site-links>button:nth-child(2)').click());assert.deepEqual(selections,['character']);assert.equal(button('Разделы').getAttribute('aria-expanded'),'false')
 await flush(()=>button('Войти / Регистрация').click());assert.equal(selections.at(-1),'account')
})

test('Меню действий: выбор выполняется один раз, Escape возвращает фокус и не передаётся редактору',async()=>{
 const Menu=load('DisclosureMenu').default;let actions=0,escaped=0
 function Wrapper(){return React.createElement('div',{onKeyDown:()=>escaped++},React.createElement(Menu,{label:'Сцена'},React.createElement('button',{onClick:()=>actions++},'Экспорт')))}
 await mount(Wrapper);const details=document.querySelector('details'),summary=details.querySelector('summary')
 await flush(()=>summary.click());assert(details.open);await flush(()=>button('Экспорт').click());assert.equal(actions,1);assert(!details.open);assert.equal(document.activeElement,summary)
 await flush(()=>{summary.click();button('Экспорт').focus();button('Экспорт').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))});assert(!details.open);assert.equal(escaped,0);assert.equal(document.activeElement,summary)
 await flush(()=>{summary.click();document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}))});assert(!details.open)
})

test('Разделы персонажа: все прежние инструменты сохранены в четырёх понятных группах',()=>{
 const sections=load('characterSections').characterSections
 assert.equal(sections.length,17);assert.equal(new Set(sections.map(s=>s.id)).size,17);assert.equal(new Set(sections.map(s=>s.group)).size,4)
 for(const id of ['editor','play','journal','equipment','abilities','rules','physiology','magic','body','races','skills','training','appearance','templates','guide','actions','conditions'])assert(sections.some(s=>s.id===id))
})

test('Навигация рабочего раздела: клавиатура раскрывает нужную группу, мобильный список переключает тот же раздел',async()=>{
 const Navigation=load('WorkspaceNavigation').default,sections=load('characterSections').characterSections;let selected='editor'
 function Wrapper(){const [value,setValue]=React.useState('editor');React.useEffect(()=>{selected=value},[value]);return React.createElement(Navigation,{label:'Разделы персонажа',sections,selectedId:value,onSelect:setValue})}
 await mount(Wrapper);const first=document.querySelector('.ui-workspace-groups button')
 await flush(()=>first.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true})));assert.equal(selected,'guide');assert.equal(document.activeElement.textContent,'Путеводитель');assert(document.activeElement.closest('details').open)
 const select=document.querySelector('select');await flush(()=>{select.value='abilities';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});assert.equal(selected,'abilities');assert.equal(button('Способности').getAttribute('aria-pressed'),'true')
})

test('Лобби: смена групп сохраняет черновик и удаление разрешения удаляет закрытый раздел',async()=>{
 const Workbench=load('LobbyWorkbench').default;let available,setAvailable
 function Draft(){const [value,setValue]=React.useState('');return React.createElement('input',{'aria-label':'Черновик раунда',value,onChange:e=>setValue(e.currentTarget.value)})}
 function Wrapper(){const [selected,setSelected]=React.useState('round'),[enabled,setEnabled]=React.useState(true);React.useEffect(()=>{available=enabled;setAvailable=setEnabled},[enabled]);const sections=['game','heroes','round','world','chat','setup','editor','copies'].filter(id=>enabled||id!=='round').map(id=>({id,label:id,content:id==='round'?React.createElement(Draft):React.createElement('p',null,id)}));return React.createElement(Workbench,{label:'Инструменты лобби',sections,selectedId:selected,onSelectSection:setSelected})}
 await mount(Wrapper);const draft=document.querySelector('[aria-label="Черновик раунда"]');await input(draft,'Незавершённый план');await flush(()=>button('heroes').click());assert.equal(document.querySelector('[aria-label="Черновик раунда"]'),draft);assert(draft.closest('[role=tabpanel]').hidden)
 await flush(()=>button('round').click());assert.equal(draft.value,'Незавершённый план');assert(!draft.closest('[role=tabpanel]').hidden);await flush(()=>setAvailable(false));assert(!available);assert(!document.querySelector('[aria-label="Черновик раунда"]'));assert.equal(document.querySelector('[role=tabpanel]:not([hidden])').textContent,'game')
})

function appModules(){
 const screen=name=>({__esModule:true,default:()=>React.createElement('p',null,name)})
 function Draft(){const [value,setValue]=React.useState('');return React.createElement('input',{'aria-label':'Локальный черновик героя',value,onChange:e=>setValue(e.currentTarget.value)})}
 return modules({GuidePanel:screen('Путеводитель открыт'),ForumPanel:screen('Форум открыт'),LobbiesPanel:screen('Кампания открыта'),AccountPanel:screen('Аккаунт открыт'),SupportPanel:screen('Поддержка открыта'),PublicationsPanel:screen('Публикации'),WorldEntriesPanel:{__esModule:true,default:({manage})=>React.createElement('p',null,manage?'Закрытый редактор мира':'Справочник')},AdminPanel:screen('Закрытое управление'),CloudLibraryPanel:screen('Библиотека'),TutorialWelcome:screen('Добро пожаловать'),TutorialPage:screen('Обучение'),CharacterManager:{__esModule:true,default:Draft}})
}

test('Сайт: переходы и Назад/Вперёд сохраняют открытый черновик персонажа',async()=>{
 online=context();window.history.replaceState({existing:true},'','/?page=character&invite=abc');const App=appModules()('App').default;await mount(App)
 const draft=document.querySelector('[aria-label="Локальный черновик героя"]');assert(draft);await input(draft,'Не потерять')
 await flush(()=>button('Путеводитель').click());assert.equal(scrolledTo.top,0);assert.equal(document.activeElement.id,'gb-main-content');assert.equal(new URL(window.location.href).searchParams.get('page'),'guide');assert.equal(new URL(window.location.href).searchParams.get('invite'),'abc');assert.equal(window.history.state.existing,true);assert(draft.closest('[hidden]'))
 await act(async()=>{await new Promise(resolve=>{window.addEventListener('popstate',resolve,{once:true});window.history.back()});await new Promise(resolve=>setTimeout(resolve,20))});assert.equal(document.querySelector('[aria-label="Локальный черновик героя"]'),draft);assert.equal(draft.value,'Не потерять');assert(!draft.closest('[hidden]'))
 await act(async()=>{await new Promise(resolve=>{window.addEventListener('popstate',resolve,{once:true});window.history.forward()});await new Promise(resolve=>setTimeout(resolve,20))});assert(document.body.textContent.includes('Путеводитель открыт'));assert(draft.closest('[hidden]'))
 await flush(()=>document.querySelector('.ui-site-links summary').click());await flush(()=>button('Новости').click());assert.equal(document.activeElement.id,'gb-main-content');assert(!document.querySelector('.ui-site-links details').open)
})

test('Сайт: прямая административная ссылка и восстановление пароля сохраняют защиту экранов',async()=>{
 online=context();window.history.replaceState(null,'','/?page=worldEditor');const App=appModules()('App').default;await mount(App);assert(!document.body.textContent.includes('Закрытый редактор мира'));assert(document.body.textContent.includes('Аккаунт открыт'))
 online={...online,user:{id:'editor',displayName:'Редактор',role:'WORLD_EDITOR'}};await flush(()=>root.render(React.createElement(App)));assert(document.body.textContent.includes('Закрытый редактор мира'))
 online={...online,recovering:true};await flush(()=>root.render(React.createElement(App)));assert(!document.body.textContent.includes('Закрытый редактор мира'));assert(document.body.textContent.includes('Аккаунт открыт'))
 online={...online,recovering:false,user:{id:'player',displayName:'Игрок',role:'PLAYER'}};await flush(()=>root.render(React.createElement(App)));assert(!document.body.textContent.includes('Закрытый редактор мира'))
})

test('Аккаунт: показ пароля сохраняет значение, не отправляет форму и сбрасывается при смене режима',async()=>{
 let calls=0;online={...context(),login:async()=>{calls++}};await mount(load('AccountPanel').default)
 const password=document.querySelector('[aria-label="Пароль"]');await input(password,'example-password');await flush(()=>button('Показать').click());assert.equal(password.type,'text');assert.equal(password.value,'example-password');assert.equal(calls,0)
 await flush(()=>button('Регистрация').click());assert.equal(document.querySelector('[aria-label="Пароль"]').type,'password');assert.equal(document.querySelector('[aria-label="Пароль"]').value,'example-password');assert.equal(calls,0)
})

test('Аккаунт: ошибка входа объявляется ошибкой, черновик остаётся на месте',async()=>{
 online={...context(),login:async()=>{throw new Error('Проверь email и пароль.')}};await mount(load('AccountPanel').default)
 await input(document.querySelector('input[type=email]'),'player@example.test');await input(document.querySelector('[aria-label="Пароль"]'),'keep-this-value')
 await flush(()=>document.querySelector('.w6-auth-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(document.querySelector('[role=alert]').textContent,'Проверь email и пароль.');assert.equal(document.querySelector('[aria-label="Пароль"]').value,'keep-this-value');assert(!button('Войти').disabled)
})

test('Иллюстрации в формах: раскрытие сохраняет поиск и выбранное изображение',async()=>{
 const presets=Array.from({length:26},(_,i)=>'image-'+i),media={visualArtwork:Object.fromEntries(presets.map(k=>[k,'/image.webp'])),artworkLabels:Object.fromEntries(presets.map(k=>[k,k])),artworkMetadata:{},artworkCategoryLabels:{legacy:'Все'},artworkSource:()=>'/image.webp'}
 const Picker=modules({visualMedia:media,characterModel:{resourceFields:[]},uploadSafety:{}})('VisualElements').ArtworkPicker
 let chosen
 function Wrapper(){const [value,setValue]=React.useState('auto');React.useEffect(()=>{chosen=value},[value]);return React.createElement(Picker,{collapsible:true,label:'Портрет',presets,value,onChange:setValue})}
 await mount(Wrapper);const details=document.querySelector('.ui-media-settings'),summary=details.querySelector('summary');assert(!details.open)
 await flush(()=>summary.click());await input(document.querySelector('input[type=search]'),'image-25');assert.equal(document.querySelectorAll('.w6-art-option').length,1)
 await flush(()=>button('image-25').click());assert.equal(chosen,'image-25');await flush(()=>summary.click());assert(!details.open)
 await flush(()=>summary.click());assert(details.open);assert.equal(document.querySelector('input[type=search]').value,'image-25');assert.equal(button('image-25').getAttribute('aria-pressed'),'true')
})

test('Оформление: текст, подсказки, активные действия и ошибки сохраняют читаемый контраст',()=>{
 const css=fs.readFileSync('src/uiSystem.css','utf8'),tokens=Object.fromEntries([...css.matchAll(/--(ui-[a-z-]+):\s*(#[a-f0-9]{6});/gi)].map(m=>[m[1],m[2]]))
 const luminance=hex=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722}
 for(const [foreground,background] of [['ui-text','ui-surface'],['ui-muted','ui-surface'],['ui-accent-text','ui-accent-surface'],['ui-danger','ui-danger-surface']]){const a=luminance(tokens[foreground]),b=luminance(tokens[background]);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,foreground+' readable on '+background)}
})

test('Оформление: параметры сохраняются отдельно от героя, повреждённые данные отклоняются',()=>{
 const p=load('interfacePreferences'),marker='world6.test.hero-draft';localStorage.setItem(marker,'UNSAVED-HERO')
 for(const bad of [null,{}, {...p.defaultInterfacePreferences,accent:'unknown'},{...p.defaultInterfacePreferences,density:'tiny'},{...p.defaultInterfacePreferences,atmosphere:'yes'},{...p.defaultInterfacePreferences,extra:true}])assert(!p.isInterfacePreferences(bad))
 assert(p.updateInterfacePreferences({...p.defaultInterfacePreferences,accent:'mana',density:'compact',text:'large'}))
 assert.equal(document.documentElement.dataset.uiAccent,'mana');assert.equal(document.documentElement.dataset.uiText,'large')
 assert.equal(JSON.parse(localStorage.getItem(p.INTERFACE_PREFERENCES_KEY)).density,'compact');assert.equal(localStorage.getItem(marker),'UNSAVED-HERO')
 p.updateInterfacePreferences(p.defaultInterfacePreferences)
})
test('Оформление: отказ хранилища сохраняет рабочий интерфейс в памяти',()=>{
 const p=load('interfacePreferences'),original=dom.window.Storage.prototype.setItem
 try{dom.window.Storage.prototype.setItem=()=>{throw Error('No storage')};assert.equal(p.updateInterfacePreferences({accent:'shadow'}),false);assert.equal(document.documentElement.dataset.uiAccent,'shadow')}
 finally{dom.window.Storage.prototype.setItem=original;p.updateInterfacePreferences(p.defaultInterfacePreferences)}
})
test('Оформление: настройки из другой вкладки применяются и неверный формат возвращает исходный вид',async()=>{
 const p=load('interfacePreferences');await mount(p.default)
 await flush(()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key:p.INTERFACE_PREFERENCES_KEY,newValue:JSON.stringify({...p.defaultInterfacePreferences,accent:'shadow',atmosphere:false})})))
 assert.equal(document.documentElement.dataset.uiAccent,'shadow');assert.equal(document.documentElement.dataset.uiAtmosphere,'off')
 await flush(()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key:p.INTERFACE_PREFERENCES_KEY,newValue:'not-json'})))
 assert.equal(document.documentElement.dataset.uiAccent,'gold')
})
test('Оформление: выбор не закрывает панель и не отправляет соседнюю форму',async()=>{
 let submitted=0;const Appearance=load('InterfaceAppearance').default
 function Wrapper(){return React.createElement('form',{onSubmit:e=>{e.preventDefault();submitted++}},React.createElement(Appearance))}
 await mount(Wrapper);const summary=document.querySelector('summary');await flush(()=>summary.click())
 await flush(()=>document.querySelector('[data-accent="mana"] input').click());assert(document.querySelector('details').open);assert.equal(document.documentElement.dataset.uiAccent,'mana')
 await flush(()=>button('Вернуть исходное оформление').click());assert.equal(document.documentElement.dataset.uiAccent,'gold');assert.equal(submitted,0);assert(document.querySelector('details').open)
 await flush(()=>summary.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert(!document.querySelector('details').open);assert.equal(document.activeElement,summary)
})
test('Быстрый переход: фильтрует права, управляется клавиатурой и сохраняет черновик страницы',async()=>{
 const Quick=load('QuickNavigation').default,selections=[]
 function Wrapper(){const [open,setOpen]=React.useState(false);return React.createElement('div',null,React.createElement('textarea',{defaultValue:'НЕСОХРАНЁННЫЙ ТЕКСТ'}),React.createElement('button',{onClick:()=>setOpen(true)},'Открыть поиск'),React.createElement(Quick,{open,onClose:()=>setOpen(false),onNavigate:id=>selections.push(id),role:'PLAYER'}))}
 await mount(Wrapper);const opener=button('Открыть поиск');await flush(()=>{opener.focus();opener.click()})
 const search=document.querySelector('[aria-label="Найти раздел сайта"]');assert.equal(document.activeElement,search)
 await input(search,'редактор мира');assert.equal(document.querySelectorAll('.realm-command-results>button').length,0)
 await input(search,'персонаж');assert.equal(document.querySelectorAll('.realm-command-results>button').length,1)
 await flush(()=>search.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.deepEqual(selections,['character']);assert(!document.querySelector('[aria-label="Быстрый переход"]'));assert.equal(document.querySelector('textarea').value,'НЕСОХРАНЁННЫЙ ТЕКСТ')
})

test('Оформление: панели сайта и развёрнутого редактора независимо группируют переключатели',async()=>{
 const Appearance=load('InterfaceAppearance').default
 await mount(()=>React.createElement('div',null,React.createElement(Appearance),React.createElement(Appearance)))
 const panels=[...document.querySelectorAll('.realm-appearance')]
 assert.notEqual(panels[0].querySelector('input[type=radio]').name,panels[1].querySelector('input[type=radio]').name)
 await flush(()=>panels[1].querySelector('[data-accent="shadow"] input').click())
 for(const panel of panels)assert(panel.querySelector('[data-accent="shadow"] input').checked)
 await flush(()=>panels[0].querySelector('[data-accent="gold"] input').click())
 for(const panel of panels)assert(panel.querySelector('[data-accent="gold"] input').checked)
})
test('Быстрый переход: Escape возвращает фокус, Tab остаётся внутри диалога',async()=>{
 const Quick=load('QuickNavigation').default
 function Wrapper(){const [open,setOpen]=React.useState(false);return React.createElement('div',null,React.createElement('button',{onClick:()=>setOpen(true)},'Поиск раздела'),React.createElement(Quick,{open,onClose:()=>setOpen(false),onNavigate(){},role:'ADMIN'}))}
 await mount(Wrapper);const opener=button('Поиск раздела');await flush(()=>{opener.focus();opener.click()})
 const dialog=document.querySelector('[aria-label="Быстрый переход"]'),search=dialog.querySelector('input'),last=[...dialog.querySelectorAll('button')].at(-1)
 await flush(()=>search.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));assert.equal(document.activeElement,last)
 await flush(()=>last.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert(!document.querySelector('[aria-label="Быстрый переход"]'));assert.equal(document.activeElement,opener)
})
test('Рабочая навигация: поиск сохраняет все инструменты и незавершённый текст',async()=>{
 const Nav=load('WorkspaceNavigation').default,sections=load('characterSections').characterSections;let selected='editor'
 function Wrapper(){const [id,setId]=React.useState('editor');React.useEffect(()=>{selected=id},[id]);return React.createElement('div',null,React.createElement('textarea',{defaultValue:'ЧЕРНОВИК'}),React.createElement(Nav,{label:'Инструменты',sections,selectedId:id,onSelect:setId,tabs:true}))}
 await mount(Wrapper);const search=document.querySelector('[aria-label="Поиск: Инструменты"]');await input(search,'анатом')
 const buttons=[...document.querySelectorAll('.ui-workspace-groups button')];assert.equal(buttons.length,1);assert.equal(buttons[0].textContent,'Анатомия')
 assert.equal(document.querySelector('.ui-workspace-select select').options.length,17);assert.equal(document.querySelector('.ui-workspace-select select').value,'editor')
 await flush(()=>search.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true})));assert.equal(document.activeElement,buttons[0]);await flush(()=>buttons[0].click());assert.equal(selected,'body')
 await input(search,'');assert.equal(document.querySelectorAll('.ui-workspace-groups button').length,17);assert.equal(document.querySelector('textarea').value,'ЧЕРНОВИК')
})
test('Приложение: Ctrl+K открывает поиск и сохраняет параметры приглашения при переходе',async()=>{
 online=context();window.history.replaceState(null,'','/?page=home&invite=keep-invite')
 const App=appModules()('App').default;await mount(App)
 await flush(()=>window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true})))
 const search=document.querySelector('[aria-label="Найти раздел сайта"]');assert(search);await input(search,'форум')
 await flush(()=>search.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.equal(new URL(location.href).searchParams.get('page'),'forum');assert.equal(new URL(location.href).searchParams.get('invite'),'keep-invite')
})
test('Оформление: все акценты сохраняют контраст текста и активного действия',()=>{
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
 for(const [accent,surface,text]of [['#e4c78b','#3b3326','#ffedc9'],['#94dce4','#163b45','#d6f8fc'],['#c3b1f1','#312847','#efe5ff']]){assert(contrast(text,surface)>=4.5);assert(contrast(accent,'#111b28')>=4.5)}
})

function viewport(initial){
 const original=window.matchMedia,listeners=new Set();let narrow=initial
 window.matchMedia=()=>({get matches(){return narrow},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)})
 return {resize:async value=>flush(()=>{narrow=value;for(const fn of listeners)fn()}),restore:()=>{window.matchMedia=original}}
}

test('Игровая сцена: карта и план сохраняют выбор, черновик и DOM при смене ширины',async()=>{
 const media=viewport(false),Workspace=load('GameSceneWorkspace').default;let mounts=0
 function Plan(){React.useEffect(()=>{mounts++},[]);return React.createElement('input',{'aria-label':'Черновик хода',defaultValue:''})}
 function Wrapper(){const [target,setTarget]=React.useState('Без цели');return React.createElement(Workspace,{queueCount:2,board:React.createElement('button',{onClick:()=>setTarget('Выбраны ворота')},target),actions:React.createElement(Plan)})}
 try{
  await mount(Wrapper);const field=document.querySelector('[aria-label="Черновик хода"]');await input(field,'Подойти и постучать');await flush(()=>button('Без цели').click())
  assert(document.querySelector('.realm-scene-switch').hidden);assert(!document.querySelector('.realm-scene-board').hidden);assert(!document.querySelector('.realm-scene-composer').hidden)
  await media.resize(true);assert(!document.querySelector('.realm-scene-switch').hidden);assert(document.querySelector('.realm-scene-composer').hidden)
  await flush(()=>document.querySelector('[data-pane="actions"]').click());assert(document.querySelector('.realm-scene-board').hidden);assert(!document.querySelector('.realm-scene-composer').hidden)
  assert.equal(field.value,'Подойти и постучать');assert.equal(document.querySelector('[aria-label="Черновик хода"]'),field);assert(button('Выбраны ворота'))
  await media.resize(false);assert(!document.querySelector('.realm-scene-board').hidden);assert(!document.querySelector('.realm-scene-composer').hidden);assert.equal(mounts,1)
 }finally{await flush(()=>root.render(null));media.restore()}
})

test('Игровая сцена: переключение панели не отменяет отправку и поддерживает клавиатуру',async()=>{
 const media=viewport(true),Workspace=load('GameSceneWorkspace').default;let resolve,sends=0
 const pending=new Promise(done=>{resolve=done})
 function Plan(){const [status,setStatus]=React.useState('Отправить тестовый ход');return React.createElement('button',{onClick:async()=>{sends++;setStatus('Отправляется');await pending;setStatus('Подтверждён')}},status)}
 try{
  await mount(Workspace,{queueCount:1,board:React.createElement('p',null,'Карта'),actions:React.createElement(Plan)})
  const map=document.querySelector('[data-pane="map"]'),actions=document.querySelector('[data-pane="actions"]')
  await flush(()=>map.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));assert.equal(document.activeElement,actions);assert(!document.querySelector('.realm-scene-composer').hidden)
  await flush(()=>button('Отправить тестовый ход').click());await flush(()=>map.click());await flush(()=>resolve());await flush(()=>actions.click())
  assert(button('Подтверждён'));assert.equal(sends,1)
  await flush(()=>actions.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true})));assert.equal(document.activeElement,map)
 }finally{await flush(()=>root.render(null));media.restore()}
})

function gameTableModules(){
 const component=defaultComponent=>({__esModule:true,default:defaultComponent})
 return modules({LobbyGameSession:component(({onSetup})=>React.createElement('button',{onClick:onSetup},'Перейти к подготовке')),LobbyPlayerScreen:component(()=>React.createElement('p',null,'Экран игрока')),LobbyStory:component(()=>React.createElement('input',{'aria-label':'Черновик реплики НПС'})),LobbySceneLaunch:component(()=>React.createElement('p',null,'Подготовка открыта')),LobbyRoundResults:component(({active})=>React.createElement('p',{'data-review-active':String(active)},'Сохранённый раунд'))})('LobbyGameTable').default
}
function tableProps(role='GM',permissions=[]){return {accountId:'gm',lobby:{id:'qa',title:'Партия',status:'playing',myRole:role,myPermissions:permissions,members:[]},characters:[{id:'hero',name:'Элиан',ownerId:'gm',approved:true}],checkingAccess:false,onHeroes(){},onRound(){},onEditor(){}}}

test('Пульт ведущего: смена инструментов и сворачивание сохраняют реплику и выбранного героя',async()=>{
 const Table=gameTableModules();await mount(Table,tableProps());await flush();const desk=document.querySelector('.realm-master-desk');assert(!desk.open)
 await flush(()=>desk.querySelector('summary').click());const field=document.querySelector('[aria-label="Черновик реплики НПС"]');await input(field,'Стражник узнаёт героя')
 await flush(()=>button('Подготовка сцены').click());await flush(()=>button('Начать игру на сцене').click());await flush();assert(document.body.textContent.includes('Подготовка открыта'))
 await flush(()=>button('Просмотр раундов').click());assert.equal(document.querySelector('[data-review-active]').dataset.reviewActive,'true')
 await flush(()=>desk.querySelector('summary').click());assert.equal(document.querySelector('[data-review-active]').dataset.reviewActive,'false')
 await flush(()=>desk.querySelector('summary').click());await flush(()=>button('Диалоги и задания').click());assert.equal(field.value,'Стражник узнаёт героя');assert.equal(document.querySelector('[aria-label="Черновик реплики НПС"]'),field)
 assert.equal(document.querySelector('[aria-label="Активный игровой герой"]').value,'hero')
})

test('Пульт ведущего: подготовка из сессии открывает нужную панель, отзыв прав убирает секретные инструменты',async()=>{
 const Table=gameTableModules(),props=tableProps();await mount(Table,props);await flush(()=>button('Перейти к подготовке').click());await flush()
 assert(document.querySelector('.realm-master-desk').open);assert.equal(button('Подготовка сцены').getAttribute('aria-selected'),'true');assert(document.body.textContent.includes('Подготовка открыта'))
 await flush(()=>root.render(React.createElement(Table,tableProps('ASSISTANT',['npcs','viewSecrets']))));assert(button('Диалоги и задания'));assert(!button('Подготовка сцены'));assert(!button('Просмотр раундов'));assert(!button('Вести раунд'))
 await flush(()=>root.render(React.createElement(Table,tableProps('ASSISTANT',['npcs']))));assert(!document.querySelector('.realm-master-desk'));assert(!document.querySelector('[aria-label="Черновик реплики НПС"]'))
 await flush(()=>root.render(React.createElement(Table,tableProps('PLAYER'))));assert(!button('Открыть редактор сцены'));assert(button('Герои кампании'))
})

test('Начало партии: прогресс обновляется с сервера, готовность ведёт к участникам',async()=>{
 const Guide=load('SessionStartGuide').default,navigation=[],ready=[{id:'friends',label:'Игрок вошёл',done:true,section:'setup'},{id:'heroes',label:'Герои приняты',done:false,section:'heroes'},{id:'scene',label:'Сцена открыта',done:false,section:'game'},{id:'players',label:'Ждём игроков',done:false,section:'game'}]
 const props={ready,disabled:false,paused:false,onMembers:()=>navigation.push('members'),onHeroes:()=>navigation.push('heroes'),onScene:()=>navigation.push('scene'),onReadiness:()=>navigation.push('readiness')}
 await mount(Guide,props);assert.equal(document.querySelector('progress').value,1);assert.equal(document.querySelector('[data-current=true] strong').textContent,'Подготовьте героев');assert.equal(document.querySelectorAll('.realm-start-steps details[open]').length,1)
 await flush(()=>document.querySelector('.realm-start-steps li:last-child summary').click());assert(document.querySelector('.realm-start-steps li:last-child details').open)
 await flush(()=>button('Проверить героев').click());await flush(()=>button('Подготовить сцену').click());await flush(()=>button('Проверить готовность').click());assert.deepEqual(navigation,['heroes','scene','readiness'])
 await flush(()=>root.render(React.createElement(Guide,{...props,ready:ready.map(r=>({...r,done:true}))})));assert.equal(document.querySelector('progress').value,4);assert.equal(document.querySelectorAll('button').length,0)
 await flush(()=>root.render(React.createElement(Guide,{...props,disabled:true,paused:true})));assert([...document.querySelectorAll('button')].every(b=>b.disabled));assert(document.querySelector('[role=status]').textContent.includes('на паузе'))
})

test('Приглашение: копируется чистая ссылка, отказ буфера оставляет её выделенной',async()=>{
 const Invite=load('PartyInvitation').default,original=Object.getOwnPropertyDescriptor(window.navigator,'clipboard'),copied=[]
 window.history.replaceState(null,'','/world6-rpg/?lobby=old&code=PRIVATE#access_token=PRIVATE')
 try{
  Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}})
  await mount(Invite,{code:'new-party'});await flush(()=>button('Копировать ссылку партии').click());assert.equal(copied[0],'https://interface.example.test/world6-rpg/?invite=new-party');assert(document.querySelector('[role=status]').textContent.includes('скопировано'))
  Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Denied')}}})
  await flush(()=>button('Копировать ссылку партии').click());const field=document.querySelector('input');assert.equal(document.activeElement,field);assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,field.value.length);assert(document.querySelector('[role=status]').textContent.includes('вручную'))
 }finally{if(original)Object.defineProperty(window.navigator,'clipboard',original);else delete window.navigator.clipboard;window.history.replaceState(null,'','/')}
})

test('Приглашение: поздний ответ копирования не меняет карточку другой партии',async()=>{
 const Invite=load('PartyInvitation').default,original=Object.getOwnPropertyDescriptor(window.navigator,'clipboard');let resolve
 try{
  Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(done=>{resolve=done})}})
  await mount(Invite,{code:'first'});await flush(()=>button('Копировать ссылку партии').click());assert(button('Копируем…').disabled)
  await mount(Invite,{code:'second'});await flush(()=>resolve());assert.equal(document.querySelector('[role=status]').textContent,'');assert(document.querySelector('input').value.endsWith('?invite=second'));assert(!button('Копировать ссылку партии').disabled)
 }finally{if(original)Object.defineProperty(window.navigator,'clipboard',original);else delete window.navigator.clipboard}
})

test('Подготовка сцены: пустая кампания ведёт к редактору и героям без записи состояния',async()=>{
 const calls=[],navigation=[];online={...context(),request:async(url,init={})=>{calls.push({url,method:init.method??'GET'});return {revision:1,scenes:{scenes:[]},actors:[{id:'npc',name:'Страж',approved:true,npc:true}]}}}
 const Launch=modules({SceneViewport:{__esModule:true,default:()=>null}})('LobbySceneLaunch').default
 await mount(Launch,{accountId:'gm',lobbyId:'room',disabled:false,onEditor:()=>navigation.push('editor'),onHeroes:()=>navigation.push('heroes')})
 await flush(()=>button('Создать сцену в редакторе').click());await flush(()=>button('Перейти к героям партии').click());assert.deepEqual(navigation,['editor','heroes']);assert(calls.every(c=>c.method==='GET'));assert(button('Разместить героев и открыть сцену').disabled)
})

test('Арсенал: поиск и форма не меняют выбор; явный выбор закрывает каталог и возвращает фокус',async()=>{
 const Picker=load('GameAbilityPicker').default,chosen=[],options={frame:null,targets:[],items:[],abilities:[{id:'ward',name:'Щит'},{id:'beam',name:'Световой луч',rangeM:12,spatial:{shape:'beam',lengthM:6,radiusM:.3,includeCaster:false}},{id:'sphere',name:'Водная сфера',spatial:{shape:'sphere',radiusM:2,includeCaster:false}}]}
 await mount(Picker,{options,value:'ward',disabled:false,onChoose:id=>chosen.push(id)})
 const catalogue=document.querySelector('details');await flush(()=>catalogue.querySelector('summary').click());await input(document.querySelector('[aria-label="Поиск способности"]'),'СВЕТОВОЙ')
 assert.equal(document.querySelectorAll('.realm-ability-option').length,1);assert.equal(document.querySelector('[aria-label="Быстрая способность"]').value,'ward');assert.equal(chosen.length,0)
 const filter=document.querySelector('[aria-label="Фильтр формы способности"]');await flush(()=>{filter.value='sphere';filter.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});assert.equal(document.querySelectorAll('.realm-ability-option').length,0);assert(document.querySelector('[aria-label="Выбранная способность"]').textContent.includes('Щит'))
 await flush(()=>button('Сбросить поиск способностей').click());await flush(()=>document.querySelector('[aria-label="Выбрать способность Световой луч"]').click());assert.deepEqual(chosen,['beam']);assert(!catalogue.open);assert.equal(document.activeElement,document.querySelector('[aria-label="Быстрая способность"]'))
})

test('Арсенал: карточка использует снимок оплаченного заряда; повторный выбор способности его не сбрасывает',async()=>{
 const Picker=load('GameAbilityPicker').default,chosen=[],options={frame:null,targets:[],items:[],abilities:[{id:'spell',name:'Новый шаблон',rangeM:1,cost:{mana:99,shadow:0,stamina:0},spatial:{shape:'sphere',radiusM:8,includeCaster:false}}],casts:[{id:'paid',abilityId:'spell',name:'Сохранённый луч',rangeM:10,status:'ready',binding:'unbound',readyAt:0,holdUntil:null,holdCost:{mana:0,shadow:0,stamina:0},spatial:{shape:'beam',lengthM:4,radiusM:.2,includeCaster:false}}]}
 const props={options,value:'spell',castId:'paid',disabled:false,onChoose:id=>chosen.push(id)};await mount(Picker,props)
 const card=document.querySelector('[aria-label="Выбранная способность"]');assert(card.textContent.includes('Сохранённый луч'));assert(card.textContent.includes('длина 4 м'));assert(card.textContent.includes('10 м'));assert(!card.textContent.includes('99'));assert(!document.querySelector('[aria-label="Базовый расход подготовки"]'))
 await flush(()=>document.querySelector('[aria-label="Выбрать способность Новый шаблон"]').click());assert.equal(chosen.length,0)
 await flush(()=>root.render(React.createElement(Picker,{...props,options:{...options,casts:[]}})));assert(!document.querySelector('[aria-label="Выбранная способность"]'));assert.equal(chosen.length,0)
})

test('Арсенал: исчезнувшая способность не заменяется, заблокированный выбор не вызывает команду',async()=>{
 const Picker=load('GameAbilityPicker').default,chosen=[],options={frame:null,targets:[],items:[],abilities:[{id:'other',name:'Другая'}]}
 await mount(Picker,{options,value:'gone',disabled:true,onChoose:id=>chosen.push(id)});assert(document.querySelector('[role=alert]').textContent.includes('автоматической замены нет'));assert.equal(document.querySelector('[aria-label="Быстрая способность"]').value,'gone')
 const field=document.querySelector('[aria-label="Быстрая способность"]');await flush(()=>{field.value='other';field.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await flush(()=>document.querySelector('[aria-label="Выбрать способность Другая"]').click());assert.equal(chosen.length,0)
})

test('Способности: явный заряд нельзя повторить, пара действий требует двух свободных мест',async()=>{
 const Bar=load('GameActionBar').default,actions=[],options={frame:null,targets:[],items:[],abilities:[{id:'spell',name:'Щит',cost:{mana:3,shadow:0,stamina:0}}],casts:[{id:'paid',abilityId:'spell',name:'Щит',status:'ready',binding:'unbound',readyAt:0,holdUntil:null,holdCost:{mana:0,shadow:0,stamina:0}}]}
 const base={map:null,point:null,contactId:'',objectId:'',options,disabled:false,draft:{...load('gameControls').emptyQuickAction(),mode:'ability',ability:'spell',castId:'paid'},onChange:()=>{},onAdd:a=>{actions.push(a);return true},onAddMany:a=>{actions.push(...a);return true}}
 await mount(Bar,{...base,plannedActions:[{kind:'ability',abilityId:'spell',stage:'release',castId:'paid',target:{kind:'self'},note:''}]});assert(button('Применить способность').disabled);await flush(()=>button('Применить способность').click());assert.equal(actions.length,0);assert(document.querySelector('[aria-label="Проверка применения способности"]').textContent.includes('уже добавлен'))
 await mount(Bar,{...base,draft:{...base.draft,castId:''},plannedActions:Array.from({length:19},()=>({kind:'wait',seconds:1,note:''}))});assert(button('Подготовить и применить').disabled);assert(document.body.textContent.includes('1 из 20 мест свободно'));assert(!button('Подготовить способность').disabled)
})

test('Обзор плана показывает состав личной очереди и число действий с замечаниями',async()=>{
 const Overview=load('GamePlanOverview').default;await mount(Overview,{actions:[{kind:'wait',seconds:1,note:''},{kind:'speak',text:'Стой',volume:'normal',target:{kind:'none'},note:''},{kind:'ability',abilityId:'spell',stage:'prepare',target:{kind:'none'},note:''}],issues:2})
 const view=document.querySelector('[aria-label="Обзор плана хода"]');assert(view.textContent.includes('3 / 20'));assert(view.textContent.includes('Речь 1'));assert(view.textContent.includes('Способности 1'));assert(view.querySelector('[role=status]').textContent.includes('действий: 2'))
})
