import EditorIcon from './EditorIcon'
import {editorObjectCount} from './sceneEditorClipboard'
import ScenePasteRowControl from './ScenePasteRowControl'
import type {AssemblyRow} from './sceneAssemblyRow'

type Props={objectCount:number;facing:number;elevation:number;repeat:boolean;count:number;canUndo:boolean;canRedo:boolean;row?:AssemblyRow;maxCopies:number;error:string;size?:{width:number;depth:number};onRow:(row:AssemblyRow|undefined)=>void;onRepeat:(value:boolean)=>void;onElevation:(value:number)=>void;onRotate:()=>void;onFinish:()=>void;onUndo:()=>void;onRedo:()=>void}

export default function ScenePasteControls({objectCount,facing,elevation,repeat,count,canUndo,canRedo,row,maxCopies,error,size,onRow,onRepeat,onElevation,onRotate,onFinish,onUndo,onRedo}:Props){
 return <section className="gb-clipboard-placement" aria-label="Вставка группы">
  <header><EditorIcon name="clipboard" size={18}/><div><small>ВСТАВКА ИЗ БУФЕРА</small><strong>{editorObjectCount(objectCount)} · {facing}°</strong></div></header>
  <p>{repeat?'Нажимай в разных местах сцены. Угол и высота сохранятся; каждую вставку можно отменить отдельно.':'Нажми на сцену, чтобы разместить группу.'}</p>
  <label>Высота над землёй, м<input type="number" step="any" aria-label="Высота вставки над землёй, м" value={Number.isFinite(elevation)?elevation:''} onChange={e=>onElevation(e.currentTarget.valueAsNumber)}/></label>
  <ScenePasteRowControl row={row} maxCopies={maxCopies} error={error} size={size} onChange={onRow}/>
  <label className="gb-paste-repeat"><input type="checkbox" aria-label="Повторять вставку" checked={repeat} onChange={e=>onRepeat(e.currentTarget.checked)}/>Повторять вставку</label>
  {(repeat||count>0||canRedo)&&<><p className="gb-paste-count" role="status">Вставок на сцене: {count}</p><div className="gb-paste-history"><button type="button" disabled={!canUndo} onClick={onUndo} title="Ctrl+Z">Отменить вставку</button><button type="button" disabled={!canRedo} onClick={onRedo} title="Ctrl+Shift+Z">Вернуть вставку</button></div></>}
  <div><button type="button" onClick={onRotate}>Повернуть <kbd>R</kbd></button><button type="button" onClick={onFinish}>{count>0?'Завершить вставку':'Отмена'}{' '}<kbd>Esc</kbd></button></div>
 </section>
}
