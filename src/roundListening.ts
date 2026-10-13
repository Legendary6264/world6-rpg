import { copyDeclaredAction, listeningLabels } from './actionDeclarations'
import { newRuleKey } from './roundRules'
import type { DeclarationCollection, ListeningIntent } from './actionDeclarations'
import type { ExactAmount } from './exactWork'
import type { RoundWork } from './roundWork'

export type ListeningRow = ListeningIntent & {key:string;actorId:string}
export type ListeningWindow = ListeningRow & {sceneId:string;fromMs:ExactAmount;toMs:ExactAmount;completes:boolean}
export function listeningRows(collection:DeclarationCollection,work:RoundWork,continued:string[]):ListeningRow[] {
  return [...work.entries.filter(e=>continued.includes(e.actorId)).map(e=>({key:e.id,actorId:e.actorId,action:e.action})),
    ...collection.entries.filter(e=>e.status==='submitted').flatMap(e=>e.actions.map((action,index)=>({key:newRuleKey(e.actorId,index),actorId:e.actorId,action})))].flatMap(r=>{
      const a=copyDeclaredAction(r.action)
      return a.kind==='wait'&&a.listening?[{key:r.key,actorId:r.actorId,...a.listening}]:[]
    })
}
export function listeningFocusLabel(row:Pick<ListeningIntent,'target'>,objects:{id:string;name:string}[]):string {
  const t=row.target
  return 'point' in t?'Точка ('+t.point.x+'; '+t.point.y+'; '+t.point.z+') м':t.kind==='none'?'Окружение':t.kind==='self'?'На себя':
    t.kind==='contact'?'Выбранный контакт героя':'id' in t?objects.find(o=>o.id===t.id)?.name??'Прежний объект':'Прежняя отметка'
}
export const listeningPlanLabel=(row:ListeningRow)=>listeningLabels[row.mode]
