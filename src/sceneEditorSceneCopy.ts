import type {Scene,SceneState} from './sceneTypes'
import {copySceneState,isSceneState,MAX_SCENES} from './scenes'

export function sceneCopyName(source:Pick<Scene,'name'>,scenes:readonly Pick<Scene,'name'>[]):string{
 const names=new Set(scenes.map(s=>s.name))
 for(let index=1;;index++){
  const suffix=' · копия'+(index===1?'':' '+index)
  const name=source.name.slice(0,120-suffix.length).trimEnd()+suffix
  if(!names.has(name))return name
 }
}

// A scene copy is scenery only. Actor positions and their support references
// remain in the original scenes; disclosure and campaign state live elsewhere.
export function copyEditorScene(state:SceneState,sourceId:string,name:string,id:()=>string):SceneState{
 const sourceIndex=state.scenes.findIndex(s=>s.id===sourceId)
 if(sourceIndex<0)throw Error('Сцена больше не существует.')
 if(state.scenes.length>=MAX_SCENES)throw Error('Максимум 20 сцен в кампании.')
 const trimmed=name.trim()
 if(!trimmed||trimmed.length>120)throw Error('Название копии должно содержать от 1 до 120 символов.')
 if(!isSceneState(state))throw Error('Проверь размеры, высоты и опоры исходных сцен.')
 const reserved=new Set(state.scenes.flatMap(s=>[s.id,...s.objects.map(o=>o.id),...s.tokens.map(t=>t.actorId)]))
 function freshId(){
  const next=id()
  if(typeof next!=='string'||!/^[a-zA-Z0-9:_-]{1,160}$/.test(next)||reserved.has(next))throw Error('Не удалось создать уникальные идентификаторы копии. Повтори копирование.')
  reserved.add(next);return next
 }
 const next=copySceneState(state),source=next.scenes[sourceIndex]
 const copy:Scene={...source,id:freshId(),name:trimmed,objects:source.objects.map(o=>({...o,id:freshId()})),tokens:[]}
 next.scenes.splice(sourceIndex+1,0,copy);next.activeSceneId=copy.id
 if(!isSceneState(next))throw Error('Проверь параметры копии сцены.')
 return next
}
