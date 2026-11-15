import {createHash} from 'node:crypto'
import {deflateRawSync,inflateRawSync} from 'node:zlib'
import {world as validateWorld} from './validation.mjs'
import {projectWorldEntities,restoreWorldEntities,diffEntitySnapshots} from './generated/worldEntities.mjs'

const MAX_RAW=8*1024*1024,MAX_PACKED=512*1024
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)
// Archives may normalize object key order. Bind recordings to canonical values,
// so importing a campaign never requires the original JSON serialization bytes.
const digest=world=>createHash('sha256').update(JSON.stringify(world,(_key,value)=>object(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)):value)).digest('hex')
export function isRoundPresentationSource(value){
 return object(value)&&Object.keys(value).length===3&&value.version===1&&value.format==='deflate-base64'&&typeof value.data==='string'&&value.data.length>0&&value.data.length<=Math.ceil(MAX_PACKED/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
}
export function captureRoundPresentation(beforeJson,afterJson,revision){
 const before=validateWorld(JSON.parse(beforeJson)),after=validateWorld(JSON.parse(afterJson))
 const from=projectWorldEntities(before,revision-1),to=projectWorldEntities(after,revision),delta=diffEntitySnapshots(from,to)
 const changed=new Set(delta.changes.filter(c=>c.operation!=='removed').map(c=>c.entityId)),{entities,...root}=to
 const payload={version:1,root,order:entities.map(e=>e.id),changed:entities.filter(e=>changed.has(e.id)),removed:delta.changes.filter(c=>c.operation==='removed').map(c=>c.entityId),beforeHash:digest(before),afterHash:digest(after)}
 const json=JSON.stringify(payload)
 // A recording is optional: unusually large scenes keep their saved mechanical
 // results and event timeline instead of blocking a previously valid round.
 if(Buffer.byteLength(json)>MAX_RAW)return null
 const packed=deflateRawSync(Buffer.from(json),{level:4})
 return packed.length<=MAX_PACKED?{version:1,format:'deflate-base64',data:packed.toString('base64')}:null
}
export function restoreRoundPresentation(beforeJson,source,revision){
 if(!isRoundPresentationSource(source))throw Error('Неподдерживаемая запись раунда.')
 const payload=JSON.parse(inflateRawSync(Buffer.from(source.data,'base64'),{maxOutputLength:MAX_RAW}).toString('utf8'))
 const before=validateWorld(JSON.parse(beforeJson))
 if(!object(payload)||payload.version!==1||!object(payload.root)||payload.root.revision!==revision||payload.beforeHash!==digest(before)||!Array.isArray(payload.order)||!Array.isArray(payload.changed)||!Array.isArray(payload.removed))throw Error('Запись не соответствует исходному раунду.')
 const entities=new Map(projectWorldEntities(before,revision-1).entities.map(e=>[e.id,e]))
 for(const id of payload.removed)entities.delete(id)
 for(const entity of payload.changed){if(!object(entity)||typeof entity.id!=='string')throw Error('Повреждён участник записи.');entities.set(entity.id,entity)}
 if(payload.order.length!==entities.size||new Set(payload.order).size!==entities.size||payload.order.some(id=>!entities.has(id)))throw Error('Повреждён состав записи.')
 const after=validateWorld(restoreWorldEntities({...payload.root,entities:payload.order.map(id=>entities.get(id))}))
 if(payload.afterHash!==digest(after))throw Error('Итог записи не совпадает с сохранённым результатом.')
 return after
}
