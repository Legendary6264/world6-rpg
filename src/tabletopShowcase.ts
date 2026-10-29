import type {Scene,SceneObject} from './sceneTypes'
import {createTabletopObject} from './tabletopCatalog'
import {sceneObject} from './scenes'

export const tavernSceneId='browser-preview:modular-tavern'
export function createTavernScene(actorIds:string[]=[]):Scene{
 const objects:SceneObject[]=[]
 const add=(asset:string,x:number,y:number,facing=0,extra:Partial<SceneObject>={})=>{
  const value={...createTabletopObject(asset,`tavern:object-${objects.length}`,{x,y,z:0},facing),...extra};objects.push(value);return value
 }
 // Every board, wall and furnishing is an editable catalog object, rather than
 // a monolithic demonstration mesh. Floor cells use the same grid as the brush.
 for(let x=3;x<16;x+=2)for(let y=7;y<18;y+=2)add('floor-wood',x,y)
 for(let x=7;x<=11;x+=2)for(let y=19;y<=23;y+=2)add('floor-stone',x,y)
 for(let x=13;x<=23;x+=2)add('floor-stone',x,21)
 for(let y=13;y<=19;y+=2)add('floor-stone',23,y)
 for(let x=21;x<=25;x+=2)for(let y=3;y<=9;y+=2)add('floor-stone',x,y)
 for(let x=3;x<16;x+=2){
  add([5,9,15].includes(x)?'timber-window':'timber-wall',x,6)
  add(x===9?'timber-door':[5,13].includes(x)?'timber-window':'timber-wall',x,18)
 }
 for(let y=7;y<18;y+=2){add(y===11?'timber-window':'timber-wall',2,y,90);add([9,15].includes(y)?'timber-window':'timber-wall',16,y,90)}
 for(let y=7;y<=11;y+=2)add('timber-wall',12,y,90)
 add('timber-door',13,12);add('timber-wall',15,12)
 add('bed',13.15,8.1);add('bed',14.9,8.1)
 add('chest',14.9,10.9);add('rug',14,10)
 // Dining room: broad circulation from the front door to the bar and room.
 add('shelf',5.1,6.4);add('shelf',8.6,6.4)
 add('barrel',3,7.7);add('barrel',4,7.7)
 for(const x of [5,7,9])add('bar',x,9)
 add('chair',8.2,7.5,180)
 for(const [x,y] of [[5,12.7],[9.5,14.5],[5,16]]){
  add('table',x,y)
  add('chair',x-.4,y-.95)
  add('chair',x+.4,y+.95,180)
 }
 add('bench',2.6,15.2,90)
 add('fireplace',15.5,14.7,90)
 add('rug',13.8,15.3,90)
 add('candle',11.5,17.2);add('candle',11.3,7.1);add('candle',15.4,11.2)
 add('barrel',16.8,19.1);add('barrel',17.6,19.1)
 add('brazier',20,19);add('bench',21.6,18.8,90)
 // A small explorable ruin beyond the yard, connected by the stone path.
 for(const x of [21,23,25])add('stone-wall',x,2)
 for(const y of [3,5,7,9]){add('stone-wall',20,y,90);add('stone-wall',26,y,90)}
 add('stone-wall',21,10);add('dungeon-arch',23,10,0,{width:2,open:true});add('stone-wall',25,10)
 add('stairs',23,11.2,0)
 add('chest',21.3,4);add('trap-pit',23,5);add('trap-spikes',25,7,0,{active:false})
 add('brazier',25.2,3.5)
 const natural=(kind:'tree'|'rock',x:number,y:number,height:number,width:number)=>{
  objects.push({...sceneObject(kind,`tavern:object-${objects.length}`,{x,y,z:0}),width,depth:width,height,name:kind==='tree'?'Лесная сосна':'Замшелый валун'})
 }
 for(const [x,y,h] of [[2,2,4.5],[6,2.5,4.8],[10.5,2,5],[15,2.7,4.6],[18,3,5],[18.2,7.4,4.5],[18.9,12.9,4.8],[26.5,13,5],[26.3,17.2,4.6],[26,21.5,5.2],[19,23,4.8],[2.2,21.4,4.3]])natural('tree',x,y,h,2.4)
 for(const [x,y,w,h] of [[18.5,10.6,1.5,.7],[26.5,10,1.5,1.1],[25.7,22.8,1.2,.6],[17,4.8,1.2,.8]])natural('rock',x,y,h,w)
 const positions=[[7.4,15.9],[9,17],[11,13.4],[4,10.4]]
 return {id:tavernSceneId,name:'Таверна «Тихая сосна»',description:'Общий зал, бар, спальня и двор. Каменная дорожка ведёт через рощу к входу в подземелье. Все модули доступны в библиотеке редактора.',view:'top',width:28,depth:24,groundZ:0,minZ:-4,maxZ:12,palette:'forest',objects,
  tokens:actorIds.slice(0,4).map((actorId,i)=>({actorId,x:positions[i][0],y:positions[i][1],z:0,diameter:.8,support:{kind:'ground'}}))}
}

export const referenceSceneId='browser-preview:reference-tavern'
export function createReferenceTavernScene(actorIds:string[]=[]):Scene{
 const scene=createTavernScene(actorIds)
 scene.id=referenceSceneId;scene.name='Таверна «Тихая сосна» · игровой стол'
 scene.description='Зал с резной мебелью, спальня, терраса и руины в сосновой роще. Модули, светильники и ловушки можно менять по отдельности.'
 scene.objects=scene.objects.map(o=>({...o,id:o.id.replace('tavern:','reference:')}))
 const add=(asset:string,x:number,y:number,facing=0,extra:Partial<SceneObject>={})=>{
  const o={...createTabletopObject(asset,`reference:detail-${scene.objects.length}`,{x,y,z:0},facing),...extra};scene.objects.push(o);return o
 }
 // The central arrangement gives the room a distinct silhouette at table scale.
 const central=scene.objects.find(o=>o.asset==='table'&&o.x===9.5)
 if(central)Object.assign(central,createTabletopObject('round-table',central.id,{x:central.x,y:central.y,z:central.z}))
 add('stool',10.7,14.5);add('stool',8.3,14.5)
 for(const [x,y] of [[2,6],[10,6],[16,6],[2,18],[10,18],[16,18]])add('timber-pillar',x,y)
 for(const x of [3,5,7,9,11,13,15])add('timber-beam',x,6,0,{z:2.46})
 for(const [x,y] of [[3,19],[5,19],[3,21],[5,21]])add('floor-wood',x,y)
 for(const [x,y,r] of [[2,19,90],[2,21,90],[3,22,0],[5,22,0]])add('timber-railing',x,y,r)
 // A partial roof reads as an architectural section; interior view hides it.
 for(const x of [13,15])for(const y of [7,9,11])add('roof-tile',x,y,0,{z:2.7})
 add('chandelier',7.4,12.3,0,{z:1.8})
 add('torch',20.3,5,90,{z:1.25});add('torch',25.7,8,270,{z:1.25})
 add('trap-fire',23,7,0,{active:false})
 return scene
}
