import test from 'node:test'
import assert from 'node:assert/strict'
import {createTabletopObject} from '../src/tabletopCatalog.ts'
import {resolveAssetPlacement,resolveObjectPlacement,canPlaceOnSurface,flatPlacementSurface,surfacePlacementObject,placementSurfaceFootprint} from '../src/sceneEditorPlacement.ts'
import {surfaceContents,surfaceContentsSelection} from '../src/sceneEditorContents.ts'

const frame={width:16,depth:16,groundZ:0,maxZ:12},point={x:5,y:5,z:0}
const table=createTabletopObject('table','table',point),candle=(surfaces,at=point,options={})=>resolveAssetPlacement(frame,surfaces,'candle','new-candle',at,0,{surfaceSnap:true,...options})
test('Поверхности: целый предмет опирается на стол, выбор земли и отключение магнита сохраняются',()=>{
 const before=structuredClone(table),placed=candle([table])
 assert.equal(placed.object.z,.98);assert.equal(placed.surfaceId,table.id);assert.deepEqual(table,before)
 assert.equal(candle([table],point,{surfaceSnap:false}).object.z,0)
 assert.equal(candle([table],point,{surfaceId:null}).object.z,0)
 assert.equal(candle([table],{x:5.8,y:5,z:0}).object.z,0,'The whole candle footprint must fit, not only its centre')
 assert.throws(()=>candle([],{...point},{surfaceId:table.id}),/поверхность/,'A stale surface cannot silently become ground')
})
test('Поверхности: поворот, круглые столы и сетка учитываются до проверки опоры',()=>{
 const bench={...createTabletopObject('bench','bench',point),width:1.7}
 assert.equal(resolveObjectPlacement(frame,[table],bench,point,{surfaceSnap:true}).object.z,.98)
 assert.equal(resolveAssetPlacement(frame,[table],'bench','wide-bench',point,0,{surfaceSnap:true}).object.z,0,'A full-width bench overhangs the beveled table top')
 assert.equal(resolveAssetPlacement(frame,[table],'bench','bench',point,90,{surfaceSnap:true}).object.z,0)
 const round=createTabletopObject('round-table','round',point)
 assert(canPlaceOnSurface({x:5,y:5,width:.42,depth:.42},round))
 assert(!canPlaceOnSurface({x:5.5,y:5,width:.42,depth:.42},round))
 assert.equal(candle([round],{x:5.5,y:5,z:0}).object.z,0)
 const snapped=candle([table],{x:5.18,y:5.18,z:0},{snapStep:.5})
 assert.equal(snapped.object.x,5);assert.equal(snapped.object.y,5);assert.equal(snapped.object.z,.98)
})
test('Поверхности: верхняя плоскость, открытый сундук, наклоны, высота сцены и подвесные модели',()=>{
 const higher={...table,id:'higher',z:1},open={...createTabletopObject('chest','chest',point),open:true}
 assert.equal(candle([table,higher]).object.z,1.98)
 assert.equal(candle([table,higher],point,{surfaceId:table.id}).object.z,.98)
 assert(!flatPlacementSurface(open));assert(!flatPlacementSurface(createTabletopObject('stairs','stairs',point)))
 assert(!flatPlacementSurface(createTabletopObject('bed','bed',point)),'The headboard height is not a flat mattress surface')
 assert(!flatPlacementSurface(createTabletopObject('chest','closed-chest',point)),'Chest height includes the opening arc above its curved lid')
 assert(!flatPlacementSurface({...table,asset:'roof-tile'}))
 assert.equal(candle([open]).object.z,0)
 assert.throws(()=>resolveAssetPlacement({...frame,maxZ:1.3},[table],'candle','tall',point,0,{surfaceSnap:true}),/высоте|поверхностью/)
 assert.equal(resolveAssetPlacement(frame,[table],'chandelier','hanging',point,0,{surfaceSnap:true}).object.z,1.8)
 assert.throws(()=>resolveAssetPlacement({...frame,width:1},[],'table','wide',point,0),/границы/)
 const edge=candle([],{x:16,y:16,z:0},{snapStep:1});assert.equal(edge.object.x,15.79);assert.equal(edge.object.y,15.79)
})
test('Перенос существующего предмета: реальные размеры, состояние, снятие с опоры и самопривязка',()=>{
 const source={...createTabletopObject('chest','custom',{x:2,y:2,z:0},90),name:'Мой сундук',width:.6,depth:.4,height:.3,artwork:'custom',open:true,locked:true,active:false}
 const before=structuredClone(source),placed=resolveObjectPlacement(frame,[table,source],source,point,{surfaceSnap:true})
 assert.equal(placed.object.z,.98);assert.equal(placed.object.width,.6);assert.equal(placed.object.depth,.4);assert.equal(placed.object.facing,90)
 for(const key of ['id','name','height','artwork','open','locked','active'])assert.equal(placed.object[key],source[key])
 const lifted={...source,z:.98},ground=resolveObjectPlacement(frame,[table],lifted,{x:12,y:12,z:0},{surfaceSnap:true})
 assert.equal(ground.object.z,0);assert.equal(ground.surfaceId,null)
 assert.equal(resolveObjectPlacement(frame,[],lifted,point).object.z,.98,'A disabled magnet retains the existing elevation')
 const support={...source,open:false,canSupport:true}
 assert.equal(resolveObjectPlacement(frame,[support],support,source,{surfaceSnap:true}).object.z,0,'An object cannot sit on itself')
 assert.equal(resolveObjectPlacement(frame,[table],{...source,width:2},point,{surfaceSnap:true}).surfaceId,null,'Use edited footprint rather than catalog defaults')
 assert.throws(()=>resolveObjectPlacement(frame,[],source,point,{surfaceSnap:true,surfaceId:'gone'}),/поверхность/)
 assert.throws(()=>resolveObjectPlacement({...frame,maxZ:1.1},[table],source,point,{surfaceSnap:true}),/недостаточно/)
 assert(surfacePlacementObject({...source,asset:undefined}));assert(!surfacePlacementObject({...source,asset:'torch'}))
 assert.deepEqual(source,before)
})
test('Опора мебели: контур находится внутри обода и суженной крышки, учитывает поворот и размеры',()=>{
 for(const asset of ['round-table','stool','barrel'])for(const facing of [0,90,180,270]){
  const surface=createTabletopObject(asset,asset,point,facing);surface.width*=1.4;surface.depth*=.8
  const top=placementSurfaceFootprint(surface),at={x:surface.x+surface.width*.48-.05,y:surface.y,width:.1,depth:.1}
  assert.equal(top.shape,'ellipse');assert(top.width<surface.width&&top.depth<surface.depth)
  assert(!canPlaceOnSurface(at,surface),'Collision radius is not the support radius: '+asset)
  assert(canPlaceOnSurface({...at,x:surface.x},surface))
  assert.equal(resolveObjectPlacement(frame,[surface],{...createTabletopObject('mug','cup',point),...at,height:.18},at,{surfaceSnap:true}).surfaceId,null)
 }
})
test('Содержимое опоры: рекурсивное выделение реальных предметов и героев без соседей, пола или ложных опор',()=>{
 const support=createTabletopObject('table','table',point),box={...createTabletopObject('bar','box',{...point,z:support.height}),width:.5,depth:.4,height:.3},mug=createTabletopObject('mug','mug',{...point,z:support.height+.3})
 const peer=createTabletopObject('chair','peer',{...point,x:point.x+1.3}),floating=createTabletopObject('mug','floating',{...point,z:support.height+.1}),overhang=createTabletopObject('mug','edge',{...point,x:point.x+.87,z:support.height}),floor=createTabletopObject('floor-wood','floor',point)
 const scene={objects:[support,box,mug,peer,floating,overhang,floor],tokens:[{actorId:'hero',support:{kind:'object',objectId:box.id}}]}
 const before=structuredClone(scene),root={kind:'object',id:support.id}
 const items=surfaceContents(scene,[root]);assert.deepEqual(new Set(items.map(s=>s.kind+':'+s.id)),new Set(['object:table','object:box','object:mug','token:hero']))
 assert.equal(items.length,4);assert.deepEqual(scene,before)
 assert.equal(surfaceContents(scene,[{kind:'object',id:floor.id}]).length,1,'Selecting a floor must not select the entire room')
 assert.equal(surfaceContents({...scene,objects:[{...support,open:true,asset:'chest'},mug]},[root]).length,1)
})


