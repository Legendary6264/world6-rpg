const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const {pathToFileURL}=require('node:url'),T=require('three'),cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(cache.has(name))return cache.get(name).exports
 const file=path.resolve('src',name+'.ts'),mod={exports:{}};cache.set(name,mod)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
}
const {createDefaultCharacter}=load('characterModel'),{buildCharacter,characterRigFor,disposeObject}=load('viewportGeometry')

test('Лист героя: цельный портрет, раздельные пальцы и скелет сохраняют тело и выбор областей',()=>{
 const actor=createDefaultCharacter(),before=structuredClone(actor),root=buildCharacter(actor),rig=characterRigFor(root)
 assert(rig);assert.equal(rig.skeleton.bones.length,18);assert.deepEqual(actor,before)
 let portrait=0,fingers=0;root.traverse(p=>{if(p.isMesh){assert(p.geometry.getAttribute('position').array.every(Number.isFinite));if(p.geometry.name==='anatomical-sculpted-head'){portrait++;assert.equal(p.userData.region,'head')}if(p.geometry.name==='anatomical-limb'&&p.userData.region.endsWith('Hand'))fingers++}})
 assert.equal(portrait,1);assert(fingers>=16,'SDF smoothing retains independently modelled fingers')
 rig.sample(1,'idle');const box=new T.Box3().setFromObject(root);assert(Number.isFinite(box.min.y)&&box.getSize(new T.Vector3()).y>1)
 const head=rig.meshes.find(m=>m.geometry.name==='anatomical-sculpted-head'),center=new T.Box3().setFromObject(head).getCenter(new T.Vector3())
 const ray=new T.Raycaster(center.clone().add(new T.Vector3(0,0,1)),new T.Vector3(0,0,-1));assert(ray.intersectObject(head).some(h=>h.object.userData.region==='head'))
 disposeObject(root);assert.equal(characterRigFor(root),undefined)
})

test('Анатомия: отсутствующая кисть не восстанавливается визуально; нечеловеческие формы сохраняются',()=>{
 const actor=createDefaultCharacter();actor.body.parts.leftHand.present=false
 const root=buildCharacter(actor);root.traverse(p=>{if(p.isMesh)assert.notEqual(p.userData.region,'leftHand')});disposeObject(root)
 for(const form of ['quadruped','avian']){
  const draft=createDefaultCharacter();draft.body.anatomy.form=form;const before=structuredClone(draft),model=buildCharacter(draft)
  assert.equal(characterRigFor(model),undefined,'Nonhumanoid anatomy is not forced onto a human skeleton');assert.deepEqual(draft,before)
  const bounds=new T.Box3().setFromObject(model);assert(bounds.min.toArray().every(Number.isFinite)&&bounds.max.toArray().every(Number.isFinite));disposeObject(model)
 }
})
