import { airSoundSpeedMs, audibleSound, forecastSoundRoute, sceneAcoustics, soundPortal } from './acoustics'
import type { AcousticScene } from './acoustics'
import { isTimestamp } from './characterKnowledge'
import { amountFromNumber } from './exactWork'
import type { ExactAmount } from './exactWork'
import { acousticCheckBudget, ATTENTION_DB, listeningFocus, logHeardSound, soundBearing } from './roundSound'
import type { RoundSound, SoundHearer } from './roundSound'
import { fallingPieces } from './sceneMovement'
import type { MovementPiece } from './sceneMovement'
import { soundTrackPoint, waveCrossing } from './soundArrival'
import { isSoundWaves, MAX_PENDING_LISTENERS, MAX_SOUND_EVENTS } from './soundWaves'
import type { PendingListener, SoundPortal, SoundSource, SoundWave } from './soundWaves'
import type { Scene, ScenePosition } from './sceneTypes'
import type { World } from './rpgEngine'
import type { ListeningWindow } from './roundListening'

export type TimedSound = {atMs:number;source:SoundSource}
export type EarlierSoundArrival = SoundHearer & {kind:SoundSource['kind']; emittedSeconds:number; receivedAtMs:number; waveId:string}
type Heard = {wave:SoundWave; hearer:SoundHearer & {receivedAtMs:number}}
type Track = {feet:MovementPiece[]; ears:MovementPiece[]}
const numeric = (amount:ExactAmount) => Number(amount.numerator)/Number(amount.denominator)
const earAt = (p:ScenePosition) => ({x:p.x,y:p.y,z:p.z+1.5})
const awake = (actor:World['characters'][number]|undefined) => !!actor && !actor.rpg.dead && actor.body.consciousness==='awake'
const freeField = (db:number,metres:number) => db-20*Math.log10(Math.max(1,metres))
const distance = (a:ScenePosition,b:ScenePosition) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)

