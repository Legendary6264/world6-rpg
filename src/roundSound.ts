import { audibleSound, forecastImpulse, sceneAcoustics } from './acoustics'
import { isJournalEntry, isTimestamp, MAX_JOURNAL_ENTRIES } from './characterKnowledge'
import type { JournalEntry } from './characterKnowledge'
import { compareAmounts } from './exactWork'
import type { ExactAmount } from './exactWork'
import { MAX_SOUND_LEVEL_DB } from './physicsState'
import type { World } from './rpgEngine'
import type { ListeningWindow } from './roundListening'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'

export type SoundSource = {
  kind: 'door' | 'impact' | 'landing' | 'ability'
  point: ScenePosition
  levelDbAt1m: number
  objectId?: string
}
type SoundHearer = {
  actorId:string; signalDb:number; noiseDb:number; arrivalMs:number; barriers:number;
  direction:string; viaDoor?:string; focused?:true
}
export type RoundSound = SoundSource & {atMs:ExactAmount; heard:SoundHearer[]}
export const soundLabels = {door:'Движение двери',impact:'Удар',landing:'Приземление',ability:'Звук способности'} as const
export const isSoundJournalEntry = (entry:Pick<JournalEntry,'id'>) => entry.id.startsWith('event:noise:')
const ATTENTION_DB = 6, MAX_SOUNDS = 200, MAX_ACOUSTIC_CHECKS = 200000
const compass = ['с востока','с юго-востока','с юга','с юго-запада','с запада','с северо-запада','с севера','с северо-востока']
const boundedDb = (db:number) => Math.max(0,Math.min(MAX_SOUND_LEVEL_DB,db))
// Game calibrations. Energy or speed only sets a relative impulse level.
export const impactSoundDb = (energyJ:number) => boundedDb(65+10*Math.log10(energyJ/10))
export const landingSoundDb = (speedMs:number) => boundedDb(64+20*Math.log10(speedMs/3))
export function doorSound(door:SceneObject,wasOpen:boolean):SoundSource|undefined {
  if (door.kind!=='door' || door.open===wasOpen) return undefined
  return {kind:'door',objectId:door.id,point:{x:door.x,y:door.y,z:door.z+door.height/2},levelDbAt1m:door.open?52:68}
}

function bearing(ear:ScenePosition,origin:ScenePosition):string {
  const dx = origin.x-ear.x, dy = origin.y-ear.y, dz = origin.z-ear.z, planar = Math.hypot(dx,dy)
  if (Math.hypot(planar,dz) < 1) return 'рядом'
  if (Math.abs(dz) > 2*planar) return dz>0 ? 'сверху' : 'снизу'
  return compass[(Math.round(Math.atan2(dy,dx)*4/Math.PI)+8)%8]
}

function listensToward(world:World,scene:Scene,window:ListeningWindow,ear:ScenePosition,origin:ScenePosition):boolean {
  const {target} = window
  if (target.kind==='none') return true
  let focus:ScenePosition|undefined
  if ('point' in target) focus = target.point
  else if (target.kind==='object') focus = scene.objects.find(object=>object.id===target.id)
  else if (target.kind==='contact') {
    const disclosure = world.campaign.perceptions?.heroes.find(hero=>hero.actorId===window.actorId)
      ?.scenes.find(known=>known.sceneId===scene.id)?.contacts.find(contact=>contact.id===target.id)
    focus = scene.tokens.find(token=>token.actorId===(disclosure?.actorId ?? target.id))
  }
  if (!focus) return false
  const ax = focus.x-ear.x, ay = focus.y-ear.y, bx = origin.x-ear.x, by = origin.y-ear.y
  const magnitude = Math.hypot(ax,ay)*Math.hypot(bx,by)
  return magnitude>0 && ax*bx+ay*by >= Math.SQRT1_2*magnitude
}

export function roundAcoustics(seed:string,recordedAt:unknown,windows:readonly ListeningWindow[]) {
  if (!isTimestamp(recordedAt)) throw Error('Нужна серверная отметка времени для записи звуков раунда.')
  const sounds:RoundSound[] = [], journalCount = new Map<string,number>()
  const attention = new Map<string,ListeningWindow[]>()
  for (const window of windows) {
    if (window.mode!=='listen') continue
    const list = attention.get(window.actorId) ?? []
    list.push(window)
    attention.set(window.actorId,list)
  }
  let checks = 0
  function check() {
    if (++checks>MAX_ACOUSTIC_CHECKS) throw Error('Превышен предел расчёта слышимости. Сократи раунд или число источников шума.')
  }
  return {sounds,emit(world:World,scene:Scene,atMs:ExactAmount,source:SoundSource) {
    if (sounds.length>=MAX_SOUNDS) throw Error('В раунде слишком много звуковых событий. Сократи длительность или число действий.')
    const acoustics = sceneAcoustics(scene), heard:SoundHearer[] = []
    const actors = new Map(world.characters.map(actor=>[actor.id,actor]))
    for (const token of scene.tokens) {
      const actor = actors.get(token.actorId)
      if (!actor || actor.rpg.dead || actor.body.consciousness!=='awake') continue
      check()
      const ear = {x:token.x,y:token.y,z:Math.min(scene.maxZ,token.z+1.5)}
      // Even an unobstructed signal cannot reach this listener over the scene floor.
      const distanceM = Math.max(1,Math.hypot(ear.x-source.point.x,ear.y-source.point.y,ear.z-source.point.z))
      if (!audibleSound(source.levelDbAt1m-20*Math.log10(distanceM),acoustics.backgroundNoiseDb,ATTENTION_DB)) continue
      const {apparentOrigin,...forecast} = forecastImpulse(acoustics,source.point,ear,source.levelDbAt1m,source.objectId,check)
      const {signalDb,noiseDb,arrivalMs} = forecast
      if (arrivalMs===null) continue
      const window = attention.get(actor.id)?.find(w=>w.sceneId===scene.id && compareAmounts(w.fromMs,atMs)<=0 &&
        (compareAmounts(atMs,w.toMs)<0 || !w.completes && compareAmounts(atMs,w.toMs)===0))
      const focused = !!window && listensToward(world,scene,window,ear,apparentOrigin)
      if (!audibleSound(signalDb,noiseDb,focused?ATTENTION_DB:0)) continue
      const direction = bearing(ear,apparentOrigin)
      heard.push({...forecast,actorId:actor.id,arrivalMs,direction,...(focused?{focused:true as const}:{})})
      const ordinal = (journalCount.get(actor.id) ?? 0)+1, eventKey = 'noise:'+seed+':'+ordinal
      const entry:JournalEntry = {
        id:'event:'+eventKey,eventKey,origin:'automatic',title:'Услышан звук',source:'Слух',
        text:(signalDb-noiseDb>=12?'Отчётливый звук ':'Приглушённый звук ')+direction+'.',
        gameTime:String(Number(world.campaign.seconds.toFixed(6)))+' с',category:'places',certainty:'observation',
        annotation:'',createdAt:recordedAt,updatedAt:recordedAt,
      }
      if (!isJournalEntry(entry) || actor.journal.length>=MAX_JOURNAL_ENTRIES || actor.journal.some(note=>note.eventKey===eventKey || note.id===entry.id)) {
        throw Error('Не удалось добавить звук в журнал героя. Проверь его записи и технический предел.')
      }
      actor.journal.push(entry)
      journalCount.set(actor.id,ordinal)
    }
    sounds.push({...source,point:{...source.point},atMs,heard})
  }}
}
