import {knownAimTargets} from './sceneAimTargets'
import {useEffect,useMemo,useRef} from 'react'
import {buildSceneAbilityAim} from './sceneAbilityAim'
import type {SceneAbilityAim} from './sceneAbilityAim'
import {objectRelocatable} from './legacyObjectBehavior'
import {objectActions} from './tabletopInteractions'
import { quickAbilityTarget } from './gameControls'
import type { QuickActionDraft } from './gameControls'
import type { DeclaredAction, DeclarationOptions, DeclarationTarget } from './actionDeclarations'
import type { PerceivedMap } from './scenePerception'
import type { ScenePosition } from './sceneTypes'

export default function GameActionBar({ map, point, contactId, objectId, options, disabled, onAdd, draft, onChange,onAimChange,resolveAim,environmentOnly=false }: {
  onAimChange?:(aim:SceneAbilityAim|null)=>void;resolveAim?:(aim:SceneAbilityAim)=>SceneAbilityAim;environmentOnly?:boolean;
  map: PerceivedMap | null; point: ScenePosition | null; contactId: string; objectId: string;
  options: DeclarationOptions | null; disabled: boolean; onAdd: (action: DeclaredAction) => boolean; draft: QuickActionDraft; onChange: (draft: QuickActionDraft) => void;
}) {
  const {mode,movement,text,volume,item,ability,aim}=draft
  const field=<K extends keyof QuickActionDraft>(key:K,value:QuickActionDraft[K])=>onChange({...draft,[key]:value})
  const object=map?.objects.find(o=>o.id===objectId),contact=map?.contacts.find(c=>c.id===contactId&&c.kind!=='self')
  const knownObject=options?.targets.some(t=>t.kind==='object'&&t.id===objectId),knownContact=options?.targets.some(t=>t.kind==='contact'&&t.id===contactId)
  const ownContact=map?.contacts.find(c=>c.kind==='self'&&c.id===contactId),selectedContact=contact??ownContact
  const selected:DeclarationTarget|null=knownObject?{kind:'object',id:objectId}:knownContact?{kind:'contact',id:contactId}:ownContact?{kind:'self'}:null
  const selectedPoint:ScenePosition|null=knownObject&&object?{x:object.x,y:object.y,z:object.z+object.height/2}:selectedContact?.z!==undefined&&selectedContact?.kind!=='sound'&&(knownContact||ownContact)?{x:selectedContact.x,y:selectedContact.y,z:selectedContact.z}:null
  const selectedLabel=knownObject?object?.name:selectedContact?.label
  const selectedAbility=options?.abilities.find(a=>a.id===ability)
  const releaseTarget=quickAbilityTarget(selectedAbility?.spatial,aim,point,selected,selectedPoint)
  const aimPreview=useMemo(()=>{const aim=mode==='ability'?buildSceneAbilityAim(map,selectedAbility,releaseTarget):null;return aim&&resolveAim?resolveAim(aim):aim},[mode,map,selectedAbility,JSON.stringify(releaseTarget),resolveAim])
  const contents=useMemo(()=>map?knownAimTargets(map,aimPreview):[],[map,aimPreview])
  const selectionStamp=objectId+'|'+contactId,previousTarget=useRef({selection:selectionStamp,point})
  useEffect(()=>{const before=previousTarget.current;previousTarget.current={selection:selectionStamp,point};if(mode!=='ability'||!selectedAbility)return;if(before.selection!==selectionStamp&&selected&&(selectedAbility.spatial?selectedPoint:selected.kind==='contact'||selected.kind==='self')){if(aim!=='selected')onChange({...draft,aim:'selected'})}else if(before.point!==point&&selectedAbility.spatial){if(aim!=='point')onChange({...draft,aim:'point'})}},[selectionStamp,point,mode,selectedAbility])
  useEffect(()=>{onAimChange?.(aimPreview);return ()=>onAimChange?.(null)},[aimPreview,onAimChange])
  return <section className="gb-game-actionbar" aria-label="Быстрые игровые действия">
    <div className="gb-game-modes">{([['world','Мир'],['speak','Речь'],['item','Предметы'],['ability','Способности']] as const).filter(([id])=>!environmentOnly||id==='world'||id==='ability').map(([id,label])=><button key={id} className="w6-button" type="button" aria-pressed={mode===id} onClick={()=>field('mode',id)}>{label}</button>)}</div>
    <fieldset disabled={disabled}>
      {mode==='world'&&<><p className="gb-game-context">{object?<><strong>{object.name}</strong> · {object.visible?'объект перед тобой':'последнее известное состояние'}{object.kind==='door'&&(object.open?' · открыта':' · закрыта')}</>:contact?<><strong>{contact.label}</strong>{contact.signs&&' · '+contact.signs}</>:point?<>Точка назначения: {point.x}; {point.y}; {point.z} м</>:'Нажми на землю, предмет или существо на карте.'}</p>
        <div className="w6-buttons">{!environmentOnly&&<><select aria-label="Быстрый способ движения" value={movement} onChange={e=>field('movement',e.currentTarget.value as typeof movement)}><option value="ground">Ходьба</option><option value="air">Полёт</option></select><button type="button" className="w6-button w6-primary" disabled={!point} onClick={()=>{if(point)onAdd({kind:'move',route:[point],support:movement,note:''})}}>Идти к отметке</button></>}
          <button type="button" className="w6-button" disabled={!knownObject&&!knownContact} onClick={()=>onAdd({kind:'interact',target:knownObject?{kind:'object',id:objectId}:{kind:'contact',id:contactId},operation:'inspect',note:''})}>Осмотреть выбранное</button>
          {object&&objectActions(object).map(action=><button type="button" className="w6-button" key={action.operation} disabled={!knownObject||action.disabled} onClick={()=>onAdd({kind:'interact',target:{kind:'object',id:object.id},operation:action.operation,note:''})}>{action.label}{object.kind==='door'&&(action.operation==='open'||action.operation==='close')?' дверь':''}</button>)}
          {object&&objectRelocatable(object)&&<button type="button" className="w6-button" disabled={!knownObject||!point} onClick={()=>{if(point)onAdd({kind:'interact',target:{kind:'object',id:object.id},operation:'relocate',destination:point,note:''})}}>Передвинуть к отметке</button>}
          {!environmentOnly&&<><button type="button" className="w6-button" onClick={()=>onAdd({kind:'wait',seconds:1,note:''})}>Ждать 1 с</button>
          <button type="button" className="w6-button" onClick={()=>onAdd({kind:'wait',seconds:1,listening:{mode:'listen',target:{kind:'none'}},note:''})}>Прислушаться 1 с</button></>}
        </div></>}
      {mode==='speak'&&<><label className="w6-field"><span>Реплика героя</span><textarea aria-label="Быстрая реплика героя" rows={2} maxLength={4000} value={text} onChange={e=>field('text',e.currentTarget.value)}/></label>
        <div className="w6-buttons"><select aria-label="Громкость быстрой реплики" value={volume} onChange={e=>field('volume',e.currentTarget.value as typeof volume)}><option value="whisper">Шёпот</option><option value="normal">Обычный голос</option><option value="shout">Крик</option></select><button className="w6-button" disabled={!text.trim()} onClick={()=>{onAdd({kind:'speak',text,volume,target:{kind:'none'},note:''})}}>Добавить реплику в ход</button></div></>}
      {mode==='item'&&<><label className="w6-field"><span>Предмет из инвентаря</span><select aria-label="Быстрый предмет" value={item} onChange={e=>field('item',e.currentTarget.value)}><option value="">Выбери предмет</option>{options?.items.map(i=><option key={i.id} value={i.id}>{i.name} × {i.quantity}</option>)}</select></label><div className="w6-buttons">{([['equip','Снарядить'],['unequip','Снять'],['activate','Активировать'],['consume','Использовать одну дозу']] as const).map(([operation,label])=><button key={operation} className="w6-button" disabled={!options?.items.some(i=>i.id===item)} onClick={()=>onAdd({kind:'item',itemId:item,quantity:1,operation,target:{kind:'self'},note:''})}>{label}</button>)}</div></>}
      {mode==='ability'&&<><label className="w6-field"><span>{environmentOnly?'Эффект для пробы':'Утверждённая способность'}</span><select aria-label="Быстрая способность" value={ability} onChange={e=>onChange({...draft,ability:e.currentTarget.value,aim:options?.abilities.find(a=>a.id===e.currentTarget.value)?.spatial?(selectedPoint?'selected':'point'):(selected?.kind==='contact'||selected?.kind==='self'?'selected':'self')})}><option value="">Выбери способность</option>{options?.abilities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="w6-field"><span>Цель применения</span><select aria-label="Цель быстрой способности" value={aim} onChange={e=>field('aim',e.currentTarget.value as typeof aim)}><option value="self" disabled={!!selectedAbility?.spatial}>На себя</option><option value="point" disabled={!selectedAbility?.spatial||!point}>Отмеченная точка</option><option value="selected" disabled={selectedAbility?.spatial?!selectedPoint:!(selected?.kind==='contact'||selected?.kind==='self')}>{selectedAbility?.spatial?'Выбранный предмет или существо':'Выбранное существо'}</option></select></label>
        {selectedAbility&&!selectedAbility.spatial&&aim!=='self'&&!releaseTarget&&<p className="gb-game-help">Для этой способности выбери себя или доступное существо.</p>}{selectedAbility?.spatial&&<p className="gb-game-help">{aim==='selected'?'Прицел следует за выбранным предметом или существом. Чтобы навести вручную, нажми на землю или укажи координаты.':<>Отметь {selectedAbility.spatial.shape==='point'?'точку':selectedAbility.spatial.shape==='sphere'?'центр области':'направление от героя'} на карте или укажи координаты. Можно также выбрать предмет или существо.</>}</p>}
        {aim==='selected'&&selectedLabel&&<p className="gb-game-help">{selectedLabel}{object&&!object.visible?' · последняя известная отметка':''}{selectedAbility?.spatial?' · наведение по центру':''}</p>}
        {aimPreview&&<p className="gb-aim-readout" role="status" data-valid={aimPreview.valid}>{aimPreview.name} · {aimPreview.distanceM.toFixed(2)} м{aimPreview.rangeM!==undefined?' / '+aimPreview.rangeM+' м':''} · {aimPreview.message}</p>}
        {aimPreview?.valid&&<details className="gb-aim-contents"><summary>Отметки внутри контура: {contents.length}</summary><p>Центры видимых предметов и раскрытые отметки существ. Попадание и препятствия проверяет мастер.</p>{contents.length>0&&<ul>{contents.map(t=><li key={t.kind+':'+t.id}>{t.label}{t.kind==='object'?' · центр предмета':''}</li>)}</ul>}</details>}
        <div className="w6-buttons"><button className="w6-button" disabled={!selectedAbility} onClick={()=>onAdd({kind:'ability',abilityId:ability,stage:'prepare',target:{kind:'none'},note:''})}>Подготовить способность</button><button className="w6-button" disabled={!selectedAbility||!releaseTarget||aimPreview?.valid===false} onClick={()=>{if(releaseTarget)onAdd({kind:'ability',abilityId:ability,stage:'release',target:releaseTarget,note:''})}}>Применить способность</button></div></>}
    </fieldset>
    <p className="gb-game-help">Кнопки добавляют действия в твой ход. Когда план готов — отправь его мастеру.</p>
  </section>
}
