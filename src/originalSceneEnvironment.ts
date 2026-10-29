import type {Scene,SceneObject,SceneState} from './sceneTypes'
import {legacyAssets,legacyPlacementDefaults} from './legacyAssets'

// Dressing the three original locations, with their original scene, object,
// character and support identities. This is example scenery, not new canon.
export function detailOriginalScenes(scenes:Scene[],namespace:string){
 const [settlement,forest,underground]=scenes
 const look=(scene:Scene,slug:string,art:string,dimensions?:Partial<SceneObject>)=>{
  const o=scene.objects.find(o=>o.id===namespace+':'+slug)
  if(o)Object.assign(o,{artwork:'expanded-object-'+art},dimensions)
 }
 const add=(scene:Scene,slug:string,art:string,x:number,y:number,dimensions:Partial<SceneObject>={})=>{
  const profile=legacyAssets.find(a=>a.slug===art)!
  const object:SceneObject={id:namespace+':environment-v021-'+slug,name:profile.label,kind:profile.kind,x,y,z:0,width:1,depth:1,height:1,open:false,blocksMovement:false,blocksSight:false,canSupport:false,...legacyPlacementDefaults(profile.id),artwork:profile.id,...dimensions}
  // Dressing has no new movement or disclosure barriers. Original test
  // obstacles remain the explicit objects from the sandbox campaign.
  object.blocksMovement=false;object.blocksSight=false;object.canSupport=false
  scene.objects.push(object)
 }
 const path=(scene:Scene,slug:string,x:number,y:number,width:number,depth:number)=>{
  scene.objects.push({id:namespace+':environment-v021-'+slug,name:'Каменная дорожка',kind:'platform',asset:'floor-stone',x,y,z:0,width,depth,height:0,blocksMovement:false,blocksSight:false,canSupport:false,open:false})
 }
 look(settlement,'gate-wall-left','stone-wall');look(settlement,'gate-wall-right','brick-wall')
 look(settlement,'gate-door','wood-door',{depth:.42})
 look(settlement,'gate-tree','oak',{height:4.7,width:3.6,depth:3.6})
 look(settlement,'gate-rock','boulder');look(settlement,'gate-light','street-lamp',{width:.8,depth:.8,height:3.6})
 look(settlement,'practice-crate','crate');look(settlement,'settlement-support','platform')
 path(settlement,'village-road',13,6,2.2,7.4)
 path(settlement,'village-square',7,4,7,3)
 add(settlement,'well','well',6,5,{width:2.1,depth:1.8,height:2.8})
 add(settlement,'village-bench','bench',8.5,3,{width:2.3,depth:.6,height:.65})
 add(settlement,'village-planter','flower-planter',3,8,{width:1.4,depth:.8,height:.8})
 add(settlement,'village-sign','signpost',16,4,{width:1.2,depth:.5,height:2.5})
 add(settlement,'village-cart','cart',4,11,{width:2.8,depth:1.7,height:1.8})
 add(settlement,'village-barrel','barrel',5.8,12,{width:.8,depth:.8,height:1.1})
 add(settlement,'village-crates','crate',3.1,13,{width:1.2,depth:1.1,height:.85})
 add(settlement,'village-logs','woodpile',22,3,{width:2.7,depth:1.5,height:1})
 add(settlement,'village-shrub','berry-bush',26,7,{width:1.5,depth:1.4,height:1.1})
 add(settlement,'village-grass','grass-tuft',22,7,{width:.9,depth:.7,height:.45})
 add(settlement,'village-marker','mile-marker',18,7,{width:.6,depth:.5,height:1.2})

 const species=['oak','birch','pine','willow','maple','dead','cedar','acacia']
 species.forEach((art,i)=>look(forest,'forest-tree-'+i,art))
 look(forest,'forest-rock','rock-pile');look(forest,'forest-beacon','signal-lantern',{width:.7,depth:.7})
 // The clear route through the middle remains available for movement tests.
 for(const [i,x,y] of [[0,4.5,5],[1,6.2,13.8],[2,10,16],[3,25,7.4],[4,27,13.1]]){
  add(forest,'fern-'+i,'fern',x,y,{width:1.3,depth:1.2,height:.8})
  add(forest,'grass-'+i,'grass-tuft',x+.8,y+.6,{width:.9,depth:.8,height:.45})
 }
 add(forest,'fallen-log','log',5,17.8,{width:3.4,depth:1.1,height:.95})
 add(forest,'stump','stump',10,13.8,{width:1.1,depth:1,height:.8})
 add(forest,'red-mushrooms','mushroom-cluster',7,6.3,{width:.8,depth:.7,height:.55})
 add(forest,'pond-reeds','reeds',23,8.6,{width:1.4,depth:.8,height:1.7})
 add(forest,'pond-cattails','cattails',27.2,10.5,{width:.9,depth:.8,height:1.6})
 add(forest,'pond-lily','lily-pad',24.5,10,{width:.9,depth:.9,height:.12,z:.03})
 add(forest,'pond-lotus','lotus',26,10.4,{width:.8,depth:.8,height:.35,z:.03})
 add(forest,'forest-sign','signpost',19,15,{width:1.1,depth:.4,height:2.2})
 add(forest,'forest-pebbles','flat-rock',21.8,11.5,{width:1.1,depth:.8,height:.25})

 look(underground,'underground-wall','stone-wall')
 look(underground,'gallery-door','iron-door',{depth:.55})
 look(underground,'gallery-light','brazier',{width:.8,depth:.8,height:1.4})
 look(underground,'underground-crate','locked-chest')
 path(underground,'dungeon-floor',17,11,23,15)
 add(underground,'dungeon-column-left','broken-column',6,7,{width:1.2,depth:1.2,height:3.5})
 add(underground,'dungeon-column-right','column',25,7,{width:1.1,depth:1.1,height:4.3})
 add(underground,'dungeon-stalagmites','stalagmites',3.5,15,{width:3,depth:2,height:3})
 add(underground,'dungeon-crystals','crystal-cluster',9,16,{width:2,depth:1.5,height:2})
 add(underground,'dungeon-rune','rune-stone',5,10,{width:1.1,depth:.8,height:2.2})
 add(underground,'dungeon-bones','bones',22,16,{width:1.7,depth:.9,height:.3})
 add(underground,'dungeon-sconce','torch',10,10.7,{z:1.8,width:.45,depth:.4,height:1.1})
 add(underground,'dungeon-grate','trap-grate',17,15,{width:2.5,depth:2,height:.2})
 add(underground,'dungeon-rubble','rock-pile',26,17,{width:2.1,depth:1.5,height:1})
 add(underground,'dungeon-fungus','glow-mushroom',3,12,{width:.8,depth:.8,height:.8})
}

