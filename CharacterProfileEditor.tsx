import { ArtworkPicker } from './VisualElements'
import { portraitPresets } from './visualMedia'
import { schoolById } from './magicCatalog'
import { elementOptions, rankOptions, progressionSteps, energyOptions, advancementOptions } from './characterProfile'
import type { CharacterProfile, ElementKey, RankKey, EnergyKey, AdvancementKey } from './characterProfile'

type Props = {
  characterId: string
  profile: CharacterProfile
  onChange: (profile: CharacterProfile) => void
  onOpenMagic?: () => void
}

export default function CharacterProfileEditor({ characterId, profile, onChange, onOpenMagic }: Props) {
  return (
    <fieldset className="w6-fieldset">
      <legend>Профиль героя</legend>
      <ArtworkPicker label="Портрет персонажа" value={profile.portrait} presets={portraitPresets} onChange={portrait=>onChange({...profile,portrait})}/>
      <div className="w6-attribute-grid">
        <label className="w6-field" htmlFor={'rank-' + characterId}>
          <span>Ранг</span>
          <select id={'rank-' + characterId} value={profile.rank}
            onChange={event => onChange({ ...profile, rank: event.currentTarget.value as RankKey | '', rankStep:1 })}>
            <option value="">Не задана</option>
            {rankOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="w6-field"><span>{profile.rank==='mortal'?'Стадия закалки':'Ступень внутри ранга'}</span><select value={profile.rankStep??1} onChange={e=>onChange({...profile,rankStep:Number(e.currentTarget.value)})}>{Array.from({length:progressionSteps(profile.rank||'mortal')},(_,i)=><option key={i+1} value={i+1}>{i+1} / {progressionSteps(profile.rank||'mortal')}</option>)}</select></label>
        <label className="w6-field"><span>Единственный тип энергии</span><select value={profile.energy??'mana'} onChange={e=>onChange({...profile,energy:e.currentTarget.value as EnergyKey})}>{energyOptions.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
        <label className="w6-field" htmlFor={'element-' + characterId}>
          <span>Базовая стихия</span>
          <select id={'element-' + characterId} value={profile.element}
            onChange={event => onChange({ ...profile, element: event.currentTarget.value as ElementKey | '' })}>
            <option value="">Не выбрана</option>
            {elementOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <label className="w6-field w6-spaced" htmlFor={'origin-' + characterId}>
        <span>Происхождение</span>
        <input id={'origin-' + characterId} value={profile.origin} maxLength={200}
          onChange={event => onChange({ ...profile, origin: event.currentTarget.value })} />
      </label>
      <label className="w6-field w6-spaced" htmlFor={'biography-' + characterId}>
        <span>Краткая история</span>
        <textarea id={'biography-' + characterId} value={profile.biography} maxLength={4000} rows={4}
          onChange={event => onChange({ ...profile, biography: event.currentTarget.value })} />
      </label>
      {onOpenMagic&&<div className="w6-magic-profile-link"><button type="button" className="w6-button" onClick={onOpenMagic}>Открыть каталог магии</button><span className="w6-copy">Освоены: {(profile.magic??[]).filter(s=>s.state==='mastered').map(s=>schoolById(s.schoolId)?.name).join(', ')||'пока не отмечены'}</span></div>}
      <details className="w6-fieldset"><summary>Концепция и особые пути развития</summary><p className="w6-copy">Владение концепцией не является рангом. Вознесение и Разрыв требуют условий мира; выбор здесь фиксирует согласованный с мастером путь.</p><label className="w6-field"><span>Концепция</span><input maxLength={160} value={profile.concept??''} onChange={e=>onChange({...profile,concept:e.currentTarget.value})}/></label><label className="w6-field"><span>Путь развития</span><select value={profile.advancement??''} onChange={e=>onChange({...profile,advancement:e.currentTarget.value as AdvancementKey|''})}><option value="">Обычное развитие</option>{advancementOptions.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label><label className="w6-check"><input type="checkbox" checked={profile.emperor??false} onChange={e=>onChange({...profile,emperor:e.currentTarget.checked})}/>Император · статус, связанный с миром</label></details>
      <p className="w6-copy">Ранг содержит ступени. Освоив последнюю, герой переходит на первый уровень следующего ранга. Мана и Тень взаимно исключают друг друга.</p>
    </fieldset>
  )
}
