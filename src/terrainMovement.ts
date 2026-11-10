import type { Scene, SceneObject, ScenePosition } from './sceneTypes'
import { supportsSceneTokens } from './waterPhysics'

const EPS = 1e-6
export type JumpMotion = {arcM:number; apexZ:number; launchMs:number; horizontalMs:number; landingMs:number}

// A declaration fixes the two supports and the elapsed world time. Gravity
// then determines the launch and landing velocities without an extra roll.
export function jumpMotion(scene:Scene,from:ScenePosition,to:ScenePosition,seconds:number):JumpMotion {
  const g = scene.physics?.gravityMs2 ?? 9.81, rise = to.z-from.z
  const arcM = .5*g*seconds**2
  const launchMs = (rise+arcM)/seconds, landingMs = (arcM-rise)/seconds
  if (!g || !(launchMs>EPS) || !(landingMs>EPS)) {
    throw Error('Это время и высота не дают дугу прыжка с отрывом вверх и приземлением вниз. Скорректируй время или отметку.')
  }
  const apexZ = from.z+launchMs**2/(2*g)
  if (apexZ>scene.maxZ+EPS) throw Error('Дуга прыжка выходит выше границы сцены.')
  if (Math.min(from.z,to.z)<scene.groundZ-EPS && apexZ>scene.groundZ+EPS) throw Error('Дуга прыжка проходит сквозь уровень земли.')
  return {arcM,apexZ,launchMs,landingMs,horizontalMs:Math.hypot(to.x-from.x,to.y-from.y)/seconds}
}

export function canMarkClimbable(object:SceneObject):boolean {
  return object.kind!=='water' && object.kind!=='door' && object.height>EPS && object.blocksMovement && supportsSceneTokens(object)
}

export function climbPath(scene:Scene,from:ScenePosition,to:ScenePosition,radius:number,heightM:number) {
  const ascending = from.z<to.z, low = ascending ? from : to, high = ascending ? to : from
  if (high.z-low.z<=EPS) throw Error('Для подъёма или спуска выбери опору на другой высоте.')
  const reach = Math.min(.75,.3*heightM)
  const anchor = scene.objects.find(object=>{
    if (!object.physics?.climbable || !canMarkClimbable(object) || Math.abs(high.z-object.z-object.height)>EPS ||
      low.z<object.z-EPS || Math.abs(high.x-object.x)>object.width/2 || Math.abs(high.y-object.y)>object.depth/2) return false
    return (['x','y'] as const).some(axis=>{
      const side = axis==='x' ? 'y' : 'x'
      const half = (axis==='x' ? object.width : object.depth)/2
      const halfSide = (axis==='x' ? object.depth : object.width)/2
      const sign = Math.sign(low[axis]-object[axis])
      const gap = Math.abs(low[axis]-object[axis])-half
      return gap>=radius-EPS && gap<=radius+reach+EPS && Math.abs(low[side]-object[side])<=halfSide-radius+EPS &&
        Math.abs(high[side]-low[side])<=EPS && half-(high[axis]-object[axis])*sign<=radius+reach+EPS
    })
  })
  if (!anchor) throw Error('Для подъёма или спуска нужны нижняя точка у грани опоры и верхняя точка над той же гранью. На объекте должен быть разрешён подъём.')
  return {anchor,via:{x:low.x,y:low.y,z:high.z}}
}
