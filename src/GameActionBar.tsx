import {knownAimTargets} from './sceneAimTargets'
import SceneAbilityAimSummary from './SceneAbilityAimSummary'
import {useEffect,useMemo,useRef} from 'react'
import {buildSceneAbilityAim} from './sceneAbilityAim'
import type {SceneAbilityAim} from './sceneAbilityAim'
import {objectRelocatable} from './legacyObjectBehavior'
import {objectActions} from './tabletopInteractions'
import { quickAbilityTarget } from './gameControls'
import AbilityChargeSelect from './AbilityChargeSelect'
import type { QuickActionDraft } from './gameControls'
import { isMovementMode, isTerrainMovement, movementLabels } from './actionDeclarations'
import type { DeclaredAction, DeclarationOptions, DeclarationTarget } from './actionDeclarations'
import type { PerceivedMap } from './scenePerception'
import type { ScenePosition } from './sceneTypes'

export default function GameActionBar({ map, point, contactId, objectId, options, disabled, onAdd, draft, onChange,onAimChange,resolveAim,environmentOnly=false }: {
  onAimChange?:(aim:SceneAbilityAim|null)=>void;resolveAim?:(aim:SceneAbilityAim)=>SceneAbilityAim;environmentOnly?:boolean;
  map: PerceivedMap | null; point: ScenePosition | null; contactId: string; objectId: string;
  options: DeclarationOptions | null; disabled: boolean; onAdd: (action: DeclaredAction) => boolean; draft: QuickActionDraft; onChange: (draft: QuickActionDraft) => void;
}) {
  const {mode,text,volume,item,ability,aim}=draft
  const modeHelp={world:['Окружение и движение','Выбери точку, предмет или существо на сцене. Здесь появятся доступные действия.'],speak:['Реплика героя','Напиши слова героя и выбери громкость. Реплика попадёт в план хода.'],item:['Предмет из инвентаря','Выбери предмет и нужное действие с ним.'],ability:['Применение способности','Выбери способность, заряд и цель. Проверь область перед добавлением в план.']}[mode]
  const field=<K extends keyof QuickActionDraft>(key:K,value:QuickActionDraft[K])=>onChange({...draft,[key]:value})
  const object=map?.objects.find(o=>o.id===objectId),contact=map?.contacts.find(c=>c.id===contactId&&c.kind!=='self')
  const self = map?.contacts.find(c=>c.kind==='self'), falling = !!self?.falling
  const movement = draft.movement==='swim' && map && !map.aquatics ? 'ground' : draft.movement
  const swimming = movement==='swim', terrain = isTerrainMovement(movement)
  const pool = swimming && object?.visible && object.liquidSurfaceZ!==undefined ? object : undefined
  const movePoint = point ?? (pool ? {x:pool.x,y:pool.y,z:pool.z} : null)
  const z = (terrain || swimming) && draft.movementZ?.trim() ? Number(draft.movementZ) : point?.z
  const validZ = z!==undefined && Number.isFinite(z) && (!map || z>=map.frame.minZ && z<=map.frame.maxZ)
  const destination = movePoint && z!==undefined && validZ ? {...movePoint,z} : null
  const shownPoint = destination ?? point
  const knownObject=options?.targets.some(t=>t.kind==='object'&&t.id===objectId),knownContact=options?.targets.some(t=>t.kind==='contact'&&t.id===contactId)
  const ownContact=map?.contacts.find(c=>c.kind==='self'&&c.id===contactId),selectedContact=contact??ownContact
  const selected:DeclarationTarget|null=knownObject?{kind:'object',id:objectId}:knownContact?{kind:'contact',id:contactId}:ownContact?{kind:'self'}:null
  const selectedPoint:ScenePosition|null=knownObject&&object?{x:object.x,y:object.y,z:object.z+object.height/2}:selectedContact?.z!==undefined&&selectedContact?.kind!=='sound'&&(knownContact||ownContact)?{x:selectedContact.x,y:selectedContact.y,z:selectedContact.z}:null
  const selectedLabel=knownObject?object?.name:selectedContact?.label
  const template=options?.abilities.find(a=>a.id===ability)
  const selectedCharge=options?.casts?.find(c=>c.id===draft.castId&&c.abilityId===ability)
  const selectedAbility=draft.castId?selectedCharge:template
  const chooseAbility=(id:string,castId='')=>{const next=castId?options?.casts?.find(c=>c.id===castId&&c.abilityId===id):options?.abilities.find(a=>a.id===id);onChange({...draft,ability:id,castId,aim:next?.spatial?(selectedPoint?'selected':'point'):(selected?.kind==='contact'||selected?.kind==='self'?'selected':'self')})}
  const releaseTarget=quickAbilityTarget(selectedAbility?.spatial,aim,point,selected,selectedPoint)
  const aimPreview=useMemo(()=>{const aim=mode==='ability'?buildSceneAbilityAim(map,selectedAbility,releaseTarget):null;return aim&&resolveAim?resolveAim(aim):aim},[mode,map,selectedAbility,JSON.stringify(releaseTarget),resolveAim])
  const contents=useMemo(()=>map?knownAimTargets(map,aimPreview):[],[map,aimPreview])
  const selectionStamp=objectId+'|'+contactId,previousTarget=useRef({selection:selectionStamp,point})
  useEffect(()=>{const before=previousTarget.current;previousTarget.current={selection:selectionStamp,point};if(mode!=='ability'||!selectedAbility)return;if(before.selection!==selectionStamp&&selected&&(selectedAbility.spatial?selectedPoint:selected.kind==='contact'||selected.kind==='self')){if(aim!=='selected')onChange({...draft,aim:'selected'})}else if(before.point!==point&&selectedAbility.spatial){if(aim!=='point')onChange({...draft,aim:'point'})}},[selectionStamp,point,mode,selectedAbility])
  useEffect(()=>{onAimChange?.(aimPreview);return ()=>onAimChange?.(null)},[aimPreview,onAimChange])
  return <section className="gb-game-actionbar" aria-label="Быстрые игровые действия">
    <div className="gb-game-modes">{([['world','Мир'],['speak','Речь'],['item','Предметы'],['ability','Способности']] as const).filter(([id])=>!environmentOnly||id==='world'||id==='ability').map(([id,label])=><button key={id} className="w6-button" type="button" aria-pressed={mode===id} onClick={()=>field('mode',id)}>{label}</button>)}</div>
    <p className="ui-action-context"><strong>{modeHelp[0]}</strong>{modeHelp[1]}</p>
    <fieldset disabled={disabled}>
      {mode==='world'&&<><p className="gb-game-context">{object?<><strong>{object.name}</strong> · {object.visible?'объект перед тобой':'последнее известное состояние'}{object.kind==='door'&&(object.open?' · открыта':' · закрыта')}</>:contact?<><strong>{contact.label}</strong>{contact.signs&&' · '+contact.signs}</>:shownPoint?<>Отметка ({shownPoint.x}, {shownPoint.y}, {shownPoint.z}) м</>:'Нажми на землю, предмет или существо на карте.'}</p>
        {falling && !environmentOnly && <p className="gb-game-help">Герой падает. Новый маршрут можно задать после приземления.</p>}
        {self?.support==='water' && !environmentOnly && <p className="gb-game-help">{self.submerged?'Голова под водой.':'Голова над водой.'}
          {self.breathRemainingSeconds!==undefined && <> Запас воздуха {self.breathRemainingSeconds.toLocaleString('ru-RU',{maximumFractionDigits:1})} с.</>}</p>}
        {!environmentOnly && <><div className="w6-buttons">
          <select aria-label="Быстрый способ движения" disabled={falling} value={movement} onChange={e=>{
            const next=e.currentTarget.value
            if(isMovementMode(next))onChange({...draft,movement:next,movementZ:''})
          }}>{Object.entries(movementLabels).filter(([id])=>id!=='swim'||!map||map.aquatics).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
          <button type="button" className="w6-button w6-primary" disabled={!destination||falling} onClick={()=>{
            if(destination&&!falling)onAdd({kind:'move',route:[destination],support:movement,note:''})
          }}>{movement==='jump'?'Прыгнуть к отметке':movement==='climb'?'Добавить подъём или спуск':swimming?'Плыть к отметке':'Идти к отметке'}</button>
        </div>{(terrain||swimming)&&!falling&&<>
          {movePoint&&<label className="w6-field"><span>{swimming?'Высота ног в точке назначения, м':'Высота точки назначения, м'}</span><input aria-label="Высота точки назначения, м" type="number" step="any"
            min={map?.frame.minZ} max={map?.frame.maxZ} placeholder={point ? String(point.z) : 'Укажи высоту'} value={draft.movementZ??''}
            aria-invalid={z!==undefined&&!validZ} onChange={e=>field('movementZ',e.currentTarget.value)}/>
            {z!==undefined&&!validZ&&map&&<small>Допустимая высота от {map.frame.minZ} до {map.frame.maxZ} м.</small>}</label>}
          {pool&&<p className="gb-game-help">Поверхность воды {pool.liquidSurfaceZ} м по Z. {point?'Используется отметка на карте.':'Выбран центр водоёма.'}</p>}
          <p className="gb-game-help">{swimming?'Выбери точку в воде или на берегу. Чтобы нырнуть, опусти отметку ног. Чтобы вдохнуть, подними её ближе к поверхности.':
            (movement==='jump'?'Укажи точку на земле или на поверхности, куда хочешь приземлиться.':
              'Укажи точку рядом с той же гранью опоры, сверху или снизу. Мастер должен разрешить подъём по этой грани.')+' Действие занимает часть одного раунда.'}</p>
        </>}</>}
        <div className="w6-buttons">
          <button type="button" className="w6-button" disabled={!knownObject&&!knownContact} onClick={()=>onAdd({kind:'interact',target:knownObject?{kind:'object',id:objectId}:{kind:'contact',id:contactId},operation:'inspect',note:''})}>Осмотреть выбранное</button>
          {object&&objectActions(object).map(action=><button type="button" className="w6-button" key={action.operation} disabled={!knownObject||action.disabled} onClick={()=>onAdd({kind:'interact',target:{kind:'object',id:object.id},operation:action.operation,note:''})}>{action.label}{object.kind==='door'&&(action.operation==='open'||action.operation==='close')?' дверь':''}</button>)}
          {object&&objectRelocatable(object)&&<button type="button" className="w6-button" disabled={!knownObject||!point||object.sliding} onClick={()=>{if(point&&!object.sliding)onAdd({kind:'interact',target:{kind:'object',id:object.id},operation:'relocate',destination:point,note:''})}}>{object.sliding ? 'Предмет скользит' : 'Передвинуть к отметке'}</button>}
          {!environmentOnly&&<><button type="button" className="w6-button" onClick={()=>onAdd({kind:'wait',seconds:1,note:''})}>Ждать 1 с</button>
          <button type="button" className="w6-button" onClick={()=>onAdd({kind:'wait',seconds:1,listening:{mode:'listen',target:{kind:'none'}},note:''})}>Прислушаться 1 с</button></>}
        </div></>}
      {mode==='speak'&&<><label className="w6-field"><span>Реплика героя</span><textarea aria-label="Быстрая реплика героя" rows={2} maxLength={4000} value={text} onChange={e=>field('text',e.currentTarget.value)}/></label>
        <div className="w6-buttons"><select aria-label="Громкость быстрой реплики" value={volume} onChange={e=>field('volume',e.currentTarget.value as typeof volume)}><option value="whisper">Шёпот</option><option value="normal">Обычный голос</option><option value="shout">Крик</option></select><button className="w6-button" disabled={!text.trim()} onClick={()=>{onAdd({kind:'speak',text,volume,target:{kind:'none'},note:''})}}>Добавить реплику в ход</button></div></>}
      {mode==='item'&&<><label className="w6-field"><span>Предмет из инвентаря</span><select aria-label="Быстрый предмет" value={item} onChange={e=>field('item',e.currentTarget.value)}><option value="">Выбери предмет</option>{options?.items.map(i=><option key={i.id} value={i.id}>{i.name} × {i.quantity}</option>)}</select></label><div className="w6-buttons">{([['equip','Снарядить'],['unequip','Снять'],['activate','Активировать'],['consume','Использовать одну дозу']] as const).map(([operation,label])=><button key={operation} className="w6-button" disabled={!options?.items.some(i=>i.id===item)} onClick={()=>onAdd({kind:'item',itemId:item,quantity:1,operation,target:{kind:'self'},note:''})}>{label}</button>)}</div></>}
      {mode==='ability'&&<><label className="w6-field"><span>{environmentOnly?'Эффект для пробы':'Утверждённая способность'}</span><select aria-label="Быстрая способность" value={ability} onChange={e=>chooseAbility(e.currentTarget.value)}><option value="">Выбери способность</option>{options?.abilities.map(a=><option key={a.id} value={a.id}>{a.name}{a.canPrepare===false?' · только оплаченные заряды':''}</option>)}</select></label>
        {!environmentOnly&&ability&&<AbilityChargeSelect options={options} abilityId={ability} value={draft.castId??''} onChange={id=>chooseAbility(ability,id)}/>}
        {draft.castId&&!selectedCharge&&<p role="alert">Этот заряд больше не доступен. Выбери другой заряд; автоматической замены нет.</p>}
        {!draft.castId&&template?.cost&&<p className="gb-game-help">Базовый расход подготовки: мана {template.cost.mana} · Тень {template.cost.shadow} · выносливость {template.cost.stamina}. Итоговый расход и личное время подтвердит мастер.</p>}
        <label className="w6-field"><span>Цель применения</span><select aria-label="Цель быстрой способности" value={aim} onChange={e=>field('aim',e.currentTarget.value as typeof aim)}><option value="self" disabled={!!selectedAbility?.spatial}>На себя</option><option value="point" disabled={!selectedAbility?.spatial||!point}>Отмеченная точка</option><option value="selected" disabled={selectedAbility?.spatial?!selectedPoint:!(selected?.kind==='contact'||selected?.kind==='self')}>{selectedAbility?.spatial?'Выбранный предмет или существо':'Выбранное существо'}</option></select></label>
        {selectedAbility&&!selectedAbility.spatial&&aim!=='self'&&!releaseTarget&&<p className="gb-game-help">Для этой способности выбери себя или доступное существо.</p>}{selectedAbility?.spatial&&<p className="gb-game-help">{aim==='selected'?'Прицел следует за выбранным предметом или существом. Чтобы навести вручную, нажми на землю или укажи координаты.':<>Отметь {selectedAbility.spatial.shape==='point'?'точку':selectedAbility.spatial.shape==='sphere'?'центр области':'направление от героя'} на карте или укажи координаты. Можно также выбрать предмет или существо.</>}</p>}
        {aim==='selected'&&selectedLabel&&<p className="gb-game-help">{selectedLabel}{object&&!object.visible?' · последняя известная отметка':''}{selectedAbility?.spatial?' · наведение по центру':''}</p>}
        {aimPreview&&<SceneAbilityAimSummary aim={aimPreview} targets={contents}/>}
        <div className="w6-buttons"><button className="w6-button" disabled={!!draft.castId||!template||template.canPrepare===false} onClick={()=>onAdd({kind:'ability',abilityId:ability,stage:'prepare',target:{kind:'none'},note:''})}>Подготовить способность</button><button className="w6-button" disabled={!selectedAbility||!releaseTarget||aimPreview?.valid===false} onClick={()=>{if(releaseTarget)onAdd({kind:'ability',abilityId:ability,stage:'release',target:releaseTarget,note:'',...(draft.castId?{castId:draft.castId}:{})})}}>Применить способность</button></div></>}
    </fieldset>
    <p className="gb-game-help">Кнопки добавляют действия в твой ход. Когда план готов — отправь его мастеру.</p>
  </section>
}
