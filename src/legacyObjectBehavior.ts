import type {SceneObjectKind} from './sceneTypes'

type Appearance={kind:string;asset?:string;artwork?:string;open?:boolean}
type Behavior={kind:SceneObjectKind;open?:boolean;lock?:boolean;fire?:boolean;enclosedFire?:boolean;emitter?:string;openLabel?:string;closeLabel?:string;stateLabel?:string}
// Stable artwork identities reuse existing open/locked/active fields. This
// small catalogue has no renderer, SVG, world-state or network dependency.
const behaviors:Record<string,Behavior>={
 desk:{kind:'platform',open:true,openLabel:'Выдвинуть ящики',closeLabel:'Задвинуть ящики',stateLabel:'Ящики выдвинуты'},
 cabinet:{kind:'platform',open:true,lock:true},wardrobe:{kind:'platform',open:true,lock:true},
 sack:{kind:'crate',open:true,stateLabel:'Мешок развязан'},
 kiln:{kind:'platform',open:true,fire:true,enclosedFire:true},'bread-oven':{kind:'platform',open:true,fire:true,enclosedFire:true},
 forge:{kind:'platform',fire:true,emitter:'forge-forge-glow'},smokehouse:{kind:'platform',open:true,lock:true},
 'chicken-coop':{kind:'crate',open:true,lock:true},carriage:{kind:'crate',open:true,lock:true},
 shutters:{kind:'wall',open:true,stateLabel:'Ставни открыты'},
 'trap-grate':{kind:'platform',open:true,openLabel:'Поднять решётку',closeLabel:'Опустить решётку',stateLabel:'Решётка поднята'},
 'drawbridge-machine':{kind:'platform',open:true,openLabel:'Поднять мост',closeLabel:'Опустить мост',stateLabel:'Мост поднят'},
 archway:{kind:'door',open:false,lock:false},
}
const furniturePlatforms=new Set('table round-table bench chair throne stool desk workbench altar bed cot bedroll hammock bookcase cabinet wardrobe shelf weapon-rack rug screen mirror bathtub anvil forge loom spinning-wheel potters-wheel kiln grindstone sawhorse carpenter-clamp tanning-frame cheese-press oil-press grain-mill still fish-rack herb-rack smokehouse bread-oven market-scale windmill-frame crane pulley-rig winch gear-pair bellows'.split(' '))
export function objectRelocatable(o:Appearance){
 return ['crate','lamp'].includes(o.kind)||o.kind==='platform'&&!o.asset&&!!o.artwork?.startsWith('expanded-object-')&&furniturePlatforms.has(o.artwork.slice('expanded-object-'.length))
}
export function legacyObjectBehavior(o:Appearance):Behavior|undefined{
 if(o.asset||!o.artwork?.startsWith('expanded-object-'))return
 const b=behaviors[o.artwork.slice('expanded-object-'.length)]
 return b?.kind===o.kind?b:undefined
}
export function objectLightSource(o:Appearance){return o.kind==='lamp'||legacyObjectBehavior(o)?.fire===true}
export function objectLightReachesRoom(o:Appearance){
 return objectLightSource(o)&&(!legacyObjectBehavior(o)?.enclosedFire||o.open===true)
}
export function objectOpenStateLabel(o:Appearance){
 return legacyObjectBehavior(o)?.stateLabel??(o.kind==='door'?'Дверь открыта':o.asset==='chest'||o.artwork?.endsWith('-chest')?'Сундук открыт':o.kind==='crate'?'Контейнер открыт':'Объект открыт')
}
