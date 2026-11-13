import { DEFAULT_BACKGROUND_NOISE_DB } from './physicsState'
import { segmentSlab } from './sceneGeometry'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import type { SpeechHearer, SpeechRow } from './roundSpeech'
import type { SoundPortal, SoundSource } from './soundWaves'

type Bands = { low: number; speech: number }
type Barrier = { id: string; min: ScenePosition; max: ScenePosition; thicknessM: number; loss: Bands }
type Opening = { name: string; position: ScenePosition; heightM: number }
type NoiseSource = { id: string; position: ScenePosition; levelDbAt1m: number }
export type AcousticScene = {
  sceneId: string
  temperatureK: number
  backgroundNoiseDb: number
  barriers: Barrier[]
  openings: Opening[]
  sources: NoiseSource[]
}
export type SpeechForecast = {
  clarity: 'none' | SpeechHearer['clarity']
  signalDb: number
  noiseDb: number
  speechSnrDb: number
  arrivalMs: number | null
  barriers: number
  viaDoor?: string
}
export type ImpulseForecast = Pick<SpeechForecast, 'signalDb' | 'noiseDb' | 'arrivalMs' | 'barriers' | 'viaDoor'> & {
  apparentOrigin: ScenePosition
}

// Approximate two-band game profiles at normal incidence, in dB.
const partitionLoss = { low: 21, speech: 39 }
const doorLoss = { low: 14, speech: 27 }
const stoneLoss = { low: 31, speech: 51 }
const windowLoss = { low: 11, speech: 25 }
const voiceDbAt1m = { whisper: 42, normal: 60, shout: 85 }
const BAND_SPLIT_DB = 10 * Math.log10(2)
const MAX_PORTAL_PATHS = 6
const EPS_M = 1e-7

function barrierFor(object: SceneObject): Barrier {
  const { id, x, y, z, width, depth, height } = object
  const loss = object.kind === 'door' ? doorLoss : object.asset === 'stone-wall' ? stoneLoss :
    object.asset === 'timber-window' ? windowLoss : partitionLoss
  return {
    id, loss: { ...loss }, thicknessM: Math.min(width, depth),
    min: { x: x - width / 2 + EPS_M, y: y - depth / 2 + EPS_M, z: z + EPS_M },
    max: { x: x + width / 2 - EPS_M, y: y + depth / 2 - EPS_M, z: z + height - EPS_M },
  }
}

// This projection is only returned by the private declarations endpoint.
export function sceneAcoustics(scene: Scene): AcousticScene {
  const barriers: Barrier[] = [], openings: Opening[] = [], sources: NoiseSource[] = []
  for (const object of scene.objects) {
    const { id, x, y, z, height } = object
    const levelDbAt1m = object.physics?.noiseLevelDbAt1m
    if (levelDbAt1m != null && object.active !== false) sources.push({ id, position: { x, y, z: z + height / 2 }, levelDbAt1m })
    if (!object.blocksSight || height <= 2 * EPS_M || (object.kind !== 'wall' && object.kind !== 'door')) continue
    if (object.kind === 'door' && object.open) openings.push({ name: object.name, position: { x, y, z }, heightM: height })
    else barriers.push(barrierFor(object))
  }
  return {
    sceneId: scene.id,
    temperatureK: scene.physics?.ambientTemperatureK ?? 293.15,
    backgroundNoiseDb: scene.physics?.backgroundNoiseDb ?? DEFAULT_BACKGROUND_NOISE_DB,
    barriers, openings, sources,
  }
}

const distance = (a: ScenePosition, b: ScenePosition) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
const spreadLoss = (metres: number) => 20 * Math.log10(Math.max(1, metres))
const addDb = (a: number, b: number) => Math.max(a, b) + 10 * Math.log10(1 + 10 ** (-Math.abs(a - b) / 10))

