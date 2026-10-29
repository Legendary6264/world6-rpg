import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultEditorWorkspace,editorWorkspaceKey,readEditorWorkspace,writeEditorWorkspace} from '../src/sceneEditorWorkspace.ts'

const storage=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}}
test('Рабочее место: настройки и слои сохраняются по проектам, без записи сцены',()=>{
 const store=storage(),prefs={...defaultEditorWorkspace(),snap:true,snapStep:.5,surfaceSnap:false,gizmo:true,libraryOpen:false,libraryTab:'assemblies',selectionFilter:'props',layerMap:{scene:{hidden:['roof'],protected:['wall']}}}
 writeEditorWorkspace('account:a/lobby:one',prefs,store)
 assert.deepEqual(readEditorWorkspace('account:a/lobby:one',store),{value:prefs,notice:''})
 assert.deepEqual(readEditorWorkspace('account:b/lobby:one',store).value,defaultEditorWorkspace())
 assert.deepEqual(readEditorWorkspace('account:a/lobby:two',store).value,defaultEditorWorkspace())
 assert(!store.data.get(editorWorkspaceKey('account:a/lobby:one')).includes('objects'))
 const size=store.data.size;writeEditorWorkspace(undefined,prefs,store);assert.equal(store.data.size,size)
})
test('Рабочее место: повреждения, будущая версия, переполнение и недоступное хранилище безопасны',()=>{
 const store=storage(),key=editorWorkspaceKey('scope'),base=defaultEditorWorkspace()
 for(const raw of ['{',JSON.stringify({version:2,workspace:base}),JSON.stringify({version:1,workspace:{...base,snapStep:NaN}}),JSON.stringify({version:1,workspace:{...base,layerMap:{scene:{hidden:Array(251).fill('x'),protected:[]}}}}),' '.repeat(1024*1024+1)]){
  store.setItem(key,raw);const result=readEditorWorkspace('scope',store);assert.deepEqual(result.value,base);assert(result.notice)
 }
 assert.throws(()=>writeEditorWorkspace('scope',{...base,selectionFilter:'bogus'},store),/Некорректные/)
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}}
 assert(readEditorWorkspace('scope',blocked).notice);assert.throws(()=>writeEditorWorkspace('scope',base,blocked),/quota/)
 writeEditorWorkspace('scope',base,store);assert.equal(readEditorWorkspace('scope',store).notice,'')
})

test('Панели: старые настройки сохраняют слои, новые ширины и видимость изолированы по проекту',()=>{
 const store=storage(),legacy={...defaultEditorWorkspace(),libraryOpen:false,layerMap:{scene:{hidden:['roof'],protected:['wall']}}};delete legacy.panels
 store.setItem(editorWorkspaceKey('old'),JSON.stringify({version:1,workspace:legacy}))
 const restored=readEditorWorkspace('old',store);assert.equal(restored.notice,'');assert.deepEqual(restored.value.layerMap,legacy.layerMap);assert.equal(restored.value.libraryOpen,false);assert.equal(restored.value.panels.libraryWidth,280)
 const changed={...restored.value,panels:{libraryWidth:340,inspectorWidth:380,inspectorOpen:false}};writeEditorWorkspace('old',changed,store)
 assert.deepEqual(readEditorWorkspace('old',store).value,changed);assert.equal(readEditorWorkspace('other',store).value.panels.inspectorOpen,true)
 assert.throws(()=>writeEditorWorkspace('old',{...changed,panels:{...changed.panels,libraryWidth:Infinity}},store),/размеры панелей/)
 assert.deepEqual(readEditorWorkspace('old',store).value,changed,'Invalid layout never overwrites valid stored preferences')
})
