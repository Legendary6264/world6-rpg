import { isDetailedAnatomy, copyDetailedAnatomy, anatomicalConsequences } from './anatomyModel'
import type { AnatomyStructure, DetailedAnatomy } from './anatomyModel'
import { isTimestamp } from './characterKnowledge'

export const bodyRegions = [
  { key: 'head', label: 'Голова', group: 'head' },
  { key: 'torso', label: 'Туловище', group: 'torso' },
  { key: 'leftArm', label: 'Левая рука', group: 'leftHand' },
  { key: 'rightArm', label: 'Правая рука', group: 'rightHand' },
  { key: 'leftHand', label: 'Левая кисть', group: 'leftHand' },
  { key: 'rightHand', label: 'Правая кисть', group: 'rightHand' },
  { key: 'leftLeg', label: 'Левая нога', group: 'leftLeg' },
  { key: 'rightLeg', label: 'Правая нога', group: 'rightLeg' },
  { key: 'leftFoot', label: 'Левая стопа', group: 'leftLeg' },
  { key: 'rightFoot', label: 'Правая стопа', group: 'rightLeg' },
] as const
export type BodyRegion = string
export type BodyInjury = { id: string; label: string; blocksUse: boolean; slowdown: number }
export type BodyPart = {
  label?: string; group?: string; vital?: boolean
  injuries?: BodyInjury[]; bleedingMlPerSecond?: number; internalBleeding?: boolean
  current: number; maximum: number; present: boolean
  bleeding: number; wound: string
  // Потеря скорости в процентах: задаётся правилами конкретной кампании.
  damagedSlowdown: number; disabledSlowdown: number
}
export type BodyLog = { id: string; at: string; gameTime: string; text: string }
export type BodyState = {
  anatomy?: DetailedAnatomy
  parts: Record<BodyRegion, BodyPart>
  consciousness: 'awake' | 'unconscious'
  history: BodyLog[]
}
export type BodyAction =
  | { type: 'damage'; region: BodyRegion; localDamage: number; systemicDamage: number; bleeding: number; wound: string }
  | { type: 'heal'; region: BodyRegion; amount: number; stopBleeding: boolean }
  | { type: 'step' }
  | { type: 'consciousness'; value: BodyState['consciousness'] }