function thicknessOnPath(a: ScenePosition, b: ScenePosition, barrier: Barrier, distanceM: number): number {
  const { min, max } = barrier
  const x = segmentSlab(a.x, b.x, min.x, max.x)
  if (!x) return 0
  const y = segmentSlab(a.y, b.y, min.y, max.y), z = segmentSlab(a.z, b.z, min.z, max.z)
  if (!y || !z) return 0
  const fraction = Math.min(x[1], y[1], z[1]) - Math.max(x[0], y[0], z[0])
  return Math.max(0, fraction * distanceM)
}

type Path = { lengthM: number; loss: Bands; barriers: number; apparentOrigin:ScenePosition; viaDoor?: string; bends?:1|2 }
function straightPath(scene:AcousticScene,a:ScenePosition,b:ScenePosition,sourceId?:string,check?:()=>void,prefixM=0,bends=0):Path {
  const leg = distance(a,b), lengthM = prefixM+leg, spreading = spreadLoss(lengthM)
  const direct:Path = {lengthM,loss:{low:spreading+3*bends,speech:spreading+6*bends},barriers:0,apparentOrigin:a}
  for (const barrier of scene.barriers) {
    check?.()
    if (barrier.id === sourceId) continue
    const thickness = thicknessOnPath(a, b, barrier, leg)
    if (thickness <= EPS_M) continue
    const factor = Math.min(2, Math.sqrt(thickness / barrier.thicknessM))
    direct.barriers++
    direct.loss.low += barrier.loss.low * factor
    direct.loss.speech += barrier.loss.speech * factor
  }
  return direct
}
function bestPath(scene: AcousticScene, a: ScenePosition, b: ScenePosition, sourceId?: string, check?:()=>void, impulse=false): Path {
  const direct = straightPath(scene,a,b,sourceId,check), {lengthM} = direct
  if (!direct.barriers || !scene.openings.length) return direct

  // A turn at an opening weakens both bands. The last opening is the apparent
  // direction of the signal. Bound the candidates and trace each end leg once.
  const lossAt = (metres:number, bends:number) => {
    const spread = spreadLoss(metres)
    return {low:spread+3*bends,speech:spread+6*bends}
  }
  const score = (loss:Bands) => impulse ? -addDb(-loss.low,-loss.speech) : loss.speech
  if (score(lossAt(lengthM,1)) >= score(direct.loss)) return direct
  const candidates = scene.openings.map(opening => {
    const { x, y, z } = opening.position
    const margin = opening.heightM * .1
    const point = { x, y, z: Math.min(z + opening.heightM - margin, Math.max(z + margin, (a.z + b.z) / 2)) }
    const first = distance(a, point), second = distance(point, b)
    return { opening, point, first, second, lengthM: first + second }
  }).sort((a, b) => a.lengthM - b.lengthM).slice(0,MAX_PORTAL_PATHS)
  const clearLeg = (from:ScenePosition,to:ScenePosition,metres:number) => !scene.barriers.some(barrier=>{
    check?.()
    return barrier.id!==sourceId && thicknessOnPath(from,to,barrier,metres)>EPS_M
  })
  const legs = candidates.map(candidate=>({...candidate,
    enter:clearLeg(a,candidate.point,candidate.first),leave:clearLeg(candidate.point,b,candidate.second),
  }))
  let best = direct
  for (const {enter,leave,opening,point,lengthM} of legs) {
    const loss = lossAt(lengthM,1)
    if (score(loss) >= score(best.loss)) break
    if (enter && leave) best = {lengthM,loss,barriers:0,apparentOrigin:point,viaDoor:opening.name,bends:1}
  }
  if (score(lossAt(lengthM,2)) >= score(best.loss)) return best
  for (const entry of legs.filter(leg=>leg.enter)) {
    for (const exit of legs.filter(leg=>leg.leave && leg!==entry)) {
      const middle = distance(entry.point,exit.point), total = entry.first+middle+exit.second
      const loss = lossAt(total,2)
      if (score(loss) < score(best.loss) && clearLeg(entry.point,exit.point,middle)) {
        best = {lengthM:total,loss,barriers:0,apparentOrigin:exit.point,viaDoor:entry.opening.name+' → '+exit.opening.name,bends:2}
      }
    }
  }
  return best
}

