import CreationPanel from './CreationPanel'
import GuidePanel from './GuidePanel'
import ConditionPanel from './ConditionPanel'
import SkillCheckPanel from './SkillCheckPanel'
import { developmentError, nextProgression, attributeCap, effectiveAttribute } from './creationRules'
import AnatomyPanel from './AnatomyPanel'
import { Illustration, ResourceStrip } from './VisualElements'
import MagicCatalogPanel from './MagicCatalogPanel'
import { schoolById } from './magicCatalog'
import EquipmentPanel from './EquipmentPanel'
import AbilitiesPanel from './AbilitiesPanel'
import RulesPanel from './RulesPanel'
import PhysiologyPanel from './PhysiologyPanel'
import { masterLifeOverride, effectiveActor, makeActionPlan, releasePlan, interruptCast, removeEffect } from './rpgEngine'
import type { Actor, World, PlanResult } from './rpgEngine'
import type { Campaign } from './rpgTypes'
import { useState } from 'react'
import CharacterSheet from './CharacterSheet'
import CharacterPlaySheet from './CharacterPlaySheet'
import CharacterProfileEditor from './CharacterProfileEditor'
import CharacterJournal from './CharacterJournal'
import CharacterBodyPanel from './CharacterBodyPanel'
import { applyBodyAction } from './characterBody'
import type { BodyAction, BodyPart, BodyRegion } from './characterBody'
import { applyEffectEvent } from './characterKnowledge'
import type { EffectEvent } from './characterKnowledge'
import { profileSummary } from './characterProfile'
import { createCharacterArchive, downloadJson } from './characterTransfer'
import type { StatisticKey } from './characterStatistics'
import {
  calculateResourceAction, isCharacterDraft, normalizeCharacterDraft,
} from './characterModel'
import type {
  AttributeKey, CharacterDraft, ReadyCharacterDraft, ResourceActionResult,
  ResourceDirection, ResourceKey,
} from './characterModel'

type CharacterWorkspaceProps = {
  remote?: boolean
  characterId: string
  draft: Actor
  characters: Actor[]
  campaign: Campaign
  onDraftChange: (actor:Actor)=>void
  onCampaign: (campaign:Campaign)=>{ok:boolean;message:string}
  onPlan: (result:PlanResult)=>void
  onWorld: (world:World)=>{ok:boolean;message:string}
  onSave: (draft: CharacterDraft) => void
}

