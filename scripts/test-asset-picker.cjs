const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url'),{JSDOM}=require('jsdom')
const dom=new JSDOM('<div id="root"></div>',{url:'https://world6.example.test/'})
Object.assign(global,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true})
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),cache=new Map()
function load(name){
 if(name.endsWith('.css'))return {}
 if(cache.has(name))return cache.get(name).exports
 const file=['.tsx','.ts'].map(ext=>path.resolve('src',name+ext)).find(fs.existsSync);assert(file,name)
 const module={exports:{}};cache.set(name,module)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),module,module.exports)
 return module.exports
}
const {ArtworkPicker}=load('VisualElements'),media=load('visualMedia'),root=createRoot(document.getElementById('root'))
const AbilityVisualPicker=load('AbilityVisualPicker').default,{abilityVisualFamilies}=load('abilityVisuals')
test.after(async()=>{await act(async()=>root.unmount());dom.window.close()})
const click=async button=>act(async()=>button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label)
async function search(query){const input=document.querySelector('input[type="search"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,query);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})}
test('Настоящий выбор изображения: поиск находит предмет с дальней страницы и возвращает его стабильный ключ',async()=>{
 let selected;const key=media.itemPresets.at(-1)
 await act(async()=>root.render(React.createElement(ArtworkPicker,{label:'Предмет',presets:media.itemPresets,onChange:value=>{selected=value}})))
 assert.equal(document.querySelectorAll('.w6-art-option').length,24)
 await search(media.artworkLabels[key]);const chosen=[...document.querySelectorAll('.w6-art-option')].find(b=>b.textContent===media.artworkLabels[key]);assert(chosen)
 await click(chosen);assert.equal(selected,key)
 await search('неизвестное-имя-zz');assert.equal(document.querySelectorAll('.w6-art-option').length,0);assert.match(document.body.textContent,/изображений нет/)
})
test('Выбранный портрет сохраняется видимым при переключении страниц и категории существ',async()=>{
 const key=media.portraitPresets.at(-1)
 await act(async()=>root.render(React.createElement(ArtworkPicker,{key:'portrait',label:'Портрет',value:key,presets:media.portraitPresets,onChange:()=>{}})))
 assert.match(document.querySelector('.gb-art-current').textContent,new RegExp(media.artworkLabels[key]))
 await click(button('Далее'));assert.equal(document.querySelectorAll('.w6-art-option').length,24)
 const category=document.querySelector('.gb-art-filter select');assert(category)
 await act(async()=>{category.value='creature';category.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 assert(document.querySelectorAll('.w6-art-option').length<=24);assert.match(document.querySelector('.gb-art-current').textContent,new RegExp(media.artworkLabels[key]))
})
test('Заблокированный редактор блокирует выбор, поиск и загрузку изображений',async()=>{
 await act(async()=>root.render(React.createElement(ArtworkPicker,{key:'disabled',label:'Объект',presets:media.objectPresets,disabled:true,onChange:()=>{throw Error('Запрещённое изменение')}})))
 const field=document.querySelector('fieldset');assert(field.disabled)
 for(const element of field.querySelectorAll('button,input,select'))assert(element.matches(':disabled'))
})
test('Все 60 оформлений доступны в сгруппированном редакторе, включая новый вариант и автоматический школьный мотив',async()=>{
 let selected
 const props={schoolId:'contracts',onChange:value=>{selected=value}}
 await act(async()=>root.render(React.createElement(AbilityVisualPicker,props)))
 const select=document.querySelector('.w6-visual-picker select')
 assert.deepEqual(new Set([...select.options].map(o=>o.value)),new Set(['auto','none',...abilityVisualFamilies.map(f=>f.id)]))
 assert.equal(document.querySelector('.w6-visual-preview [data-vfx-family]').getAttribute('data-vfx-family'),'contracts')
 await act(async()=>{select.value='frost';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 assert.equal(selected.familyId,'frost')
 await act(async()=>root.render(React.createElement(AbilityVisualPicker,{...props,value:selected})))
 assert.equal(document.querySelector('.w6-visual-preview [data-vfx-family]').getAttribute('data-vfx-family'),'frost')
})
