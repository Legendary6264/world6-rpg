/** Presentation presets only: choosing clothing never grants equipment or abilities. */
export const characterModels = [
  { id: 'vanguard', name: 'Страж', description: 'Воронёная сталь, ламеллярные наплечники, стёганый поддоспешник и меч в ножнах.' },
  { id: 'ranger', name: 'Следопыт', description: 'Зелёная накидка, кожаный жилет, высокий воротник и дорожное снаряжение.' },
  { id: 'arcanist', name: 'Арканист', description: 'Многослойная мантия, вышитая оплечная пелерина и посох с огранённым камнем.' },
  { id: 'wayfarer', name: 'Странник', description: 'Льняная рубаха, кожаная перевязь, дорожный плащ и наплечная сумка.' },
] as const
export type CharacterModelId = typeof characterModels[number]['id']
export const characterAnimations = [
  {id:'idle', name:'Дыхание', duration:4}, {id:'walk', name:'Шаг на месте', duration:1.2}, {id:'rest', name:'Без анимации', duration:0},
] as const
export type CharacterAnimation = typeof characterAnimations[number]['id']
export const characterAnimationDuration = (animation:CharacterAnimation) => characterAnimations.find(a=>a.id===animation)!.duration
export const isCharacterAnimation = (value:unknown):value is CharacterAnimation => characterAnimations.some(a=>a.id===value)
export function isCharacterModel(value: unknown): value is CharacterModelId {
  return characterModels.some(model => model.id === value)
}
export function characterModelFor(id: string, explicit?: string): CharacterModelId {
  if (isCharacterModel(explicit)) return explicit
  // Old saves need no migration. Contact identifiers never reveal a hidden actor ID.
  let hash = 2166136261
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  return characterModels[(hash >>> 0) % characterModels.length].id
}
