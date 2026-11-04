import {useState} from 'react'
import AbilityVisualPicker from './AbilityVisualPicker'
import type {AbilityVisualShape,AbilityVisualSpec} from './abilityVisuals'
import type {AbilitySpatial} from './rpgTypes'
import './sceneStyle.css'
import './abilityVisuals.css'

export default function PreviewAbilities(){
  const [spec,setSpec]=useState<AbilityVisualSpec|undefined>({familyId:'fire',scale:1.3,intensity:1.2,durationMs:2600}),[shape,setShape]=useState<AbilityVisualShape>('point')
  const [radius,setRadius]=useState(2.5),[length,setLength]=useState(7),[angle,setAngle]=useState(42),[includeCaster,setIncludeCaster]=useState(false)
  const spatial:AbilitySpatial=shape==='point'?{shape,includeCaster}:shape==='sphere'?{shape,includeCaster,radiusM:radius}:shape==='beam'?{shape,includeCaster,radiusM:radius,lengthM:length}:{shape,includeCaster,lengthM:length,angleDeg:angle}
  return <main className="w6-vfx-gallery"><header><p className="w6-vfx-gallery-eyebrow">Грани Бытия · визуальная мастерская</p><h1>Способности в движении</h1><p>60 направлений магии. Выбери оформление, посмотри полёт и попадание, сравни масштаб с персонажами.</p></header>
    <div className="w6-vfx-gallery-shapes" aria-label="Форма пробы">{([['point','Снаряд'],['sphere','Сфера'],['beam','Луч'],['cone','Конус']] as const).map(([id,label])=><button className="w6-button" key={id} type="button" aria-pressed={shape===id} onClick={()=>setShape(id)}>{label}</button>)}</div>
    <fieldset className="w6-vfx-gallery-geometry"><legend>Размеры пробной области</legend>
      {(shape==='sphere'||shape==='beam')&&<label>Радиус <output>{radius} м</output><input aria-label="Радиус пробной области" type="range" min=".25" max="10" step=".25" value={radius} onChange={e=>setRadius(Number(e.currentTarget.value))}/></label>}
      {(shape==='beam'||shape==='cone')&&<label>Длина <output>{length} м</output><input aria-label="Длина пробной области" type="range" min="1" max="15" step=".5" value={length} onChange={e=>setLength(Number(e.currentTarget.value))}/></label>}
      {shape==='cone'&&<label>Полный угол <output>{angle}°</output><input aria-label="Угол пробного конуса" type="range" min="10" max="150" step="1" value={angle} onChange={e=>setAngle(Number(e.currentTarget.value))}/></label>}
      <label className="w6-vfx-loop"><input type="checkbox" checked={includeCaster} onChange={e=>setIncludeCaster(e.currentTarget.checked)}/>Область может затронуть источник</label>
    </fieldset>
    <AbilityVisualPicker value={spec} onChange={setSpec} schoolId="fire" spatial={spatial} previewMode="3d"/>
    <footer>Свободная проба оформления. Эти настройки не записываются в героев, кампании и утверждённые способности.</footer>
  </main>
}
