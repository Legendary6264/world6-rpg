import {expandedAssets} from './expandedArtwork.ts'
import {tabletopAsset} from './tabletopCatalog.ts'
import type {SceneObject,SceneObjectKind} from './sceneTypes'

export type LegacyAssetGroup='flora'|'mineral'|'furniture'|'structure'
const flora=new Set('fern reeds cattails grass-tuft lupine sunflower thistle thorn-bush berry-bush vine hanging-vine red-mushroom glow-mushroom giant-mushroom mushroom-cluster stump log woodpile lily-pad lotus cactus bamboo agave aloe pumpkin-patch cabbages amber-root driftwood frozen-root nest'.split(' '))
const outdoor=new Set('stairs ladder bridge rope-bridge platform tent awning boat rail-switch drawbridge-machine trap-grate rotating-platform'.split(' '))
const native:Record<string,string>={table:'table','round-table':'round-table',chair:'chair',bench:'bench',stool:'stool',bed:'bed',shelf:'shelf',chest:'chest','locked-chest':'chest',barrel:'barrel',rug:'rug',stairs:'stairs','stone-wall':'stone-wall',window:'timber-window','wood-door':'timber-door',brazier:'brazier','candle-stand':'candle'}
const wallLike=new Set('brick-wall stone-wall palisade iron-fence broken-wall window shutters sandbags'.split(' '))
const sizes:Record<string,[number,number,number]>={
 oak:[4,3.8,6],pine:[3,2.8,6],birch:[2.4,2.1,5],willow:[4,3.6,5],dead:[2.3,1.9,4.5],baobab:[4,3.5,5],cherry:[3.6,3.2,4.2],'root-tree':[4,3.5,5],apple:[3,2.8,3.8],cedar:[3.4,3.1,5.5],cypress:[1.4,1.3,5.2],palm:[3,2.7,5.6],acacia:[4.3,3,4.7],maple:[3.4,3.2,4.9],hazel:[2.3,2,2.5],juniper:[1.8,1.6,2.5],elder:[2.4,2.2,2.7],'rose-bush':[1.4,1.3,1.4],banana:[3,2.6,4],coffee:[1.5,1.4,1.8],cotton:[1.2,1.1,1.2],hops:[1.5,.7,2.5],
 fern:[1.2,1.1,.8],vine:[.8,.5,2.1],'hanging-vine':[1.4,.7,2.2],'berry-bush':[1.3,1.2,1.1],'thorn-bush':[1.3,1.2,1],bamboo:[1.7,1.4,4],cactus:[1.4,1,2.5],agave:[1.2,1.1,.85],aloe:[.8,.75,.6],nest:[.65,.6,.3],'grass-tuft':[.8,.7,.45],
 boulder:[1.8,1.5,1.5],'rock-pile':[2,1.5,1.2],meteorite:[1.6,1.4,1.4],'ice-spire':[1.1,1,3.2],stalagmites:[1.8,1.5,2.5],stalactites:[1.8,1.5,2.5],'broken-column':[1.1,1.1,2.1],obelisk:[1,1,3.4],statue:[1.3,1.1,3.2],gravestone:[.9,.45,1.4],'cross-marker':[.8,.4,1.7],'coral-fan':[1.7,.65,1.5],'basalt-column':[1.5,1.2,2.8],'sandstone-stack':[1.6,1.3,2.3],'balancing-rock':[1.6,1.2,2.4],'stone-arch-natural':[3,1.5,2.7],'sand-burrow':[1.5,1.2,.8],'termite-mound':[1.5,1.2,2.1],'mile-marker':[.6,.5,1.3],bollard:[.5,.5,.9],anchor:[1.2,.4,1.7],sundial:[1,1,1.1],
 throne:[1,1,1.7],desk:[1.6,.85,.95],workbench:[2,1,1.05],altar:[1.8,1.3,1.2],cot:[.8,1.9,.6],bedroll:[.8,1.8,.3],hammock:[3,1.2,1.3],bookcase:[.95,.45,1.8],cabinet:[1,.6,1.4],wardrobe:[.95,.6,1.9],'weapon-rack':[1.5,.65,2],crate:[1,1.03,1.7],sack:[.7,.65,.9],basket:[.65,.6,.9],jar:[.55,.55,.75],amphora:[.75,.6,1.1],screen:[2.3,.6,1.7],mirror:[.65,.45,1.5],bathtub:[1.5,1,.7],anvil:[1,.6,.8],forge:[1.5,1.2,2],loom:[1.4,.9,1.7],'spinning-wheel':[1.1,.7,1.2],cart:[2.4,1.4,1.4],wheelbarrow:[1.6,.85,.95],cage:[1.2,1.2,1.5],'rope-coil':[.7,.6,.22],'potters-wheel':[1,.8,1.1],kiln:[1.5,1.2,2],grindstone:[1.2,.7,1.2],sawhorse:[1.3,.6,.9],'carpenter-clamp':[.9,.5,.65],'tanning-frame':[1.8,.7,1.8],'cheese-press':[.8,.7,1.3],'oil-press':[1.4,1.1,1.7],'grain-mill':[1.5,1.2,1.5],still:[1.4,1,1.7],'fish-rack':[1.5,.7,1.8],'herb-rack':[1.3,.7,1.7],smokehouse:[1.4,1.2,2.2],'bread-oven':[1.5,1.3,1.8],beehive:[.7,.7,1.1],'chicken-coop':[1.8,1.2,1.5],'feed-trough':[1.6,.7,.55],'hay-bale':[1.1,.65,.6],'wine-rack':[1.1,.6,1.5],'bolt-rack':[1.1,.55,1.3],'coal-bin':[1.4,1,.8],'market-scale':[.75,.55,.85],'fruit-stall':[2.4,1.4,2.4],'fish-stall':[2.2,1.3,2.3],'flower-planter':[1.2,.7,.8],carriage:[3.5,1.8,2.3],'windmill-frame':[2.7,1.2,3.2],crane:[2.6,1.7,3],'pulley-rig':[1.5,1,2.4],winch:[1.3,.9,1.1],'gear-pair':[1.1,.4,.65],bellows:[.55,.9,.24],'mine-cart':[1.6,1,1.1],
 'brick-wall':[3,.4,2.8],palisade:[3,.35,2.5],'iron-fence':[2.5,.3,1.7],'broken-wall':[2.5,.6,1.8],'iron-door':[2,1.8,2.8],'arched-door':[2.2,1.8,3.1],portcullis:[2.4,.7,5],gate:[3,2,3.1],shutters:[1.6,.8,1.5],ladder:[.8,.5,3],bridge:[4,2,1.3],'rope-bridge':[5,2,1.8],platform:[3,2,1.1],trapdoor:[2,2,1.8],well:[2,1.7,2.7],fountain:[2.5,2.5,2.7],column:[.8,.8,3.4],archway:[2.5,.7,3.1],signpost:[1.2,.45,2.2],tent:[3.5,3,2.6],awning:[3,2.3,2.5],campfire:[1.2,1.1,1],torch:[.4,.4,1.2],'street-lamp':[.8,.8,3.7],'hanging-lantern':[.55,.5,1],bell:[.9,.75,1.6],waterwheel:[2.5,1.1,2.9],boat:[3.5,1.6,1.1],target:[1.2,.7,1.7],scarecrow:[1.7,.6,2.1],chain:[.5,.35,1.6],banner:[1.2,.4,2.6],'notice-board':[1.7,.6,2.1],'dye-vat':[1.5,1.5,1.1],'brewing-vat':[1.5,1.5,1.8],sandbags:[2,.8,1.1],'public-pump':[.8,.65,1.6],'drinking-basin':[1.2,1,.9],'wash-line':[3,.8,2],'hitching-post':[2,.5,1.2],'road-barrier':[3,1.6,2.5],lifebuoy:[.8,.25,.8],'fishing-net':[2,.4,1.8],'street-clock':[1,.65,3.2],gargoyle:[1.3,.9,1.4],birdhouse:[.6,.6,1.4],'water-screw':[2.5,1.3,1.8],'sluice-gate':[2,.7,4.2],'rail-switch':[3,1.8,.6],'drawbridge-machine':[4,2.7,3],'trap-grate':[2,2,1.8],'rotating-platform':[2.5,2.5,.8],'signal-lantern':[.65,.6,1.3]
}
Object.assign(sizes,{
 'iron-door':[1.6,1.35,2.4],'arched-door':[1.8,1.55,2.7],gate:[3.2,1.6,2.8],portcullis:[2.6,.65,4.8],'sluice-gate':[2,.65,3],shutters:[1.6,.9,1.5],'road-barrier':[3.5,.8,3.5],trapdoor:[1.4,1.4,1.2],'trap-grate':[1.4,1.4,1.2],'drawbridge-machine':[4.5,3.7,3.9],campfire:[1.2,1,.8],torch:[.4,.4,1.8],'street-lamp':[.7,.7,3.4],'hanging-lantern':[.42,.42,1.25],'signal-lantern':[.65,.7,1.3]
})
export type LegacyAsset={id:string;slug:string;label:string;kind:SceneObjectKind;group:LegacyAssetGroup;native?:string;wallLike:boolean}
export const legacyAssets:LegacyAsset[]=expandedAssets.filter(a=>a.category==='object'&&a.objectKind).map(a=>{
 const slug=a.id.replace('expanded-object-',''),kind=a.objectKind!
 const group:LegacyAssetGroup=kind==='tree'&&!['scarecrow','birdhouse'].includes(slug)||kind==='rock'&&flora.has(slug)?'flora':kind==='rock'?'mineral':kind==='crate'||kind==='platform'&&!outdoor.has(slug)?'furniture':'structure'
 return {id:a.id,slug,label:a.label,kind,group,native:native[slug],wallLike:wallLike.has(slug)}
})
const byId=new Map(legacyAssets.map(a=>[a.id,a]))
export function legacyAsset(geometry:{kind:string;artwork?:string;asset?:string}):LegacyAsset|undefined{
 if(geometry.asset||!geometry.artwork)return
 const asset=byId.get(geometry.artwork)
 return asset?.kind===geometry.kind?asset:undefined
}
export function presentationAssetId(geometry:{kind:string;artwork?:string;asset?:string}){
 const legacy=legacyAsset(geometry);return geometry.asset??legacy?.native??legacy?.slug
}
// Defaults apply only to a new placement. Existing saved dimensions and flags
// remain authoritative, including deliberately oversized decorative models.
export function legacyPlacementDefaults(id:string):Partial<SceneObject>{
 const a=byId.get(id);if(!a)return {}
 const preset=a.native?tabletopAsset(a.native):undefined
 if(preset)return {width:preset.width,depth:preset.depth,height:preset.height,blocksMovement:preset.blocksMovement,blocksSight:preset.blocksSight,canSupport:!!preset.canSupport,...(a.slug==='locked-chest'?{locked:true}:{})}
 let size:[number,number,number]
 if(a.group==='flora'){
  size=a.kind==='tree'?[3,3,4.8]:[.9,.9,.65]
  if(['cypress','palm','bamboo','banana'].includes(a.slug))size=[1.8,1.8,4]
  if(['rose-bush','coffee','cotton','juniper','elder','hazel'].includes(a.slug))size=[1.7,1.7,1.6]
  if(/mushroom/.test(a.slug))size=a.slug==='giant-mushroom'?[2,2,2.6]:[.6,.6,.55]
  if(['reeds','cattails','sunflower','lupine','thistle'].includes(a.slug))size=[.7,.7,1.5]
  if(['lily-pad','lotus','cabbages','pumpkin-patch'].includes(a.slug))size=[1.1,1.1,.35]
  if(['log','driftwood','frozen-root','woodpile'].includes(a.slug))size=[2.3,1.1,.8]
  if(a.slug==='stump')size=[1,1,.8]
  size=sizes[a.slug]??size
  return {width:size[0],depth:size[1],height:size[2],blocksMovement:a.kind==='tree'||['log','woodpile','stump','giant-mushroom'].includes(a.slug),blocksSight:a.kind==='tree',canSupport:false}
 }
 if(a.group==='mineral')size=[1.5,1.2,1.2]
 else if(a.kind==='lamp')size=[.6,.6,2]
 else if(a.kind==='water')size=[1.8,1.5,1.4]
 else if(a.kind==='door'||a.kind==='wall')size=[2,.5,2.8]
 else size=[1.6,1,1.2]
 if(['flat-rock','bones','fossil','shell-mound','nest'].includes(a.slug))size=[1.5,1.1,.35]
 if(['obelisk','basalt-column','stalagmites','stalactites','ice-spire','mile-marker','statue'].includes(a.slug))size=[1,1,2.8]
 if(['crystal-cluster','geode','ore-iron','ore-copper','ore-gold','quartz-vein'].includes(a.slug))size=[1.2,1,.9]
 if(['bridge','rope-bridge','boat'].includes(a.slug))size=[3.5,1.8,1.3]
 if(['table','desk','workbench','carpenter-clamp'].includes(a.slug))size=[1.8,1,.95]
 const decoration=['bones','fossil','shell-mound','mile-marker','bollard','anchor','sundial','signpost','target','chain','banner','notice-board','wash-line','lifebuoy','fishing-net','street-clock','gargoyle','birdhouse','gear-pair','rope-coil','flower-planter','screen','mirror','bellows'].includes(a.slug)
 size=sizes[a.slug]??size
 const flatTop=['desk','workbench','platform'].includes(a.slug)
 return {width:size[0],depth:size[1],height:size[2],blocksMovement:!decoration&&a.kind!=='lamp',blocksSight:a.wallLike||['door','tree','rock'].includes(a.kind)&&!decoration,canSupport:flatTop,...(a.kind==='lamp'?{active:true}:{}),...(a.slug==='archway'?{open:true}:{})}
}