function CharacterWorkspace({ remote, characterId, draft, characters, campaign, onDraftChange, onCampaign, onPlan, onWorld, onSave }: CharacterWorkspaceProps) {
  // Единственный черновик для редактора и игрового листа.
  const world:World={characters,campaign}
  let effective=draft,calculationError=''
  try{effective=effectiveActor(draft,campaign.seconds)}catch(e){calculationError=(e as Error).message}
  const [mode, setMode] = useState<'editor' | 'play' | 'journal' | 'equipment' | 'abilities' | 'rules' | 'physiology' | 'magic' | 'body' | 'races' | 'skills' | 'training' | 'appearance' | 'templates' | 'guide' | 'actions' | 'conditions'>('editor')
  const [message, setMessage] = useState('')
  const canSave = isCharacterDraft(draft)

  function changeDraft(next: ReadyCharacterDraft) {
    onDraftChange({...normalizeCharacterDraft(next),id:characterId})
    setMessage('Есть несохранённые изменения.')
  }

  function updateName(value: string) {
    if (value !== draft.name) changeDraft({ ...draft, name: value })
  }

  function updateAttribute(key: AttributeKey, value: string) {
    if (value !== draft.attributes[key]) {
      if(Number(value)>=0&&effectiveAttribute(draft,key)-Number(draft.attributes[key])+Number(value)>attributeCap(draft.profile)){setMessage('Превышен предел атрибута для выбранных ранга и ступени.');return}
      changeDraft({ ...draft, attributes: { ...draft.attributes, [key]: value } })
    }
  }

  function updateResource(key: ResourceKey, part: 'current' | 'maximum', value: string) {
    if (value !== draft.resources[key][part]) {
      changeDraft({
        ...draft,
        resources: {
          ...draft.resources,
          [key]: { ...draft.resources[key], [part]: value },
        },
      })
    }
  }

  function applyResourceAction(
    key: ResourceKey, amount: string, direction: ResourceDirection,
  ): ResourceActionResult {
    const result = calculateResourceAction(key, effective.resources[key], amount, direction)
    if (result.ok && result.changed) {
      changeDraft({ ...draft, resources: { ...draft.resources, [key]: {current:result.resource.current,maximum:draft.resources[key].maximum} } })
    }
    return result
  }

  function updateStatistic(key: StatisticKey, value: string) {
    if (value !== draft.statistics[key]) {
      changeDraft({ ...draft, statistics: { ...draft.statistics, [key]: value } })
    }
  }

  function handleSave() {
    const next = normalizeCharacterDraft({ ...draft, name: draft.name.trim() })
    if (!isCharacterDraft(next)) {
      setMessage('Проверь имя, профиль, характеристики, ресурсы и записи персонажа.')
      return {ok:false,message:'Проверь имя, профиль, характеристики, ресурсы и записи персонажа.'}
    }
    try {
      onSave(next)
      setMessage(remote?'Черновик героя сохранён. Опубликуй изменения кампании.':'Персонаж сохранён в этом браузере.')
      return {ok:true,message:'Направления и текущие листы сохранены.'}
    } catch {
      setMessage('Не удалось сохранить. Введённые данные остались на странице.')
      return {ok:false,message:'Не удалось сохранить. Проверь текущие листы; изменения остались на странице.'}
    }
  }

  function handleEffectEvent(event: EffectEvent) {
    const result = applyEffectEvent(draft, event)
    if (!result.ok) return { ok: false, message: result.message }
    if (result.changed) changeDraft({ ...draft, ...result.state })
    return { ok: true, message: result.changed
      ? 'Наблюдение и запись справочника добавлены в лист. Сохрани персонажа.'
      : 'Новых сведений нет; повторная запись не создана.' }
  }

  function updateBodyPart(key: BodyRegion, part: BodyPart) {
    changeDraft({ ...draft, body: { ...draft.body, parts: { ...draft.body.parts, [key]: { ...part } } } })
  }

  function handleBodyAction(action: BodyAction, gameTime: string) {
    if(action.type==='consciousness'&&draft.body.anatomy?.automatic){const reason=window.prompt('Причина решения мастера о сознании:');if(!reason?.trim())return {ok:false as const,message:'Укажи причину решения мастера.'};try{const next=masterLifeOverride(draft,campaign.seconds,action.value,reason,crypto.randomUUID());onDraftChange(next);return {ok:true as const,body:next.body,health:next.resources.health,message:'Решение мастера записано; сохрани изменения.'}}catch(e){return {ok:false as const,message:(e as Error).message}}}

    const result = applyBodyAction(draft.body, effective.resources.health, action, { id: crypto.randomUUID(), at: new Date().toISOString(), gameTime })
    if (result.ok) changeDraft({ ...draft, body: result.body, resources: { ...draft.resources, health: {current:result.health.current,maximum:draft.resources.health.maximum} } })
    return result
  }

  function exportCharacter() {
    try {
      const text = createCharacterArchive([{ ...draft, id: characterId }], new Date().toISOString())
      downloadJson(text, 'world6-character-' + characterId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) + '.json')
      setMessage('Скачивание JSON текущего листа запрошено. Сохранение в браузере выполняется отдельной кнопкой.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось подготовить экспорт.')
    }
  }

  return (
    <section className="panel character-workspace">
      <div className="w6-workspace-heading"><Illustration value={draft.profile.portrait} fallback="portrait-traveler" alt={'Портрет: '+draft.name} className="w6-hero-portrait"/><div>
        <h2>{draft.name.trim() || 'Без имени'}</h2>
        <p className="w6-copy">{profileSummary(draft.profile)}</p>
        {(draft.profile.magic??[]).some(s=>s.state==='mastered')&&<p className="w6-copy">Освоены: {(draft.profile.magic??[]).filter(s=>s.state==='mastered').map(s=>schoolById(s.schoolId)?.name).join(', ')}</p>}
      </div><ResourceStrip draft={effective}/></div>
      <nav className="w6-workspace-nav" aria-label="Разделы персонажа">
      <div><span>Создание</span>{([['editor','Основа'],['races','Расы и формы'],['skills','Навыки'],['training','Развитие'],['appearance','Внешность · 3D'],['magic','Магия'],['abilities','Способности'],['equipment','Снаряжение'],['body','Анатомия'],['physiology','Физиология'],['rules','Формулы']] as const).map(([key,label])=><button className={'w6-button'+(mode===key?' w6-active':'')} key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div>
      <div><span>Игра</span>{([['play','Игровой лист'],['actions','Действия'],['conditions','Мастер · состояние'],['journal','Личный справочник']] as const).map(([key,label])=><button className={'w6-button'+(mode===key?' w6-active':'')} key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div>
      <div><span>Помощь</span>{([['templates','Примеры'],['guide','Путеводитель']] as const).map(([key,label])=><button className={'w6-button'+(mode===key?' w6-active':'')} key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{label}</button>)}</div>
      </nav>
      {(['races','skills','training','appearance','templates'] as const).map(key=>mode===key&&<CreationPanel key={key} section={key} actor={draft} onChange={a=>changeDraft(a)}/>)}
      {mode==='guide'&&<GuidePanel/>}
      {mode==='conditions'&&<><ConditionPanel master actor={draft} seconds={campaign.seconds} onChange={a=>changeDraft(a)}/><CharacterBodyPanel characterId={characterId} body={draft.body} onPart={updateBodyPart} onAction={handleBodyAction}/></>}
      {mode==='actions'&&<SkillCheckPanel actor={draft} seconds={campaign.seconds} onChange={a=>changeDraft(a)}/>}
      {developmentError(draft)&&<p className="w6-error">{developmentError(draft)}</p>}
      {calculationError&&<p className="w6-error">{calculationError}</p>}
      {mode==='body'&&<AnatomyPanel actor={draft} seconds={campaign.seconds} onChange={onDraftChange}/>}
      {mode==='magic'&&<MagicCatalogPanel characterId={characterId} profile={draft.profile} abilities={draft.rpg.abilities} onChange={profile=>changeDraft({...draft,profile})} onSave={handleSave} onAbilities={()=>setMode('abilities')}/>}

      <div hidden={mode!=='equipment'}><EquipmentPanel actor={draft} campaign={campaign} onChange={onDraftChange} onCampaign={onCampaign}/></div>
      <div hidden={mode!=='abilities'&&mode!=='actions'}><AbilitiesPanel gameMode={mode==='actions'} actor={draft} characters={characters} campaign={campaign} onChange={onDraftChange} onCampaign={onCampaign} onPlan={onPlan}
        onPreview={(ability,target,input)=>makeActionPlan(world,characterId,ability,target,input,crypto.randomUUID())}
        onRelease={cast=>releasePlan(world,characterId,cast,crypto.randomUUID())}
        onInterrupt={cast=>{try{return onWorld(interruptCast(world,characterId,cast,crypto.randomUUID()))}catch(e){return {ok:false,message:(e as Error).message}}}}/></div>
      <div hidden={mode!=='rules'}><RulesPanel actor={draft} seconds={campaign.seconds} onChange={onDraftChange}/></div>
      <div hidden={mode!=='physiology'}><PhysiologyPanel actor={draft} seconds={campaign.seconds} campaign={campaign} onChange={onDraftChange} onCampaign={onCampaign}/></div>

      <div id={'editor-' + characterId} hidden={mode !== 'editor'}>
        <CharacterProfileEditor characterId={characterId} profile={draft.profile} onOpenMagic={()=>setMode('magic')}
          onChange={profile => changeDraft({ ...draft, profile })} />
        <CharacterSheet characterId={characterId} draft={draft}
          onNameChange={updateName} onAttributeChange={updateAttribute}
          onStatisticChange={updateStatistic}
          onMaximumChange={(key, value) => updateResource(key, 'maximum', value)} />
        <div className="w6-fieldset"><h4>Повышение развития</h4><p className="w6-copy">Следующая ступень или ранг автоматически меняют рост атрибутов и ограничения. Оплата обучения и сюжетные условия задаются в кампании.</p><button className="w6-button" disabled={!nextProgression(draft.profile)} onClick={()=>{const profile=nextProgression(draft.profile);if(profile)changeDraft({...draft,profile})}}>Перейти к следующей ступени</button></div>
      </div>

      <div id={'journal-' + characterId} hidden={mode !== 'journal'}>
        <CharacterJournal characterId={characterId} entries={draft.journal}
          onChange={journal => changeDraft({ ...draft, journal })}
          effects={draft.knownEffects} onEffectEvent={handleEffectEvent}
          mechanicalEffects={draft.rpg.effects} seconds={campaign.seconds}
          onRemoveMechanical={id=>{try{return onWorld(removeEffect(world,characterId,id,crypto.randomUUID()))}catch(e){return {ok:false,message:(e as Error).message}}}} />
      </div>
      <div id={'play-' + characterId} hidden={mode !== 'play'}>
        <CharacterPlaySheet characterId={characterId} draft={effective}
          onCurrentChange={(key, value) => updateResource(key, 'current', value)}
          onResourceAction={applyResourceAction} />
        <ConditionPanel actor={draft} seconds={campaign.seconds} onChange={a=>changeDraft(a)}/>
      </div>

      <div className="w6-save">
        {!canSave && <p className="w6-error">
          Проверь имя, профиль, характеристики, ресурсы и записи. Текущее значение
          ресурса должно быть числом от нуля до действующего максимума.
        </p>}
        <div className="w6-buttons">
          <button className="w6-button w6-primary" type="button"
            disabled={!canSave} onClick={handleSave}>Сохранить изменения</button>
          <button className="w6-button" type="button"
            disabled={!canSave} onClick={exportCharacter}>Экспорт этого персонажа</button>
        </div>
        <p className="w6-notice" role="status">{message}</p>
      </div>
    </section>
  )
}

export default CharacterWorkspace
