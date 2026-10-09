import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CharacterProfile, ElementKey } from './characterProfile'
import type { LearnedAbility } from './rpgTypes'
import {
  copyMagicStudies, filterMagicSchools, magicGroups, magicSchools, magicStudyStates,
  schoolById, updateMagicStudy,
} from './magicCatalog'
import type { MagicGroupId, MagicSchool, MagicStudyState } from './magicCatalog'
import { magicArtwork } from './magicArtwork'
import MagicSigil from './MagicSigil'
import './magicCatalog.css'

type SaveResult = { ok: boolean; message: string }
type Props = {
  characterId: string
  profile: CharacterProfile
  abilities: LearnedAbility[]
  onChange: (profile: CharacterProfile) => void
  onSave: () => SaveResult
  onAbilities: () => void
}

function SchoolDialog({school,profile,abilities,onChange,onClose,onSelect,onSave,onAbilities}: {
  school: MagicSchool
  profile: CharacterProfile
  abilities: LearnedAbility[]
  onChange: Props['onChange']
  onClose: () => void
  onSelect: (id: string) => void
  onSave: Props['onSave']
  onAbilities: () => void
}) {
  const dialog = useRef<HTMLElement>(null)
  const [message,setMessage] = useState('')
  const study = profile.magic?.find(s => s.schoolId === school.id)
  const group = magicGroups.find(g => g.id === school.group)!
  const linked = abilities.filter(a => a.schoolId === school.id)
  useEffect(() => {
    const previous=document.activeElement as HTMLElement | null
    dialog.current?.focus()
    function keyboard(event: KeyboardEvent) {
      if(event.key === 'Escape'){event.preventDefault();onClose();return}
      if(event.key !== 'Tab')return
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]') ?? [])
      if(!controls.length){event.preventDefault();dialog.current?.focus();return}
      const first=controls[0],last=controls[controls.length-1]
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus()}
    }
    const oldOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    document.addEventListener('keydown',keyboard)
    return () => {document.removeEventListener('keydown',keyboard);document.body.style.overflow=oldOverflow;previous?.focus()}
  }, [onClose])

  useEffect(() => { dialog.current?.focus(); setMessage('') }, [school.id])

  function changeState(state: MagicStudyState | '') {
    onChange({...profile,magic:updateMagicStudy(profile.magic??[],school.id,state,study?.notes??'')})
    setMessage('Состояние изменено. Сохрани направления.')
  }
  return <div className="w6-modal-backdrop w6-magic-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="w6-magic-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="magic-detail-title" tabIndex={-1}>
      <div className="w6-magic-detail-art">
        <img src={magicArtwork[school.group]} alt=""/>
        <button className="w6-button w6-magic-close" type="button" aria-label="Закрыть карточку школы" onClick={onClose}>Закрыть ×</button>
        <div><span className="w6-magic-eyebrow">{group.label}</span><h2 id="magic-detail-title"><MagicSigil school={school} size={54}/>{school.name}</h2></div>
      </div>
      <div className="w6-magic-detail-content">
        <p className="w6-magic-lead">{school.summary}</p><p>{school.description}</p>
        {school.group==='extended'&&<p className="w6-magic-note">Направление из расширенного перечня. Численные возможности определяются правилами конкретной способности.</p>}
        <div className="w6-magic-detail-columns">
          <section><h3>Возможные применения</h3><ul>{school.examples.map(example=><li key={example}>{example}</li>)}</ul><p className="w6-magic-note">Примеры помогают понять направление. Это не готовые заклинания и не автоматическое получение способностей.</p></section>
          <section><h3>У героя</h3>
            <label className="w6-field"><span>Состояние направления: {school.name}</span>
              <select value={study?.state??''} onChange={e=>changeState(e.currentTarget.value as MagicStudyState | '')}>
                <option value="">Не отмечено</option>{magicStudyStates.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            {study&&<label className="w6-field w6-spaced"><span>Заметка об освоении: {school.name}</span><textarea rows={3} maxLength={2000} value={study.notes}
              onChange={e=>{onChange({...profile,magic:updateMagicStudy(profile.magic??[],school.id,study.state,e.currentTarget.value)});setMessage('Заметка изменена. Сохрани направления.')}}/></label>}
            {school.group==='elements'&&<div className="w6-magic-base-action">{profile.element===school.id?<span className="w6-magic-badge">Базовая стихия героя</span>:<button className="w6-button" type="button" onClick={()=>{onChange({...profile,element:school.id as ElementKey});setMessage('Базовая стихия изменена. Сохрани направления.')}}>Выбрать базовой стихией</button>}<p className="w6-magic-note">Базовая стихия одна. Её выбор не изменяет остальные отметки освоения.</p></div>}
          </section>
        </div>
        <h3>Связанные направления</h3><div className="w6-magic-links">{school.related.map(id=>schoolById(id)).filter((s):s is MagicSchool=>!!s).map(s=><button type="button" className="w6-button" key={s.id} onClick={()=>{setMessage('');onSelect(s.id)}}><MagicSigil school={s} size={25}/>{s.name}</button>)}</div>
        <h3>Способности героя этой школы</h3>
        {linked.length?<ul className="w6-magic-linked">{linked.map(a=><li key={a.id}><strong>{a.name}</strong><span>{a.approved?'Утверждена':'Ожидает утверждения'} · Мана {a.cost.mana} · Тень {a.cost.shadow} · Выносливость {a.cost.stamina}</span></li>)}</ul>:<p className="w6-magic-note">Пока нет связанных способностей. Школу можно указать в редакторе способности.</p>}
        <div className="w6-buttons w6-spaced"><button type="button" className="w6-button w6-primary" onClick={()=>setMessage(onSave().message)}>Сохранить направления</button><button type="button" className="w6-button" onClick={()=>{onClose();onAbilities()}}>Перейти к способностям</button></div>
        <p role="status" className="w6-notice">{message}</p>
      </div>
    </section>
  </div>
}

