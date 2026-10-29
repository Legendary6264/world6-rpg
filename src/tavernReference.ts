import type {Scene,SceneObject} from './sceneTypes'
import {createTabletopObject} from './tabletopCatalog.ts'

// A separate example, so opening a new release cannot replace an edited hall.
export const legacyVideoTavernSceneId='browser-preview:video-tavern-v1'
export const videoTavernSceneId='browser-preview:video-tavern-v2'
export const isVideoTavern=(id:string)=>id===videoTavernSceneId||id===legacyVideoTavernSceneId
export const tavernReferenceShot={
 target:[6.5, .15, 12] as const,
 offset:[10.5,31,31] as const,
 zoom:1.75,
 timestampSeconds:2,
}

export function createVideoTavernScene(actorIds:string[]=[]):Scene{
 const objects:SceneObject[]=[]
 const add=(asset:string,x:number,y:number,facing=0,extra:Partial<SceneObject>={})=>{
  const object={...createTabletopObject(asset,`video-tavern:${objects.length}`,{x,y,z:0},facing),...extra}
  objects.push(object);return object
 }
 // The opening shot is a long dining hall. The forest and dungeon belong to
 // other shots; keeping them out of this scene makes its scale readable.
 for(let y=3;y<=23;y+=2)for(let x=3;x<=15;x+=2)add('floor-wood',x,y)
 for(let y=25;y<=27;y+=2)for(let x=7;x<=11;x+=2)add('floor-stone',x,y)
 for(let x=3;x<=15;x+=2){
  add([5,11].includes(x)?'timber-window':'timber-wall',x,2)
  add(x===9?'timber-door':[3,15].includes(x)?'timber-window':'timber-wall',x,24)
 }
 for(let y=3;y<=23;y+=2){
  add([7,15,21].includes(y)?'timber-window':'timber-wall',2,y,90)
  add([5,13,21].includes(y)?'timber-window':'timber-wall',16,y,90)
 }
 // Small private rooms at the back have their own openable doors. Their walls
 // are ordinary modules and participate in the same interior cutaway.
 for(let y=3;y<=7;y+=2)add('timber-wall',12,y,90)
 add('timber-door',13,8);add('timber-wall',15,8)
 add('bed',13.3,4.5);add('chest',14.9,6.8)
 // A pair of joined rectangular tables, then mixed round/rectangular tables,
 // follows the rhythm and clear circulation visible in the source clip.
 add('table',6.7,5.2);add('chair',6.1,4.15);add('chair',7.3,6.25,180)
 add('table',8.6,10.4);add('table',10.4,10.4)
 add('bench',9.5,9.35,0,{width:3.4});add('bench',9.5,11.45,0,{width:3.4})
 const round=(x:number,y:number,s=1)=>{
  add('round-table',x,y,0,{width:1.4*s,depth:1.4*s})
  add('chair',x-.2,y-1.06);add('chair',x+.25,y+1.06,180)
 }
 round(4.4,9.3);round(6.1,12.3);round(4.6,15.8);round(9.9,17.1);round(5.4,20.3)
 for(const [x,y] of [[11.8,13.3],[8.2,14.2],[13.5,17.6]]){
  add('table',x,y);add('chair',x-.55,y-.99);add('chair',x+.55,y+.99,180)
 }
 round(9.1,21.3)
 add('stool',3.35,12.1);add('stool',7.4,17.4)
 add('shelf',4.5,2.45);add('shelf',7.8,2.45)
 add('bar',14.8,10.6,90);add('barrel',14.8,9.2)
 add('barrel',3,3.1);add('barrel',3.8,3.1)
 add('fireplace',15.45,14.9,90)
 // Wall lights cast local pools; the broad key light carries the whole room.
 add('torch',2.2,11,90,{z:1.05});add('torch',15.8,19,270,{z:1.05})
 add('candle',12.8,21.1);add('candle',10.9,3.3)
 // Crockery is a set of ordinary editable objects on the actual flat tops.
 // It is deliberately separate from furniture meshes and has no implicit
 // attachment: moving a table does not secretly move unrelated scene objects.
 const dining=objects.filter(o=>['table','round-table'].includes(o.asset??''))
 for(const table of dining){
  const angle=(table.facing??0)*Math.PI/180,odd=(table.facing??0)%180!==0
  const width=odd?table.depth:table.width,depth=odd?table.width:table.depth
  const place=(asset:string,x:number,y:number,z=0)=>add(asset,table.x+x*Math.cos(angle)-y*Math.sin(angle),table.y+x*Math.sin(angle)+y*Math.cos(angle),table.facing??0,{z:table.z+table.height+z})
  place('mug',-width*.25,-depth*.17);place('mug',width*.25,depth*.17)
  place('plate',0,0)
  if(table.asset==='table')place('bread',width*.12,depth*.28)
 }
 const positions=[[8.3,18.6],[10.1,19.2],[7.6,20.7],[11.5,20.8]]
 return {id:videoTavernSceneId,name:'Таверна · по видеореференсу · отдельная посуда',
  description:'Светлый дощатый зал, фахверковые стены, круглые и прямоугольные столы. Каждый предмет редактируется отдельно. Камера → «Ракурс из ролика» возвращает исходную композицию.',
  view:'top',width:20,depth:28,groundZ:0,minZ:-3,maxZ:10,palette:'stone',objects,
  tokens:actorIds.slice(0,4).map((actorId,i)=>({actorId,x:positions[i][0],y:positions[i][1],z:0,diameter:.8,support:{kind:'ground'}}))}
}
