import type {Scene} from './sceneTypes'
import {MAX_SCENES} from './scenes'
import {sceneCopyName} from './sceneEditorSceneCopy'
import {editorObjectCount} from './sceneEditorClipboard'

type Props={scene:Scene;scenes:readonly Scene[];disabled:boolean;onCopy:(name:string)=>void}
export default function SceneCopyControl({scene,scenes,disabled,onCopy}:Props){
 const full=scenes.length>=MAX_SCENES
 return <section className="gb-scene-copy" aria-label="Копия сцены">
  <h4>Копия сцены</h4>
  <p>«{scene.name}» · {editorObjectCount(scene.objects.length)}. Расстановка, фон и параметры сохранятся. Герои останутся в исходных сценах.</p>
  <form aria-label="Копирование сцены" onSubmit={e=>{e.preventDefault();onCopy(String(new FormData(e.currentTarget).get('sceneCopyName')??''))}}>
   <fieldset disabled={disabled||full}>
    <label className="w6-field"><span>Название копии</span><input name="sceneCopyName" required maxLength={120} defaultValue={sceneCopyName(scene,scenes)}/></label>
    <button className="w6-button" type="submit">Создать копию сцены</button>
   </fieldset>
  </form>
  <p>{full?'Достигнут предел: 20 сцен в кампании.':'Копируются все объекты. Временное скрытие и защита редактора не переносятся.'}</p>
 </section>
}
