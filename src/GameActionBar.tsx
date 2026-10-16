import { useState } from 'react'
import type { DeclaredAction, DeclarationOptions, DeclarationTarget } from './actionDeclarations'
import type { PerceivedMap } from './scenePerception'
import type { ScenePosition } from './sceneTypes'

export default function GameActionBar({ map, point, contactId, objectId, options, disabled, onAdd }: {
  map: PerceivedMap | null; point: ScenePosition | null; contactId: string; objectId: string;
  options: DeclarationOptions | null; disabled: boolean; onAdd: (action: DeclaredAction) => void;
}) {
  const [movement,setMovement]=useState<'ground'|'air'>('ground')
  const [mode,setMode]=useState<'world'|'speak'|'item'|'ability'>('world'),[text,setText]=useState(''),[volume,setVolume]=useState<'whisper'|'normal'|'shout'>('normal')
  const [item,setItem]=useState(''),[ability,setAbility]=useState(''),[aim,setAim]=useState('self')
  const object=map?.objects.find(o=>o.id===objectId),contact=map?.contacts.find(c=>c.id===contactId&&c.kind!=='self')
  const knownObject=options?.targets.some(t=>t.kind==='object'&&t.id===objectId),knownContact=options?.targets.some(t=>t.kind==='contact'&&t.id===contactId)
  const target:DeclarationTarget=aim==='selected'&&knownObject?{kind:'object',id:objectId}:aim==='selected'&&knownContact?{kind:'contact',id:contactId}:aim==='point'&&point?{kind:'point',point}:{kind:'self'}
  const selectedAbility=options?.abilities.find(a=>a.id===ability)
  function releaseTarget():DeclarationTarget {
    if(selectedAbility?.spatial&&point&&aim==='point')return {kind:selectedAbility.spatial.shape==='point'?'point':selectedAbility.spatial.shape==='sphere'?'area':'direction',point}
    return target
  }
  return <section className="gb-game-actionbar" aria-label="Быстрые игровые действия">
    <div className="gb-game-modes">{([['world','Мир'],['speak','Речь'],['item','Предметы'],['ability','Способности']] as const).map(([id,label])=><button key={id} className="w6-button" type="button" aria-pressed={mode===id} onClick={()=>setMode(id)}>{label}</button>)}</div>
    <fieldset disabled={disabled}>
      {mode==='world'&&<><p className="gb-game-context">{object?<><strong>{object.name}</strong> · {object.visible?'объект перед тобой':'последнее известное состояние'}{object.kind==='door'&&(object.open?' · открыта':' · закрыта')}</>:contact?<><strong>{contact.label}</strong>{contact.signs&&' · '+contact.signs}</>:point?<>Точка назначения: {point.x}; {point.y}; {point.z} м</>:'Нажми на землю, предмет или существо на карте.'}</p>
        <div className="w6-buttons"><select aria-label="Быстрый способ движения" value={movement} onChange={e=>setMovement(e.currentTarget.value as typeof movement)}><option value="ground">Ходьба</option><option value="air">Полёт</option></select><button type="button" className="w6-button w6-primary" disabled={!point} onClick={()=>{if(point)onAdd({kind:'move',route:[point],support:movement,note:''})}}>Идти к отметке</button>
          <button type="button" className="w6-button" disabled={!knownObject&&!knownContact} onClick={()=>onAdd({kind:'interact',target:knownObject?{kind:'object',id:objectId}:{kind:'contact',id:contactId},operation:'inspect',note:''})}>Осмотреть выбранное</button>
          {object&&(object.kind==='door'||object.kind==='crate')&&<button type="button" className="w6-button" disabled={!knownObject} onClick={()=>onAdd({kind:'interact',target:{kind:'object',id:object.id},operation:object.open?'close':'open',note:''})}>{object.open?'Закрыть':'Открыть'} {object.kind==='door'?'дверь':'контейнер'}</button>}
          <button type="button" className="w6-button" onClick={()=>onAdd({kind:'wait',seconds:1,note:''})}>Ждать 1 с</button>
          <button type="button" className="w6-button" onClick={()=>onAdd({kind:'wait',seconds:1,listening:{mode:'listen',target:{kind:'none'}},note:''})}>Прислушаться 1 с</button>
        </div></>}
      {mode==='speak'&&<><label className="w6-field"><span>Реплика героя</span><textarea aria-label="Быстрая реплика героя" rows={2} maxLength={4000} value={text} onChange={e=>setText(e.currentTarget.value)}/></label>
        <div className="w6-buttons"><select aria-label="Громкость быстрой реплики" value={volume} onChange={e=>setVolume(e.currentTarget.value as typeof volume)}><option value="whisper">Шёпот</option><option value="normal">Обычный голос</option><option value="shout">Крик</option></select><button className="w6-button" disabled={!text.trim()} onClick={()=>{onAdd({kind:'speak',text,volume,target:{kind:'none'},note:''});setText('')}}>Добавить реплику в ход</button></div></>}
      {mode==='item'&&<><label className="w6-field"><span>Предмет из инвентаря</span><select aria-label="Быстрый предмет" value={item} onChange={e=>setItem(e.currentTarget.value)}><option value="">Выбери предмет</option>{options?.items.map(i=><option key={i.id} value={i.id}>{i.name} × {i.quantity}</option>)}</select></label><div className="w6-buttons">{([['equip','Снарядить'],['unequip','Снять'],['activate','Активировать'],['consume','Использовать одну дозу']] as const).map(([operation,label])=><button key={operation} className="w6-button" disabled={!options?.items.some(i=>i.id===item)} onClick={()=>onAdd({kind:'item',itemId:item,quantity:1,operation,target:{kind:'self'},note:''})}>{label}</button>)}</div></>}
      {mode==='ability'&&<><label className="w6-field"><span>Утверждённая способность</span><select aria-label="Быстрая способность" value={ability} onChange={e=>setAbility(e.currentTarget.value)}><option value="">Выбери способность</option>{options?.abilities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="w6-field"><span>Цель применения</span><select aria-label="Цель быстрой способности" value={aim} onChange={e=>setAim(e.currentTarget.value)}><option value="self">На себя</option><option value="point" disabled={!point}>Отмеченная точка</option><option value="selected" disabled={!knownObject&&!knownContact}>Выбранный объект или контакт</option></select></label>
        <div className="w6-buttons"><button className="w6-button" disabled={!selectedAbility} onClick={()=>onAdd({kind:'ability',abilityId:ability,stage:'prepare',target:{kind:'none'},note:''})}>Подготовить способность</button><button className="w6-button" disabled={!selectedAbility||aim==='point'&&!point||aim==='selected'&&!knownObject&&!knownContact} onClick={()=>onAdd({kind:'ability',abilityId:ability,stage:'release',target:releaseTarget(),note:''})}>Применить способность</button></div></>}
    </fieldset>
    <p className="gb-game-help">Кнопки добавляют действия в твой ход. Когда план готов — отправь его мастеру.</p>
  </section>
}
