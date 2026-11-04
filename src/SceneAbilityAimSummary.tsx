import {spatialLabel} from './abilitySpatial'
import {aimSpatial} from './sceneAimTargets'
import type {AimTarget} from './sceneAimTargets'
import type {SceneAbilityAim} from './sceneAbilityAim'

export default function SceneAbilityAimSummary({aim,targets}:{aim:SceneAbilityAim;targets:AimTarget[]}){
 const contacts=targets.filter(t=>t.kind==='contact').length,objects=targets.length-contacts
 return <section className="gb-aim-summary" aria-label="Параметры прицеливания">
  <p className="gb-aim-readout" role="status" data-valid={aim.valid}>{aim.name} · {aim.distanceM.toFixed(2)} м{aim.rangeM!==undefined?' / '+aim.rangeM+' м':''} · {aim.message}</p>
  <p className="gb-aim-dimensions">{spatialLabel(aimSpatial(aim))}{aim.rangeM!==undefined&&aim.valid&&<> · запас дальности {Math.max(0,aim.rangeM-aim.distanceM).toFixed(2)} м</>}</p>
  {aim.valid&&<><div className="gb-aim-counts"><span>Существа <strong>{contacts}</strong></span><span>Предметы <strong>{objects}</strong></span>{targets.some(t=>t.isCaster)&&<span className="gb-aim-caster">Источник внутри области</span>}</div>
   <details className="gb-aim-contents"><summary>Отметки внутри контура: {targets.length}</summary><p>Центры видимых предметов и раскрытые отметки существ. Попадание, укрытие и последствия подтверждает мастер.</p>{!!targets.length&&<ul>{targets.map(t=><li key={t.kind+':'+t.id} data-kind={t.kind}>{t.label}{t.isCaster?' · источник':t.kind==='object'?' · центр предмета':''}</li>)}</ul>}</details></>}
 </section>
}
