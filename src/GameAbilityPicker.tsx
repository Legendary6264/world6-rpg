import {useRef,useState} from 'react'
import type {DeclarationAbility,DeclarationOptions} from './actionDeclarations'
import {spatialLabel} from './abilitySpatial'
import InterfaceIcon from './InterfaceIcon'

const shapes=[['all','Все формы'],['single','На себя или существо'],['point','Точка'],['sphere','Область'],['beam','Луч'],['cone','Конус']] as const
const formLabel=(ability:DeclarationAbility)=>ability.spatial?spatialLabel(ability.spatial):'На себя или существо'

export default function GameAbilityPicker({options,value,castId='',disabled,onChoose,preview=false}:{options:DeclarationOptions|null;value:string;castId?:string;disabled:boolean;onChoose:(id:string)=>void;preview?:boolean}){
 const [query,setQuery]=useState(''),[shape,setShape]=useState('all'),catalogue=useRef<HTMLDetailsElement>(null),field=useRef<HTMLSelectElement>(null)
 const abilities=options?.abilities??[],template=abilities.find(ability=>ability.id===value)
 const charge=castId?options?.casts?.find(cast=>cast.id===castId&&cast.abilityId===value):undefined
 const selected=castId?charge:template,search=query.trim().toLocaleLowerCase('ru')
 const found=abilities.filter(ability=>(shape==='all'||(ability.spatial?.shape??'single')===shape)&&(!search||(ability.name+' '+formLabel(ability)).toLocaleLowerCase('ru').includes(search)))
 function choose(id:string){if(disabled)return;if(id!==value)onChoose(id);if(catalogue.current)catalogue.current.open=false;field.current?.focus({preventScroll:true})}
 return <section className="realm-ability-picker" aria-label="Арсенал способностей">
  <label className="w6-field"><span>{preview?'Эффект для пробы':'Утверждённая способность'}</span><select ref={field} aria-label="Быстрая способность" value={value} disabled={disabled} onChange={event=>choose(event.currentTarget.value)}>
   <option value="">Выбери способность</option>{abilities.map(ability=><option key={ability.id} value={ability.id}>{ability.name}{ability.canPrepare===false?' · новая подготовка недоступна':''}</option>)}
   {!!value&&!template&&<option value={value} disabled>Прежняя способность недоступна</option>}
  </select></label>
  {!abilities.length&&<p className="realm-ability-empty">{options?'Пока нет доступных способностей. Мастер принимает способности в листе героя.':'Способности появятся после получения доступных герою сведений.'}</p>}
  {!!value&&!template&&<p role="alert">Прежняя способность больше не доступна. Выбери доступную способность; автоматической замены нет.</p>}
  {!!abilities.length&&<details ref={catalogue} className="realm-ability-catalogue"><summary><InterfaceIcon name="search" size={17}/>Найти и сравнить способности<span>{abilities.length}</span></summary>
   <div className="realm-ability-filters"><label className="w6-field"><span>Название или форма</span><input type="search" aria-label="Поиск способности" value={query} disabled={disabled} placeholder="Например, сфера" onChange={event=>setQuery(event.currentTarget.value)}/></label>
    <label className="w6-field"><span>Форма применения</span><select aria-label="Фильтр формы способности" value={shape} disabled={disabled} onChange={event=>setShape(event.currentTarget.value)}>{shapes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   </div>
   <p className="realm-ability-count" role="status">Найдено {found.length} из {abilities.length}</p>
   <div className="realm-ability-results">{found.map(ability=><button type="button" className="realm-ability-option" key={ability.id} aria-label={'Выбрать способность '+ability.name} aria-pressed={ability.id===value} disabled={disabled} onClick={()=>choose(ability.id)}><strong>{ability.name}</strong><span>{formLabel(ability)}</span><small>{ability.rangeM!==undefined?'Дальность '+ability.rangeM+' м':'Дальность не указана'}{ability.canPrepare===false?' · новая подготовка недоступна':''}</small></button>)}</div>
   {!found.length&&<p className="realm-ability-empty">Подходящих способностей нет. Измени название или форму; выбранная способность сохранена.</p>}
   {(query||shape!=='all')&&<button type="button" className="w6-button" disabled={disabled} onClick={()=>{setQuery('');setShape('all')}}>Сбросить поиск способностей</button>}
  </details>}
  {selected&&<article className="realm-ability-card" aria-label="Выбранная способность"><header><span className="realm-ability-emblem"><InterfaceIcon name="spark" size={23}/></span><div><small>{charge?'Собственный заряд':preview?'Проба эффекта':'Способность героя'}</small><h5>{selected.name}</h5></div></header>
   <p>{formLabel(selected)}</p><dl><div><dt>Дальность</dt><dd>{selected.rangeM!==undefined?selected.rangeM+' м':'Не указана'}</dd></div><div><dt>Источник</dt><dd>{charge?charge.status==='ready'?'Заряд готов':'Подготовка заряда':template?.canPrepare===false?'Новая подготовка недоступна':'Новая подготовка / выбор мастера'}</dd></div></dl>
   {!charge&&!preview&&selected.cost&&<div className="realm-ability-cost" aria-label="Базовый расход подготовки"><span>Мана <strong>{selected.cost.mana}</strong></span><span>Тень <strong>{selected.cost.shadow}</strong></span><span>Выносливость <strong>{selected.cost.stamina}</strong></span></div>}
  </article>}
 </section>
}
