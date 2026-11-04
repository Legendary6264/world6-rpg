import {useState} from 'react'
import AbilityVisualPicker from './AbilityVisualPicker'
import type {AbilityVisualShape,AbilityVisualSpec} from './abilityVisuals'
import './sceneStyle.css'
import './abilityVisuals.css'

export default function PreviewAbilities(){
  const [spec,setSpec]=useState<AbilityVisualSpec|undefined>({familyId:'fire',scale:1.3,intensity:1.2,durationMs:2600}),[shape,setShape]=useState<AbilityVisualShape>('point')
  return <main className="w6-vfx-gallery"><header><p className="w6-vfx-gallery-eyebrow">Грани Бытия · визуальная мастерская</p><h1>Способности в движении</h1><p>60 направлений магии. Выбери оформление, посмотри полёт и попадание, сравни масштаб с персонажами.</p></header>
    <div className="w6-vfx-gallery-shapes" aria-label="Форма пробы">{([['point','Снаряд'],['sphere','Сфера'],['beam','Луч'],['cone','Конус']] as const).map(([id,label])=><button className="w6-button" key={id} type="button" aria-pressed={shape===id} onClick={()=>setShape(id)}>{label}</button>)}</div>
    <AbilityVisualPicker value={spec} onChange={setSpec} schoolId="fire" shape={shape} previewMode="3d"/>
    <footer>Свободная проба оформления. Эти настройки не записываются в героев, кампании и утверждённые способности.</footer>
  </main>
}
