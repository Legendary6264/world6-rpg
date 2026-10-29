import type {Scene,SceneState} from './sceneTypes'
import type {EditorItem,EditorSelection} from './sceneEditorCommands'
import type {EditorClipboard} from './sceneEditorClipboard'
import type {AssemblyRow} from './sceneAssemblyRow'

export type EditorPasteSession={scope?:string;sceneId:string;clipboard:EditorClipboard;originalItems:EditorItem[];primary:EditorSelection;repeat:boolean;facing:number;elevation:number;row?:AssemblyRow;batches:EditorItem[][]}

// A repeated paste owns only its completed groups. Undo may remove them and
// redo may restore them; the session must never consume older editor history.
export function visiblePasteBatches(scene:Pick<Scene,'objects'>|undefined,batches:readonly EditorItem[][]){
 const ids=new Set(scene?.objects.map(o=>o.id))
 return batches.filter(items=>items.length>0&&items.every(i=>i.kind==='object'&&ids.has(i.id)))
}
export function pasteHistoryAvailable(session:EditorPasteSession|null,current:SceneState,next:SceneState|undefined,redo=false){
 if(!session||!next||current.activeSceneId!==session.sceneId||next.activeSceneId!==session.sceneId)return false
 const count=(state:SceneState)=>visiblePasteBatches(state.scenes.find(s=>s.id===session.sceneId),session.batches).length
 return redo?count(next)>count(current):count(next)<count(current)
}
export function finishPasteSelection(session:EditorPasteSession,scene:Scene){
 if(scene.id!==session.sceneId)return {items:[],primary:null,count:0}
 const batches=visiblePasteBatches(scene,session.batches),last=batches.at(-1)
 if(last)return {items:last,primary:last.at(-1)!,count:batches.length}
 const known=new Set([...scene.objects.map(o=>'object:'+o.id),...scene.tokens.map(t=>'token:'+t.actorId)])
 const items=session.originalItems.filter(i=>known.has(i.kind+':'+i.id))
 return {items,primary:items.find(i=>i.kind===session.primary?.kind&&i.id===session.primary.id)??items.at(-1)??null,count:0}
}
