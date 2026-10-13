export type RollGroup = { targetId: string; values: number[] }
export type ReplaySelection = { key: string; mode: 'new' | 'preserve'; sourceKey?: string; groups?: RollGroup[] }
export type RoundReplay = { sourceReceiptId: string; selections: ReplaySelection[] }
export type ReplayOption = { key: string; actorId: string; abilityId: string; label: string; signature: string; canPreserve: boolean }
export type EditedReplayOptions = { revision: number; generation: number; receiptId: string; actions: ReplayOption[] } | null
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export function releaseSignature(actorId:string,sceneId:string,abilityId:string,target:unknown):string {
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):record(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
  return JSON.stringify(canonical([actorId,sceneId,abilityId,target]))
}
const key = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,400}$/.test(v)
export function isRoundReplay(v: unknown): v is RoundReplay {
  return record(v) && Object.keys(v).every(k => ['sourceReceiptId', 'selections'].includes(k)) && key(v.sourceReceiptId) &&
    Array.isArray(v.selections) && v.selections.length <= 200 && new Set(v.selections.map(s => record(s) ? s.key : null)).size === v.selections.length &&
    v.selections.every(s => record(s) && Object.keys(s).every(k => ['key', 'mode', 'sourceKey', 'groups'].includes(k)) && key(s.key) &&
      (s.mode === 'new' ? s.sourceKey === undefined && s.groups === undefined : s.mode === 'preserve' && key(s.sourceKey) &&
        Array.isArray(s.groups) && s.groups.length <= 200 && new Set(s.groups.map(g => record(g) ? g.targetId : null)).size === s.groups.length &&
        s.groups.every(g => record(g) && Object.keys(g).every(k => ['targetId', 'values'].includes(k)) && key(g.targetId) &&
          Array.isArray(g.values) && g.values.length === 2 && g.values.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1)))) &&
    new Set(v.selections.filter(s => s.mode === 'preserve').map(s => s.sourceKey)).size === v.selections.filter(s => s.mode === 'preserve').length
}
