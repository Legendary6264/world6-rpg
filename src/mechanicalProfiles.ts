import { physicsId, physicsKeys, physicsNumber, physicsRecord } from './physicsUnits'
import type { Scene, SceneObject } from './sceneTypes'

export const MAX_STRUCTURAL_ENERGY_J = 1e12
export const MAX_PUSH_IMPULSE_NS = 1e9
export const MAX_SLIDE_SPEED_MS = 1e4
export const MAX_SLIDE_FRICTION = 4
export type StructureProfile = { failureJ: number; absorbedJ: number }
export type LandingProfile = { massKg: number; region: string; contactCm2: number }
export type FallMotion = { sourceId: string; fromZ: number; speedMs: number }
export type SlidingProfile = { dryFriction: number; wetFriction: number | null; impactTransfer: number; vxMs: number; vyMs: number }

export function isStructureProfile(value: unknown): value is StructureProfile {
  return physicsRecord(value) && physicsKeys(value, ['failureJ', 'absorbedJ']) &&
    physicsNumber(value.failureJ, .001, MAX_STRUCTURAL_ENERGY_J) &&
    physicsNumber(value.absorbedJ, 0, value.failureJ) && value.absorbedJ < value.failureJ
}

export function isLandingProfile(value: unknown): value is LandingProfile {
  return physicsRecord(value) && physicsKeys(value, ['massKg', 'region', 'contactCm2']) &&
    physicsNumber(value.massKg, .001, 1e5) && physicsId(value.region) &&
    physicsNumber(value.contactCm2, .01, 1e6)
}

export function isFallMotion(value: unknown): value is FallMotion {
  return physicsRecord(value) && physicsKeys(value, ['sourceId', 'fromZ', 'speedMs']) &&
    physicsId(value.sourceId) && physicsNumber(value.fromZ, -1e6, 1e6) &&
    physicsNumber(value.speedMs, 0, 1e8)
}

export function isSlidingProfile(value: unknown): value is SlidingProfile {
  return physicsRecord(value) && physicsKeys(value, ['dryFriction', 'wetFriction', 'impactTransfer', 'vxMs', 'vyMs']) &&
    physicsNumber(value.dryFriction, 0, MAX_SLIDE_FRICTION) &&
    (value.wetFriction === null || physicsNumber(value.wetFriction, 0, MAX_SLIDE_FRICTION)) &&
    physicsNumber(value.impactTransfer, 0, 1) && physicsNumber(value.vxMs, -MAX_SLIDE_SPEED_MS, MAX_SLIDE_SPEED_MS) &&
    physicsNumber(value.vyMs, -MAX_SLIDE_SPEED_MS, MAX_SLIDE_SPEED_MS) && Math.hypot(value.vxMs, value.vyMs) <= MAX_SLIDE_SPEED_MS
}

export const isSliding = (profile: SlidingProfile | null | undefined) => !!profile && (profile.vxMs !== 0 || profile.vyMs !== 0)
export const canSlide = (object: Pick<SceneObject, 'kind' | 'height'>) =>
  object.height > 0 && ['crate', 'rock', 'lamp', 'platform'].includes(object.kind)

export function onSlideFloor(object: SceneObject, scene: Pick<Scene, 'groundZ' | 'width' | 'depth'>) {
  return canSlide(object) && object.physics?.material.phase === 'solid' && object.z === scene.groundZ &&
    object.x >= object.width / 2 && object.x <= scene.width - object.width / 2 &&
    object.y >= object.depth / 2 && object.y <= scene.depth - object.depth / 2
}

export function restingObject(object: SceneObject): SceneObject {
  const slide = object.physics?.sliding
  return slide && isSliding(slide) ? { ...object, physics:{...object.physics!, sliding:{...slide, vxMs:0, vyMs:0}} } : object
}

export function slidePlacementChanged(before: SceneObject, next: SceneObject) {
  return before.kind !== next.kind || before.x !== next.x || before.y !== next.y || before.z !== next.z ||
    before.width !== next.width || before.depth !== next.depth || before.height !== next.height
}