test('Композиция: вложенные предметы выделяются без неявного героя, исходник сохраняется',()=>{
 const support=createTabletopObject('table','root',point),tray={...createTabletopObject('bar','tray',{...point,z:support.height}),width:.5,depth:.4,height:.3},mug=createTabletopObject('mug','mug',{...point,z:support.height+.3})
 const peer=createTabletopObject('chair','peer',{...point,x:point.x+1.3}),floating={...mug,id:'floating',z:mug.z+.1},overhang={...mug,id:'overhang',x:point.x+.87,z:support.height}
 const actor={kind:'token',id:'rider'},root={kind:'object',id:support.id},scene={objects:[support,tray,mug,peer,floating,overhang],tokens:[{actorId:actor.id,support:{kind:'object',objectId:tray.id}}]},before=structuredClone(scene)
 const result=surfaceContentsSelection(scene,[root])
 assert.deepEqual(result.items,[root,{kind:'object',id:'tray'},{kind:'object',id:'mug'}]);assert.equal(result.objectCount,3);assert.equal(result.actorCount,1)
 assert(result.all.some(i=>i.kind==='token'&&i.id===actor.id));assert.deepEqual(scene,before)
 assert.deepEqual(surfaceContentsSelection(scene,[root,actor]).items,[root,actor,{kind:'object',id:'tray'},{kind:'object',id:'mug'}],'An explicitly selected actor remains explicit')
})
test('Композиция: скрытый вложенный предмет блокирует всю операцию, чужая защита не мешает',()=>{
 const support=createTabletopObject('table','root',point),mug=createTabletopObject('mug','mug',{...point,z:support.height}),scene={objects:[support,mug],tokens:[]},root={kind:'object',id:support.id}
 assert.throws(()=>surfaceContentsSelection(scene,[root],['mug']),/скрытые или защищённые/)
 assert.throws(()=>surfaceContentsSelection(scene,[root],['root']),/скрытые или защищённые/)
 assert.equal(surfaceContentsSelection(scene,[root],['elsewhere']).objectCount,2)
})
test('Композиция: исчезнувшая опора или часть группы отклоняются целиком',()=>{
 const support=createTabletopObject('table','root',point),scene={objects:[support],tokens:[]},root={kind:'object',id:support.id}
 for(const items of [[],[{kind:'token',id:'lost'}],[{kind:'object',id:'lost'}],[root,{kind:'object',id:'lost'}]])assert.throws(()=>surfaceContentsSelection(scene,items),/существующую опору/)
})
