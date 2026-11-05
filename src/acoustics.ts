import { DEFAULT_BACKGROUND_NOISE_DB } from './physicsState'
import { segmentSlab } from './sceneGeometry'
import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import type { SpeechHearer, SpeechRow } from './roundSpeech'

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

type Path = { lengthM: number; loss: Bands; barriers: number; viaDoor?: string }
function bestPath(scene: AcousticScene, a: ScenePosition, b: ScenePosition, sourceId?: string): Path {
  const lengthM = distance(a, b), spreading = spreadLoss(lengthM)
  const direct: Path = { lengthM, loss: { low: spreading, speech: spreading }, barriers: 0 }
  for (const barrier of scene.barriers) {
    if (barrier.id === sourceId) continue
    const thickness = thicknessOnPath(a, b, barrier, lengthM)
    if (thickness <= EPS_M) continue
    const factor = Math.min(2, Math.sqrt(thickness / barrier.thicknessM))
    direct.barriers++
    direct.loss.low += barrier.loss.low * factor
    direct.loss.speech += barrier.loss.speech * factor
  }
  if (!direct.barriers || !scene.openings.length) return direct

  // Try a bounded number of single-opening detours. Each leg needs a clear path.
  const candidates = scene.openings.map(opening => {
    const { x, y, z } = opening.position
    const margin = opening.heightM * .1
    const point = { x, y, z: Math.min(z + opening.heightM - margin, Math.max(z + margin, (a.z + b.z) / 2)) }
    const first = distance(a, point), second = distance(point, b)
    return { opening, point, first, second, lengthM: first + second }
  }).sort((a, b) => a.lengthM - b.lengthM)
  let best = direct
  for (const candidate of candidates.slice(0, MAX_PORTAL_PATHS)) {
    const { opening, point, first, second, lengthM } = candidate
    const spreading = spreadLoss(lengthM)
    const loss = { low: spreading + 3, speech: spreading + 6 }
    if (loss.speech >= best.loss.speech) break
    const blocked = scene.barriers.some(barrier => barrier.id !== sourceId && (
      thicknessOnPath(a, point, barrier, first) > EPS_M || thicknessOnPath(point, b, barrier, second) > EPS_M
    ))
    if (!blocked) best = { lengthM, loss, barriers: 0, viaDoor: opening.name }
  }
  return best
}

export function forecastSpeech(scene: AcousticScene, speaker: ScenePosition, listener: ScenePosition, volume: SpeechRow['action']['volume']): SpeechForecast {
  const path = bestPath(scene, speaker, listener)
  const voiceBand = voiceDbAt1m[volume] - BAND_SPLIT_DB
  const speechDb = voiceBand - path.loss.speech
  const signalDb = addDb(voiceBand - path.loss.low, speechDb)
  const ambientBand = scene.backgroundNoiseDb - BAND_SPLIT_DB
  let noiseLowDb = ambientBand, noiseSpeechDb = ambientBand
  for (const source of scene.sources) {
    const { loss } = bestPath(scene, source.position, listener, source.id)
    const sourceBand = source.levelDbAt1m - BAND_SPLIT_DB
    noiseLowDb = addDb(noiseLowDb, sourceBand - loss.low)
    noiseSpeechDb = addDb(noiseSpeechDb, sourceBand - loss.speech)
  }
  const noiseDb = addDb(noiseLowDb, noiseSpeechDb)
  const speechSnrDb = speechDb - noiseSpeechDb
  const audible = signalDb >= 20 && signalDb - noiseDb >= -6
  const clarity = !audible ? 'none' : speechSnrDb >= 12 ? 'clear' : speechSnrDb >= 3 ? 'fragment' : 'sound'
  const airSpeedMs = Math.sqrt(1.4 * 287.05 * scene.temperatureK)
  return {
    clarity, signalDb, noiseDb, speechSnrDb,
    arrivalMs: airSpeedMs > 0 ? 1000 * path.lengthM / airSpeedMs : null,
    barriers: path.barriers, viaDoor: path.viaDoor,
  }
}
