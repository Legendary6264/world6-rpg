import type {AbilityVisualFamilyId} from './abilityVisuals'

export type AbilityVisualArchetype='flame'|'fluid'|'storm'|'vortex'|'mineral'|'frost'|'growth'|'renewal'|'radiance'|'shadow'|'sigil'|'resonance'
export type AbilityVisualStyle={archetype:AbilityVisualArchetype;flow:'rise'|'fall'|'orbit'|'burst'|'inward'|'coil';turns:number;ribbons:number;turbulence:number;spread:number;stretch:number;glow:number;variant:number}
const groups:Record<AbilityVisualArchetype,readonly string[]>={
  flame:['fire','embers','heatwave','forging'],fluid:['water','blood','poisons','rain','tide','mist','pulse'],storm:['electricity','magnetism'],
  vortex:['wind','gale','cyclone'],mineral:['earth','metal','decay','sand','beast','rockfall','dust','shield','blades'],frost:['frost','crystal','reflection','space'],
  growth:['vegetation','roots','thorns','blossom','vines'],renewal:['healing','soul','spirits'],radiance:['light','divination'],
  shadow:['shadows','fear','oblivion','hunger','void','dreams','necromancy','curses','fading','absorption'],
  sigil:['runes','illusion','copying','word','trueNames','contracts','bonds','limit'],resonance:['silence','resonance','echoes'],
}
const defaults:Record<AbilityVisualArchetype,Omit<AbilityVisualStyle,'archetype'|'variant'>>={
  flame:{flow:'rise',turns:1.6,ribbons:3,turbulence:.9,spread:.8,stretch:1.65,glow:1},
  fluid:{flow:'coil',turns:1.35,ribbons:3,turbulence:.35,spread:1,stretch:1.15,glow:.5},
  storm:{flow:'burst',turns:1.2,ribbons:4,turbulence:1,spread:.9,stretch:1,glow:1.2},
  vortex:{flow:'coil',turns:2.5,ribbons:4,turbulence:.25,spread:1.1,stretch:1.65,glow:.35},
  mineral:{flow:'burst',turns:.7,ribbons:2,turbulence:.65,spread:1,stretch:.9,glow:.12},
  frost:{flow:'burst',turns:1.2,ribbons:3,turbulence:.15,spread:.95,stretch:1.4,glow:.65},
  growth:{flow:'rise',turns:1.7,ribbons:3,turbulence:.3,spread:.8,stretch:1.45,glow:.2},
  renewal:{flow:'rise',turns:2.1,ribbons:3,turbulence:.12,spread:.8,stretch:1.5,glow:.8},
  radiance:{flow:'burst',turns:1,ribbons:4,turbulence:.08,spread:1,stretch:1,glow:1.2},
  shadow:{flow:'inward',turns:2.2,ribbons:4,turbulence:.55,spread:1.2,stretch:1.1,glow:.35},
  sigil:{flow:'orbit',turns:1.1,ribbons:3,turbulence:.12,spread:.9,stretch:1,glow:.75},
  resonance:{flow:'orbit',turns:2,ribbons:3,turbulence:.15,spread:1.15,stretch:.85,glow:.45},
}
const variants:Partial<Record<AbilityVisualFamilyId,Partial<AbilityVisualStyle>>>={
  embers:{flow:'burst',spread:1.3,stretch:.75},heatwave:{turbulence:.3,glow:.45,stretch:1.1},forging:{flow:'burst',ribbons:2,spread:1.15},
  rain:{flow:'fall',stretch:1.9,spread:1.2},tide:{turns:.65,spread:1.35,stretch:.75},mist:{flow:'orbit',turbulence:.65,glow:.2,spread:1.4,stretch:.65},
  poisons:{flow:'rise',turbulence:.8,glow:.25},blood:{turns:2.4,spread:.7,glow:.3},pulse:{flow:'burst',turns:.8,spread:.75},
  magnetism:{flow:'inward',turbulence:.35,turns:2.8,glow:.6},gale:{flow:'burst',turns:1.3,stretch:.65},cyclone:{turns:3.4,stretch:2.1,spread:1.25},
  metal:{flow:'orbit',spread:.8,stretch:1.3,glow:.3},blades:{flow:'burst',stretch:2.4,spread:1.2},shield:{flow:'orbit',spread:1.1,stretch:.6},
  decay:{flow:'fall',spread:.7,glow:.18},sand:{flow:'coil',turbulence:.75,spread:1.3},dust:{flow:'rise',turbulence:.9,spread:1.4},rockfall:{flow:'fall',stretch:1.15},
  crystal:{flow:'rise',stretch:1.8,glow:.75},space:{flow:'inward',stretch:2.2,spread:.65,glow:.9},reflection:{flow:'orbit',ribbons:2,stretch:1.2},
  roots:{flow:'burst',stretch:.45,spread:1.4},thorns:{flow:'orbit',turns:2.4},blossom:{flow:'burst',spread:1.2,stretch:.8},vines:{turns:3,stretch:1.8},
  soul:{flow:'rise',spread:.6,stretch:1.9},spirits:{flow:'orbit',spread:1.2,stretch:1.25},divination:{flow:'orbit',ribbons:2,glow:.8},
  fear:{flow:'burst',turbulence:.9},dreams:{flow:'orbit',turbulence:.18,spread:1.3,glow:.4},necromancy:{flow:'rise',stretch:1.6,glow:.25},
  curses:{flow:'coil',turbulence:.8,stretch:1.35},fading:{flow:'fall',glow:.15},oblivion:{flow:'inward',spread:.8,glow:.15},
  illusion:{ribbons:4,spread:1.15,turns:2.3},copying:{ribbons:2,spread:1.25},word:{flow:'rise',stretch:1.2},bonds:{ribbons:2,turns:2.6},
  trueNames:{ribbons:4,turns:.7},contracts:{ribbons:2,turns:.85},limit:{ribbons:4,turns:.5,stretch:.8},silence:{turbulence:0,glow:.18},echoes:{flow:'burst',turns:1.4},
}
export function abilityVisualStyle(id:AbilityVisualFamilyId|string):AbilityVisualStyle {
  const archetype=(Object.keys(groups) as AbilityVisualArchetype[]).find(key=>groups[key].includes(id))??'sigil'
  const index=groups[archetype].indexOf(id)
  return {archetype,...defaults[archetype],variant:Math.max(0,index),...(Object.hasOwn(variants,id)?variants[id as AbilityVisualFamilyId]:{})}
}

export const visualEaseOut=(p:number)=>1-(1-Math.max(0,Math.min(1,p)))**3