export default function MagicCatalogPanel({characterId,profile,abilities,onChange,onSave,onAbilities}: Props) {
  const [query,setQuery]=useState(''),[group,setGroup]=useState<MagicGroupId|'all'>('all'),[state,setState]=useState('all')
  const [selectedId,setSelectedId]=useState<string|null>(null),[message,setMessage]=useState('')
  const studies=copyMagicStudies(profile.magic)
  const currentGroup=magicGroups.find(g=>g.id===group)
  const selected=schoolById(selectedId??'')
  const found=filterMagicSchools(query,group,state,studies,profile.element)
  const mastered=studies.filter(s=>s.state==='mastered')
  const base=schoolById(profile.element)
  // Стабильная ссылка сохраняет фокус диалога при изменении заметок.
  const closeDialog=useRef(()=>setSelectedId(null)).current
  return <section className="w6-magic-atlas" aria-label="Каталог магии">
    <header className="w6-magic-hero">
      <img src={magicArtwork[currentGroup?.id??'arcane']} alt="" fetchPriority="low"/>
      <div><span className="w6-magic-eyebrow">Мир 6 · Магический атлас</span><h2>{currentGroup?.label??'Направления магии'}</h2><p>{currentGroup?.description??'Стихии, школы и тёмные искусства. Изучи направление и отметь путь своего героя.'}</p></div>
      <span className="w6-magic-count">{magicSchools.length} направление</span>
    </header>
    <div className="w6-magic-character-summary">
      <div><span>Базовая стихия</span><strong>{base?<><MagicSigil school={base} size={27}/>{base.name}</>:'Не выбрана'}</strong></div>
      <div><span>Освоенные направления</span><strong>{mastered.length}</strong></div>
      <div><span>В изучении</span><strong>{studies.filter(s=>s.state==='studying').length}</strong></div>
      <button className="w6-button" type="button" onClick={()=>setMessage(onSave().message)}>Сохранить направления</button>
    </div>
    {mastered.length>0&&<div className="w6-magic-owned" aria-label="Освоенные направления героя">{mastered.map(study=>schoolById(study.schoolId)!).map(s=><button type="button" className="w6-button" key={s.id} onClick={()=>setSelectedId(s.id)}><MagicSigil school={s} size={23}/>{s.name}</button>)}</div>}
    <div className="w6-magic-layout">
      <nav className="w6-magic-groups" aria-label="Группы магии">
        <button type="button" aria-pressed={group==='all'} onClick={()=>setGroup('all')}><span>Весь каталог</span><b>{magicSchools.length}</b></button>
        {magicGroups.map(g=><button key={g.id} type="button" aria-pressed={group===g.id} onClick={()=>setGroup(g.id)}><span><small>{g.eyebrow}</small>{g.label}</span><b>{magicSchools.filter(s=>s.group===g.id).length}</b></button>)}
        <p className="w6-magic-note">Мана и Тень — отдельные запасы. Школа описывает направление, способность — конкретное действие.</p>
      </nav>
      <div className="w6-magic-browser">
        <div className="w6-magic-filters">
          <label className="w6-field" htmlFor={'magic-search-'+characterId}><span>Поиск магии</span><input id={'magic-search-'+characterId} type="search" value={query} placeholder="Название, проявление или применение" maxLength={200} onChange={e=>setQuery(e.currentTarget.value)}/></label>
          <label className="w6-field" htmlFor={'magic-filter-'+characterId}><span>Показать направления</span><select id={'magic-filter-'+characterId} value={state} onChange={e=>setState(e.currentTarget.value)}><option value="all">Все состояния</option><option value="base">Базовая стихия</option>{magicStudyStates.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}<option value="unmarked">Не отмеченные</option></select></label>
        </div>
        <p className="w6-magic-results" role="status">Найдено: {found.length} из {magicSchools.length}</p>
        <div className="w6-magic-grid">{found.map(s=>{
          const study=studies.find(x=>x.schoolId===s.id),isBase=s.id===profile.element
          return <article className="w6-magic-card" key={s.id} style={{'--school-color':s.color} as CSSProperties}>
            <div className="w6-magic-card-heading"><MagicSigil school={s} size={52}/><div><span>{magicGroups.find(g=>g.id===s.group)?.label}</span><h3>{s.name}</h3></div></div>
            <p>{s.summary}</p><div className="w6-magic-card-badges">{isBase&&<span className="w6-magic-badge">Базовая</span>}<span className={'w6-magic-badge'+(study?.state==='mastered'?' w6-magic-mastered':'')}>{magicStudyStates.find(x=>x.id===study?.state)?.label??'Не отмечено'}</span></div>
            <button type="button" className="w6-button" aria-label={'Подробнее: '+s.name} onClick={()=>setSelectedId(s.id)}>Открыть школу <span aria-hidden="true">↗</span></button>
          </article>
        })}</div>
        {!found.length&&<div className="w6-magic-empty"><h3>Направлений не найдено</h3><p>Измени запрос, группу или состояние освоения.</p><button type="button" className="w6-button" onClick={()=>{setQuery('');setGroup('all');setState('all')}}>Сбросить фильтры</button></div>}
      </div>
    </div>
    <p className="w6-magic-note">Отметки освоения ведёт мастер. Они не выдают способности, не меняют атрибуты и не назначают численный баланс.</p>
    <p className="w6-notice" role="status">{message}</p>
    {selected&&<SchoolDialog school={selected} profile={profile} abilities={abilities} onChange={onChange} onClose={closeDialog} onSelect={setSelectedId} onSave={onSave} onAbilities={onAbilities}/>}
  </section>
}