export function roundWaveSound(seed:string,recordedAt:unknown,windows:readonly ListeningWindow[],startSeconds:number,saved?:SoundWave[]) {
  if (!isTimestamp(recordedAt)) throw Error('Нужна серверная отметка времени для записи звуков раунда.')
  const stamp=recordedAt, sounds:RoundSound[]=[], earlier:EarlierSoundArrival[]=[]
  const reports=new Map<string,RoundSound>(), isFocused=listeningFocus(windows), check=acousticCheckBudget()
  let waves:SoundWave[] = structuredClone((saved ?? []).filter(wave=>wave.emittedSeconds<=startSeconds+1e-6))
  let totalHeard=0

  function add(scene:Scene,acoustic:AcousticScene,atMs:ExactAmount,source:SoundSource,position:(actorId:string)=>ScenePosition|undefined) {
    if (sounds.length>=MAX_SOUND_EVENTS) throw Error('В раунде слишком много звуковых событий. Сократи длительность или число действий.')
    const report:RoundSound={...source,point:{...source.point},atMs,heard:[],pending:0}
    sounds.push(report)
    const speedMs=airSoundSpeedMs(acoustic)
    if (speedMs<=0 || source.levelDbAt1m+ATTENTION_DB<20) return
    const id='noise:'+seed+':wave:'+sounds.length
    const listeners:PendingListener[] = scene.tokens.flatMap(token=>{
      if (source.actorId===token.actorId) return []
      check()
      const ear=earAt(position(token.actorId) ?? token)
      const portal=soundPortal(acoustic,source,ear,check)
      return [{actorId:token.actorId,direct:true,...(portal ? {portal} : {})}]
    })
    if (listeners.length) {
      reports.set(id,report)
      waves.push({id,source:{...source,point:{...source.point}},speedMs,emittedSeconds:startSeconds+numeric(atMs)/1000,listeners})
    }
  }

  function advance(world:World,scene:Scene,fromMs:number,toMs:number,paths:ReadonlyMap<string,MovementPiece[]>,
      startAwake:ReadonlySet<string>,steps:TimedSound[]) {
    if (!waves.length && !steps.length) return
    const acoustic=sceneAcoustics(scene), tracks=new Map<string,Track>(), span=toMs-fromMs
    const actors=new Map(world.characters.map(actor=>[actor.id,actor]))
    for (const token of scene.tokens) {
      const feet=paths.get(token.actorId) ?? (span>0 ? fallingPieces(scene,token,span/1000) : undefined) ?? [{start:0,end:1,a:token,b:token}]
      tracks.set(token.actorId,{feet,ears:feet.map(p=>({...p,a:earAt(p.a),b:earAt(p.b)}))})
    }
    const fractionAt = (time:number) => span>0 ? (time-fromMs)/span : 0
    const positionAt = (actorId:string,atMs:number) => {
      const track=tracks.get(actorId)
      return track && soundTrackPoint(track.feet,fractionAt(atMs))
    }
    for (const step of steps) add(scene,acoustic,amountFromNumber(step.atMs),step.source,id=>positionAt(id,step.atMs))

    const heard:Heard[]=[]
    waves=waves.flatMap(wave=>{
      const emittedMs=(wave.emittedSeconds-startSeconds)*1000
      const listeners=wave.listeners.flatMap(listener=>{
        const track=tracks.get(listener.actorId)
        const actor=actors.get(listener.actorId)
        if (!track || !actor) return []
        const ears=track.ears
        function arrive(portal?:SoundPortal) {
          const origin=portal?.point ?? wave.source.point, prefix=portal?.prefixM ?? 0
          const when=waveCrossing(ears,origin,prefix,wave.speedMs,emittedMs,fromMs,toMs,check)
          if (when===undefined) {
            const reachedM=Math.max(0,toMs-emittedMs)*wave.speedMs/1000
            return audibleSound(freeField(wave.source.levelDbAt1m,reachedM),0,ATTENTION_DB) ? 'pending' : 'gone'
          }
          if (when==='passed' || !(when>=toMs-1e-6 ? awake(actor) : startAwake.has(listener.actorId))) return 'gone'
          const ear=soundTrackPoint(ears,fractionAt(when))
          if (!audibleSound(freeField(wave.source.levelDbAt1m,prefix+distance(ear,origin)),acoustic.backgroundNoiseDb,ATTENTION_DB)) return 'gone'
          const {apparentOrigin,...forecast}=forecastSoundRoute(acoustic,wave.source,ear,portal,check)
          const focused=isFocused(world,scene,listener.actorId,amountFromNumber(when),ear,apparentOrigin,id=>positionAt(id,when))
          if (!audibleSound(forecast.signalDb,forecast.noiseDb,focused?ATTENTION_DB:0)) return 'gone'
          if (++totalHeard>MAX_PENDING_LISTENERS) throw Error('Слишком много полученных звуков за раунд. Сократи число источников.')
          heard.push({wave,hearer:{...forecast,actorId:listener.actorId,arrivalMs:Math.max(0,when-emittedMs),
            receivedAtMs:when,direction:soundBearing(ear,apparentOrigin),...(focused ? {focused:true as const} : {})}})
          return 'heard'
        }
        const direct=listener.direct ? arrive() : 'gone'
        if (direct==='heard') return []
        const indirect=listener.portal ? arrive(listener.portal) : 'gone'
        if (indirect==='heard' || direct!=='pending' && indirect!=='pending') return []
        return [{actorId:listener.actorId,direct:direct==='pending',...(indirect==='pending' && listener.portal ? {portal:listener.portal} : {})}]
      })
      return listeners.length ? [{...wave,listeners}] : []
    })
    for (const {wave,hearer} of heard.sort((a,b)=>a.hearer.receivedAtMs-b.hearer.receivedAtMs)) {
      logHeardSound(actors.get(hearer.actorId)!,wave.id,stamp,startSeconds+hearer.receivedAtMs/1000,hearer)
      const report=reports.get(wave.id)
      if (report) report.heard.push(hearer)
      else earlier.push({...hearer,kind:wave.source.kind,emittedSeconds:wave.emittedSeconds,waveId:wave.id})
    }
  }

  return {sounds,earlier,advance,
    emit(scene:Scene,atMs:ExactAmount,source:SoundSource) {
      add(scene,sceneAcoustics(scene),atMs,source,id=>scene.tokens.find(token=>token.actorId===id))
    },
    finish() {
      if (!isSoundWaves(waves)) throw Error('Слишком много звуковых волн осталось в сцене. Сократи число источников или увеличь длительность раунда.')
      for (const wave of waves) {
        const report=reports.get(wave.id)
        if (report) report.pending=wave.listeners.length
      }
      return waves
    },
  }
}