const sameObject=(a:SceneObject,b:SceneObject)=>JSON.stringify(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)))===JSON.stringify(Object.entries(b).sort(([a],[b])=>a.localeCompare(b)))
// Upgrade only stock example data. A modified scene gets only artwork on
// exactly unchanged stock objects; its composition, dimensions and deleted
// objects stay intact. No version flag or schema change is needed.
export function upgradeOriginalScenes(state:SceneState,previous:SceneState,current:SceneState):SceneState{
 let changed=false
 const scenes=state.scenes.map(scene=>{
  const old=previous.scenes.find(s=>s.id===scene.id),next=current.scenes.find(s=>s.id===scene.id)
  if(!old||!next)return scene
  const originalFrame=['width','depth','groundZ','minZ','maxZ'].every(key=>scene[key as keyof Scene]===old[key as keyof Scene])
  const unchanged=originalFrame&&scene.objects.length===old.objects.length&&scene.objects.every(o=>{const baseline=old.objects.find(b=>b.id===o.id);return !!baseline&&sameObject(o,baseline)})
  if(unchanged){changed=true;return {...scene,objects:structuredClone(next.objects)}}
  const objects=scene.objects.map(o=>{
   const baseline=old.objects.find(b=>b.id===o.id),replacement=next.objects.find(b=>b.id===o.id)
   if(baseline&&replacement?.artwork&&sameObject(o,baseline)){changed=true;return {...o,artwork:replacement.artwork}}
   return o
  })
  return objects.some((o,i)=>o!==scene.objects[i])?{...scene,objects}:scene
 })
 return changed?{...state,scenes}:state
}