function backgroundAt(scene:AcousticScene,listener:ScenePosition,check?:()=>void):Bands {
  const ambientBand = scene.backgroundNoiseDb - BAND_SPLIT_DB
  const noise = {low:ambientBand,speech:ambientBand}
  for (const source of scene.sources) {
    check?.()
    const { loss } = bestPath(scene, source.position, listener, source.id,check)
    const sourceBand = source.levelDbAt1m - BAND_SPLIT_DB
    noise.low = addDb(noise.low, sourceBand - loss.low)
    noise.speech = addDb(noise.speech, sourceBand - loss.speech)
  }
  return noise
}
export const airSoundSpeedMs = (scene:AcousticScene) => Math.sqrt(1.4 * 287.05 * scene.temperatureK)
function arrivalMs(scene:AcousticScene,lengthM:number):number|null {
  const airSpeedMs = airSoundSpeedMs(scene)
  return airSpeedMs > 0 ? 1000 * lengthM / airSpeedMs : null
}
export const audibleSound = (signalDb:number,noiseDb:number,attentionDb=0) =>
  signalDb+attentionDb>=20 && signalDb+attentionDb-noiseDb>=-6

export function forecastImpulse(scene:AcousticScene,source:ScenePosition,listener:ScenePosition,levelDbAt1m:number,sourceBarrierId?:string,check?:()=>void):ImpulseForecast {
  const path = bestPath(scene,source,listener,sourceBarrierId,check,true)
  return impulseOnPath(scene,listener,levelDbAt1m,path,check)
}

export function soundPortal(scene:AcousticScene,source:SoundSource,listener:ScenePosition,check:()=>void):SoundPortal|undefined {
  if (!scene.openings.length || !scene.barriers.length) return undefined
  const route = bestPath(scene,source.point,listener,source.objectId,check,true)
  if (!route.bends || !route.viaDoor) return undefined
  return {point:route.apparentOrigin,prefixM:Math.max(0,route.lengthM-distance(route.apparentOrigin,listener)),bends:route.bends,label:route.viaDoor}
}

export function forecastSoundRoute(scene:AcousticScene,source:SoundSource,listener:ScenePosition,portal:SoundPortal|undefined,check:()=>void):ImpulseForecast {
  const path = straightPath(scene,portal?.point ?? source.point,listener,source.objectId,check,portal?.prefixM,portal?.bends)
  if (portal) path.viaDoor=portal.label
  return impulseOnPath(scene,listener,source.levelDbAt1m,path,check)
}

function impulseOnPath(scene:AcousticScene,listener:ScenePosition,levelDbAt1m:number,path:Path,check?:()=>void):ImpulseForecast {
  const band = levelDbAt1m-BAND_SPLIT_DB
  const signalDb = addDb(band-path.loss.low,band-path.loss.speech)
  const noise = backgroundAt(scene,listener,check)
  return {signalDb,noiseDb:addDb(noise.low,noise.speech),arrivalMs:arrivalMs(scene,path.lengthM),
    barriers:path.barriers,viaDoor:path.viaDoor,apparentOrigin:path.apparentOrigin}
}

export function forecastSpeech(scene: AcousticScene, speaker: ScenePosition, listener: ScenePosition, volume: SpeechRow['action']['volume']): SpeechForecast {
  const path = bestPath(scene, speaker, listener)
  const voiceBand = voiceDbAt1m[volume] - BAND_SPLIT_DB
  const speechDb = voiceBand - path.loss.speech
  const signalDb = addDb(voiceBand - path.loss.low, speechDb)
  const noise = backgroundAt(scene,listener), noiseDb = addDb(noise.low,noise.speech)
  const speechSnrDb = speechDb - noise.speech
  const clarity = !audibleSound(signalDb,noiseDb) ? 'none' : speechSnrDb >= 12 ? 'clear' : speechSnrDb >= 3 ? 'fragment' : 'sound'
  return {
    clarity, signalDb, noiseDb, speechSnrDb,
    arrivalMs: arrivalMs(scene,path.lengthM),
    barriers: path.barriers, viaDoor: path.viaDoor,
  }
}
