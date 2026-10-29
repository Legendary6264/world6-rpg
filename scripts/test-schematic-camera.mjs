import test from 'node:test'
import assert from 'node:assert/strict'
import {constrainSchematic,fitSchematic,wholeSchematic,zoomSchematic} from '../src/schematicCamera.ts'
import {createRequire} from 'node:module'
const {load}=createRequire(import.meta.url)('./generate-tabletop-thumbnails.cjs'),{schematicRegionTargets}=load('sceneEditorPicking')

test('Schematic camera retains the cursor anchor, uniform scale and finite bounds at both zoom limits',()=>{
 for(const frame of [{width:30,height:20},{width:40,height:13}]){
  const home=wholeSchematic(frame),anchor={x:frame.width*.4,y:frame.height*.6},closer=zoomSchematic(home,frame,.8,anchor)
  assert(Math.abs(closer.x+closer.width*.4-anchor.x)<1e-9);assert(Math.abs(closer.y+closer.height*.6-anchor.y)<1e-9)
  let view=home;for(let i=0;i<100;i++)view=zoomSchematic(view,frame,.5,anchor);assert(Math.abs(view.width-frame.width/12)<1e-9);assert(Math.abs(view.height/view.width-frame.height/frame.width)<1e-9)
  for(let i=0;i<100;i++)view=zoomSchematic(view,frame,2,anchor);assert.equal(view.width,frame.width*2);assert(Object.values(view).every(Number.isFinite))
  const bounded=constrainSchematic({...home,x:1e6,y:-1e6,width:frame.width*.5},frame);assert(bounded.x<frame.width&&bounded.y> -frame.height)
  const bounds={minX:2,minY:3,maxX:frame.width-2,maxY:frame.height-3},fit=fitSchematic(bounds,frame);assert(fit.x<=bounds.minX&&fit.y<=bounds.minY&&fit.x+fit.width>=bounds.maxX&&fit.y+fit.height>=bounds.maxY)
 }
})
test('Schematic side marquee uses rendered vertical centres and does not mutate the scene',()=>{
 const scene={id:'side',width:30,depth:20,maxZ:12,minZ:-2,view:'side',objects:[{id:'low',kind:'crate',x:5,y:17,z:1,height:2},{id:'high',kind:'crate',x:5,y:1,z:7,height:2}],tokens:[{actorId:'air',x:7,y:1,z:7}]},before=JSON.stringify(scene)
 assert.deepEqual(schematicRegionTargets(scene,{x:4,y:3},{x:8,y:5},{filter:'props'}),[{kind:'object',id:'high'}])
 assert.deepEqual(schematicRegionTargets(scene,{x:4,y:3},{x:8,y:5},{filter:'tokens'}),[{kind:'token',id:'air'}]);assert.equal(JSON.stringify(scene),before)
})