export type BodyResult = { ok: true; body: BodyState; health: { current: string; maximum: string }; message: string } | { ok: false; message: string }
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export function isBodyPart(v: unknown): v is BodyPart {
  return record(v) && (v.label === undefined || typeof v.label === 'string' && v.label.length <= 120) &&
    (v.group === undefined || ['head','torso','leftHand','rightHand','leftLeg','rightLeg','other'].includes(String(v.group))) &&
    (v.vital === undefined || typeof v.vital === 'boolean') && (v.internalBleeding === undefined || typeof v.internalBleeding === 'boolean') &&
    (v.bleedingMlPerSecond === undefined || typeof v.bleedingMlPerSecond === 'number' && Number.isFinite(v.bleedingMlPerSecond) && v.bleedingMlPerSecond >= 0 && v.bleedingMlPerSecond <= 1e9) &&
    (v.injuries === undefined || Array.isArray(v.injuries) && v.injuries.length <= 100 && v.injuries.every(i => record(i) && typeof i.id === 'string' && /^[a-zA-Z0-9:_-]+$/.test(i.id) && typeof i.label === 'string' && i.label.length > 0 && i.label.length <= 120 && typeof i.blocksUse === 'boolean' && typeof i.slowdown === 'number' && Number.isFinite(i.slowdown) && i.slowdown >= 0 && i.slowdown <= 100) && new Set(v.injuries.map(i=>i.id)).size === v.injuries.length) && integer(v.current) && integer(v.maximum) && v.current <= v.maximum &&
    typeof v.present === 'boolean' && integer(v.bleeding) && typeof v.wound === 'string' && v.wound.length <= 2000 &&
    integer(v.damagedSlowdown) && v.damagedSlowdown <= 100 && integer(v.disabledSlowdown) &&
    v.disabledSlowdown <= 100 && (!v.present ? v.current === 0 && v.bleeding === 0 && !v.bleedingMlPerSecond : true)
}
export function isBodyState(v: unknown): v is BodyState {
  if (!record(v) || !record(v.parts) || (v.anatomy !== undefined && !isDetailedAnatomy(v.anatomy, Object.keys(v.parts))) || !['awake', 'unconscious'].includes(String(v.consciousness)) ||
      !Array.isArray(v.history) || v.history.length > 200) return false
  return Object.keys(v.parts).length > 0 && Object.keys(v.parts).length <= 64 && Object.entries(v.parts).every(([k,p]) => !['__proto__','constructor','prototype'].includes(k) && /^[a-zA-Z0-9:_-]+$/.test(k) && k.length <= 160 && isBodyPart(p)) &&
    v.history.every(e => record(e) && typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 160 &&
      isTimestamp(e.at) && typeof e.gameTime === 'string' && e.gameTime.length <= 120 &&
      typeof e.text === 'string' && e.text.length > 0 && e.text.length <= 4000) &&
    new Set(v.history.map(e => e.id)).size === v.history.length
}
export function emptyBody(): BodyState {
  // Максимумы не назначаются автоматически: 0 / 0 означает «не настроено».
  return { parts: Object.fromEntries(bodyRegions.map(r => [r.key, {
    current: 0, maximum: 0, present: true, bleeding: 0, wound: '', damagedSlowdown: 0, disabledSlowdown: 0,
  }])) as BodyState['parts'], consciousness: 'awake', history: [] }
}
export function cloneBody(body?: BodyState): BodyState {
  const v = body ?? emptyBody()
  return { parts: Object.fromEntries(Object.keys(v.parts).map(key => {
    const p = v.parts[key]
    return [key, { ...(p.label !== undefined ? {label:p.label}:{}), ...(p.group !== undefined ? {group:p.group}:{}), ...(p.vital !== undefined ? {vital:p.vital}:{}), ...(p.injuries ? {injuries:p.injuries.map(i=>({id:i.id,label:i.label,blocksUse:i.blocksUse,slowdown:i.slowdown}))}:{}), ...(p.bleedingMlPerSecond !== undefined ? {bleedingMlPerSecond:p.bleedingMlPerSecond}:{}), ...(p.internalBleeding !== undefined ? {internalBleeding:p.internalBleeding}:{}), current: p.current, maximum: p.maximum, present: p.present, bleeding: p.bleeding, wound: p.wound, damagedSlowdown: p.damagedSlowdown, disabledSlowdown: p.disabledSlowdown }]
  })) as BodyState['parts'],
    ...(v.anatomy ? {anatomy:copyDetailedAnatomy(v.anatomy)} : {}), consciousness: v.consciousness, history: v.history.map(e => ({ id: e.id, at: e.at, gameTime: e.gameTime, text: e.text })) }
}
export function bodyRegionDefs(body: BodyState) {
  return Object.entries(body.parts).map(([key,p])=>({key,label:p.label || bodyRegions.find(r=>r.key===key)?.label || key,group:body.anatomy?.form==='bird'&&/^(left|right)(Arm|Hand)$/.test(key)?'other':p.group || bodyRegions.find(r=>r.key===key)?.group || 'other'}))
}
export function partCondition(p: BodyPart): 'absent' | 'unset' | 'healthy' | 'damaged' | 'disabled' {
  return !p.present ? 'absent' : p.maximum === 0 ? 'unset' : p.current === 0 ? 'disabled' : p.current < p.maximum ? 'damaged' : 'healthy'
}
export const conditionLabels = { absent: 'Отсутствует', unset: 'Не настроено', healthy: 'Цела', damaged: 'Повреждена', disabled: 'Не действует' }
const structureUsable=(s:AnatomyStructure,body:BodyState)=>!!body.parts[s.region]?.present&&!s.injuries.some(i=>i.blocksUse)&&s.current>0
export function bodyConsequences(body: BodyState) {
  const regions = bodyRegionDefs(body)
  const detailed = anatomicalConsequences(body.anatomy)
  const disabled = (group: string) => detailed.blocked.has(group) || !regions.some(r=>r.group===group && body.parts[r.key].present) || regions.some(r => r.group === group && (['absent', 'disabled'].includes(partCondition(body.parts[r.key])) || body.parts[r.key].injuries?.some(i=>i.blocksUse)))
  const awake = body.consciousness === 'awake'
  const leftHand = awake && !disabled('leftHand'), rightHand = awake && !disabled('rightHand')
  const leftLeg = !disabled('leftLeg'), rightLeg = !disabled('rightLeg')
  // Для ноги и стопы одной стороны берётся больший штраф, а не двойной.
  const sideLoss = (group: string) => Math.max(detailed.blocked.has(group)?100:detailed.slowdown[group]??0, ...regions.filter(r => r.group === group).map(r => {
    const p = body.parts[r.key], state = partCondition(p)
    return Math.max(0,...(p.injuries??[]).map(i=>i.slowdown),state === 'damaged' ? p.damagedSlowdown : ['absent', 'disabled'].includes(state) ? p.disabledSlowdown : 0)
  }))
  const movementFactor = awake && (leftLeg || rightLeg) ? Math.max(0, 1 - (sideLoss('leftLeg') + sideLoss('rightLeg')) / 100) : 0
  const canSprint = awake && leftLeg && rightLeg && movementFactor > 0
  const bird=body.anatomy?.form==='bird'
  const wingParts=bird?['leftArm','leftHand','rightArm','rightHand']:['leftWing','rightWing']
  const flightStructures=body.anatomy?.structures.filter(s=>['flight','leftWing','rightWing'].includes(s.functionGroup))??[]
  const hasWings=wingParts.every(k=>!!body.parts[k])&&flightStructures.length>0
  const wingReady=(side:string)=>!detailed.blocked.has(side+'Wing')&&(bird?[side+'Arm',side+'Hand']:[side+'Wing']).every(k=>body.parts[k]?.present&&body.parts[k].maximum>0&&body.parts[k].current>0&&!(body.parts[k].injuries??[]).some(i=>i.blocksUse))
  const structuralCapacity=Math.min(1,...flightStructures.map(s=>structureUsable(s,body)?s.current/s.maximum:0),...wingParts.map(k=>body.parts[k]?.maximum?body.parts[k].current/body.parts[k].maximum:0))
  const canFly=awake&&hasWings&&wingReady('left')&&wingReady('right')&&!detailed.blocked.has('flight')&&structuralCapacity>.25
  const flightFactor=canFly?structuralCapacity:0
  const flightReasons:string[]=[]
  if(!hasWings)flightReasons.push('Нет полного работающего лётного аппарата.')
  else{if(!awake)flightReasons.push('Для полёта нужно сознание.');if(!wingReady('left'))flightReasons.push('Левое крыло не действует.');if(!wingReady('right'))flightReasons.push('Правое крыло не действует.');if(detailed.blocked.has('flight'))flightReasons.push('Нарушена функция, необходимая для полёта.');if(structuralCapacity<=.25)flightReasons.push('Крылья не обеспечивают достаточную опору для полёта.')}
  const notices: string[] = [...detailed.notices]
  if(flightStructures.length&&!canFly)notices.push('Крылья: полёт недоступен из-за повреждения или состояния сознания.')
  if (!awake) notices.push('Без сознания: активные действия недоступны.')
  if (!leftHand) notices.push('Левая рука: нельзя использовать предметы этой рукой.')
  if (!rightHand) notices.push('Правая рука: нельзя использовать предметы этой рукой.')
  if (!leftHand || !rightHand) notices.push('Действия, требующие двух рук, недоступны.')
  if (!leftLeg || !rightLeg) notices.push('Спринт недоступен из-за состояния ног.')
  if (!leftLeg && !rightLeg) notices.push('Ходьба недоступна; ползание и помощь учитываются отдельно.')
  if (movementFactor < 1) notices.push('Скорость ходьбы снижена на ' + Math.round((1 - movementFactor) * 100) + '%.')
  for (const r of regions) if ((body.parts[r.key].vital || ['head','torso'].includes(r.key)) && partCondition(body.parts[r.key]) === 'disabled') notices.push(r.label + ': критическое повреждение; сознание и летальность определяет мастер.')
  const bleeding = regions.reduce((sum, r) => Math.min(Number.MAX_SAFE_INTEGER, sum + body.parts[r.key].bleeding), 0)
  return { leftHand, rightHand, twoHands: leftHand && rightHand, canSprint, canFly, flightFactor, flightReasons, hasWings, movementFactor, notices, bleeding }
}
export function effectiveBodySpeed(body: BodyState, speed: string, sprint = false): string {
  if (!speed.trim()) return ''
  const n = Number(speed.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return speed
  const c = bodyConsequences(body)
  return String(sprint ? (c.canSprint ? n * c.movementFactor : 0) : n * c.movementFactor)
}
export function applyBodyAction(body: BodyState, health: { current: string; maximum: string }, action: BodyAction,
  event: { id: string; at: string; gameTime: string }): BodyResult {
  if (!isBodyState(body) || !Number.isFinite(Number(health.current)) || Number(health.current)<0 || Number(health.current)>1e12 || !Number.isFinite(Number(health.maximum)) || Number(health.maximum)<0 || Number(health.maximum)>1e12 ||
      !health.current.trim() || !health.maximum.trim() || Number(health.current) > Number(health.maximum) ||
      !event.id.trim() || event.id.length > 160 || !isTimestamp(event.at) || event.gameTime.length > 120) {
    return { ok: false, message: 'Проверь тело, общее здоровье и время события.' }
  }
  if (body.history.some(e => e.id === event.id)) return { ok: false, message: 'Это действие уже учтено.' }
  const next = cloneBody(body), hp = { current:'0', maximum:'0' }
  let text: string
  if (action.type === 'damage' || action.type === 'heal') {
    if (!Object.hasOwn(body.parts, action.region)) return { ok: false, message: 'Неизвестная область тела.' }
    const p = next.parts[action.region], label = bodyRegionDefs(body).find(r => r.key === action.region)!.label
    if (!p.present || !p.maximum) return { ok: false, message: 'Область отсутствует или её максимум не задан в редакторе.' }
    if (action.type === 'damage') {
      if (!integer(action.localDamage) || !integer(action.systemicDamage) || !integer(action.bleeding) || action.wound.length > 2000 ||
          (action.localDamage === 0 && action.systemicDamage === 0 && action.bleeding === 0 && !action.wound.trim())) return { ok: false, message: 'Укажи неотрицательный урон и последствия; пустой удар не учитывается.' }
      const actual = Math.min(p.current, action.localDamage)
      p.current -= actual
      if(next.anatomy && (actual || action.systemicDamage || action.bleeding)) next.anatomy.harmRevision++
      p.bleedingMlPerSecond = Math.max(p.bleedingMlPerSecond??0, action.bleeding)
      if (action.wound.trim()) p.wound = [p.wound, action.wound.trim()].filter(Boolean).join('\n').slice(-2000)
      text = label + ': локальный урон ' + actual + '' + '. Кровотечение: ' + (p.bleedingMlPerSecond??0) + ' мл/с.'
      if (action.wound.trim()) text += ' Рана: ' + action.wound.trim()
    } else {
      if (!integer(action.amount) || typeof action.stopBleeding !== 'boolean' || (!action.amount && !action.stopBleeding)) return { ok: false, message: 'Укажи лечение или остановку кровотечения.' }
      const actual = Math.min(action.amount, p.maximum - p.current)
      p.current += actual
      if (action.stopBleeding) { p.bleeding = 0; p.bleedingMlPerSecond = 0;if(next.anatomy)for(const s of next.anatomy.structures)if(s.region===action.region)s.activeBleeding=0 }
      if (p.current === p.maximum && p.bleeding === 0 && !(p.injuries?.length)) p.wound = ''
      text = label + ': восстановлено ' + actual + '. ' + (action.stopBleeding ? 'Кровотечение остановлено.' : 'Кровотечение не менялось.')
    }
  } else if (action.type === 'step') {
    const rate = bodyConsequences(body).bleeding
    if (!rate) return { ok: false, message: 'Активного кровотечения нет.' }
    return {ok:false,message:'Кровотечение рассчитывается в игре по объёму крови и игровому времени.'}
  } else {
    if (!['awake', 'unconscious'].includes(action.value)) return { ok: false, message: 'Неизвестное состояние сознания.' }
    if (next.consciousness === action.value) return { ok: false, message: 'Состояние уже установлено.' }
    next.consciousness = action.value
    text = action.value === 'awake' ? 'Сознание восстановлено.' : 'Персонаж потерял сознание.'
  }
  next.history = [...next.history, { ...event, text }].slice(-200)
  return { ok: true, body: next, health: hp, message: text }
}
