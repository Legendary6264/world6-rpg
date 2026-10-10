import ActionReview from './ActionReview'
import { Illustration } from './VisualElements'
import { recalculateLife, applyAutomaticLife } from './rpgEngine'
import './atlasStyle.css'
import CampaignPanel from './CampaignPanel'
import SceneEditor from './SceneEditor'
import { pruneSceneActors, sceneReferencesValid } from './scenes'
import { prunePerceptions, perceptionReferencesValid } from './scenePerception'
import type { SceneState } from './sceneTypes'
import { assertCampaignSize } from './campaignLimits'
import CharacterErrorBoundary from './CharacterErrorBoundary'
import { emptyCampaign, emptyItem, emptyAbility, emptyPhysiology, isCampaign } from './rpgSchema'
import type { Campaign } from './rpgTypes'
import { effectiveActor, instantiateItem, worldFingerprint } from './rpgEngine'
import type { Actor, Plan, PlanResult, World } from './rpgEngine'
import { useState, useRef, useEffect } from 'react'
import CharacterWorkspace from './CharacterWorkspace'
import CharacterImportPanel from './CharacterImportPanel'
import { createDefaultCharacter, isCharacterDraft, normalizeCharacterDraft } from './characterModel'
import type { CharacterDraft, ReadyCharacterDraft, SavedCharacter } from './characterModel'
import { addImportedCharacters, createCharacterArchive, downloadJson } from './characterTransfer'
import { blockedLoad, readCharacters, writeCharacters } from './characterStorage'
import type { LoadResult } from './characterStorage'
import './characterViews.css'

function loadCharacters(): LoadResult {
  try {
    return readCharacters(window.localStorage)
  } catch {
    return blockedLoad()
  }
}

type ManagerProps={initialWorld?:World;onRemotePublish?:(world:World)=>Promise<string>;onDraftChange?:(world:World)=>void;remotePublishDisabled?:boolean}
function CharacterManager({initialWorld,onRemotePublish,onDraftChange,remotePublishDisabled}:ManagerProps) {
  const [initial] = useState<LoadResult>(()=>initialWorld?{characters:initialWorld.characters,campaign:initialWorld.campaign,message:'Кампания загружена с сервера.',blocked:false}:loadCharacters())
  const [publishing,setPublishing]=useState(false)
  const [characters, setCharacters] = useState<Actor[]>(()=>initial.characters.map(c=>({...normalizeCharacterDraft(c),id:c.id})))
  const [campaign,setCampaign]=useState<Campaign>(()=>initial.campaign??emptyCampaign())
  const [dirty,setDirty]=useState(false)
  const [plan,setPlan]=useState<Plan|null>(null)
  const confirmed=useRef(new Set<string>())
  const world:World={characters,campaign}
  const [activeId, setActiveId] = useState<string | null>(initial.characters[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState(initial.message)

  useEffect(()=>{onDraftChange?.({characters,campaign})},[characters,campaign,onDraftChange])

  function commitWorld(next:World) {
    if(initial.blocked)throw new Error('Запись заблокирована.')
    if(!perceptionReferencesValid(next.campaign.perceptions,next.campaign.scenes,next.characters.map(c=>c.id)) || next.characters.length>200 || !isCampaign(next.campaign) || !sceneReferencesValid(next.campaign.scenes,next.characters.map(c=>c.id)))throw new Error('Проверь состав кампании и персонажей на сценах.')
    // Перед записью ограничиваем текущие запасы, не переписывая ручные максимумы.
    for(const c of next.characters){
      if(!isCharacterDraft(c))throw new Error('Исправь незавершённые поля всех героев перед сохранением.')
      const effective=effectiveActor(c,next.campaign.seconds)
      for(const k of ['health','mana','shadow','stamina'] as const)c.resources[k].current=effective.resources[k].current
      applyAutomaticLife(c,next.campaign.seconds,crypto.randomUUID())
    }
    if(!onRemotePublish)writeCharacters(window.localStorage,next.characters,next.campaign)
    setCharacters(next.characters);setCampaign(next.campaign);setDirty(false)
  }
  function persistCharacters(next:SavedCharacter[]) {commitWorld({characters:next.map(c=>({...normalizeCharacterDraft(c),id:c.id})),campaign:{...campaign,revision:campaign.revision+1,...(campaign.perceptions?{perceptions:prunePerceptions(campaign.perceptions,campaign.scenes,next.map(c=>c.id))}:{}),...(campaign.scenes?{scenes:pruneSceneActors(campaign.scenes,next.map(c=>c.id))}:{})}})}
  function changeScenes(scenes:SceneState){
    try{
      if(initial.blocked)throw new Error('Сначала восстанови доступ к сохранению.')
      const next={...campaign,revision:campaign.revision+1,scenes,...(campaign.perceptions?{perceptions:prunePerceptions(campaign.perceptions,scenes,characters.map(c=>c.id))}:{})}
      if(!isCampaign(next)||!sceneReferencesValid(scenes,characters.map(c=>c.id)))throw new Error('Проверь сцену и персонажей.')
      assertCampaignSize({characters,campaign:next})
      // Scene setup must not recalculate physiology, heal or advance game time.
      if(!onRemotePublish)writeCharacters(window.localStorage,characters,next)
      setCampaign(next)
      setDirty(!!onRemotePublish)
      return {ok:true,message:onRemotePublish?'Расстановка сохранена в черновике этого лобби.':'Расстановка сохранена на устройстве.'}
    }catch(e){return {ok:false,message:(e as Error).message}}
  }
  function changeCharacter(actor:Actor){
    if(isCharacterDraft(actor)){try{const capped=effectiveActor(actor,campaign.seconds);actor=recalculateLife({...normalizeCharacterDraft(actor),id:actor.id},campaign.seconds,crypto.randomUUID());for(const k of ['health','mana','shadow','stamina'] as const)actor.resources[k].current=capped.resources[k].current}catch{/* Незавершённую формулу можно исправить в редакторе. */}}
    setCharacters(previous=>previous.map(c=>c.id===actor.id?actor:c));setCampaign(previous=>({...previous,revision:previous.revision+1}));setDirty(true)}
  function changeCatalog(next:Campaign){
    try{if(initial.blocked||!isCampaign(next))throw new Error('Проверь каталог.')
      // Каталог находится в том же снимке, что герои. Не теряем текущие черновики.
      commitWorld({characters:characters.map(c=>({...normalizeCharacterDraft(c),id:c.id})),campaign:{...next,revision:campaign.revision+1}})
      return {ok:true,message:'Каталог и текущие листы сохранены.'}
    }catch(e){return {ok:false,message:(e as Error).message}}
  }
  function showPlan(result:PlanResult){if(result.ok){setPlan(result.plan);setMessage('Предварительный результат готов.')}else setMessage(result.message)}
  function applyWorld(next:World){try{commitWorld(next);setMessage('Результат сохранён вместе с ресурсами, целью и часами.');return {ok:true,message:'Изменения применены и сохранены.'}}catch(e){setMessage((e as Error).message);return {ok:false,message:(e as Error).message}}}
  function confirmPlan(){if(!plan||confirmed.current.has(plan.eventId))return;if(worldFingerprint(world)!==plan.fingerprint){setMessage('Листы или часы изменились. Рассчитай результат заново.');setPlan(null);return}const r=applyWorld(plan.world);if(r.ok){confirmed.current.add(plan.eventId);setPlan(null)}}
  function examples(){
    try{if(characters.length>198)throw new Error('Нет места для двух примеров.')
      const base=(name:string):Actor=>{const d={...createDefaultCharacter(),name,id:crypto.randomUUID()};for(const p of Object.values(d.body.parts)){p.current=100;p.maximum=100}d.resources.mana={current:'100',maximum:'100'};d.rpg.physiology={...emptyPhysiology(),race:'Человек — учебный профиль',normalMl:5000,currentMl:5000};d.rpg.impact.torso={thresholdJ:5,joulesPerHp:5,referenceCm2:10};return d}
      const caster=base('Учебный маг'),target=base('Учебная цель')
      const stone={...emptyAbility(),name:'Учебный запуск камня',description:'Тестовая модель тупого удара. Не окончательный баланс.',mechanism:'stone' as const,rangeM:20,cost:{mana:2,shadow:0,stamina:0},id:crypto.randomUUID()}
      caster.rpg.abilities=[{...stone,id:crypto.randomUUID(),templateId:stone.id,approved:true}]
      const soft={...emptyItem(),name:'Учебная мягкая защита',slot:'body' as const,layer:0,covers:['torso'],massKg:1,absorptionJ:20,transmission:0.5,joulesPerWear:10,id:crypto.randomUUID()}
      const hard={...emptyItem(),name:'Учебная жёсткая защита',slot:'body' as const,layer:1,covers:['torso'],massKg:3,absorptionJ:100,transmission:0.1,joulesPerWear:20,id:crypto.randomUUID()}
      target.rpg.inventory=[instantiateItem(soft,crypto.randomUUID()),instantiateItem(hard,crypto.randomUUID())]
      commitWorld({characters:[...characters.map(c=>({...normalizeCharacterDraft(c),id:c.id})),caster,target],campaign:{...campaign,revision:campaign.revision+1,items:[...campaign.items,soft,hard],abilities:[...campaign.abilities,stone]}})
      setActiveId(caster.id);return {ok:true,message:'Учебные герои и шаблоны добавлены.'}
    }catch(e){return {ok:false,message:(e as Error).message}}
  }

  function createCharacter() {
    const draft = { ...createDefaultCharacter(), name: newName.trim() }
    if (!isCharacterDraft(draft)) {
      setMessage('Укажи имя: от 1 до 40 символов.')
      return
    }
    try {
      const character = { ...draft, id: crypto.randomUUID() }
      persistCharacters([...characters, character])
      setActiveId(character.id)
      setNewName('')
      setMessage('Новый персонаж создан и сохранён.')
    } catch {
      setMessage('Не удалось создать и сохранить персонажа.')
    }
  }

  function saveCharacter(id:string,draft:CharacterDraft){
    persistCharacters(characters.map(c=>c.id===id?{...normalizeCharacterDraft(draft),id}:c))
    setMessage('Все текущие листы и настройки сохранены.')
  }

  function deleteCharacter(id: string) {
    const character = characters.find(item => item.id === id)
    if (!character) return
    if (!window.confirm('Удалить персонажа «' + character.name + '»? ' +
      'Сохранённые данные и несохранённые изменения этого героя будут удалены.')) return

    const next = characters.filter(item => item.id !== id).map(c=>{
      const n={...normalizeCharacterDraft(c),id:c.id}
      n.rpg.casts=n.rpg.casts.map(cast=>cast.targetId===id&&['preparing','ready','maintaining'].includes(cast.status)?{...cast,status:'interrupted' as const}:cast)
      n.rpg.effects=n.rpg.effects.filter(e=>e.ownerId!==id)
      return n
    })
    try {
      persistCharacters(next)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      setMessage('Персонаж «' + character.name + '» удалён.')
    } catch {
      setMessage('Не удалось сохранить удаление. Персонаж остался в списке.')
    }
  }

  function importCharacters(imported: ReadyCharacterDraft[]) {
    const next = addImportedCharacters(characters, imported, () => crypto.randomUUID())
    for(const c of next.slice(characters.length)){
      if(c.rpg){c.rpg.casts=c.rpg.casts.map(x=>({...x,status:'interrupted' as const}));c.rpg.effects=c.rpg.effects.filter(e=>!e.ownerId&&!e.castId)}
    }
    persistCharacters(next)
    setActiveId(next[characters.length].id)
    setMessage('Добавлено независимых копий: ' + imported.length + '. Незавершённые применения прерваны; связанные эффекты не переносятся на чужие цели.')
  }

  function backupCharacters() {
    const at = new Date().toISOString()
    const text = createCharacterArchive(characters, at, campaign)
    downloadJson(text, 'world6-backup-' + at.slice(0, 10) + '.json')
  }

  return (
    <div className="character-manager"><header className="w6-atlas-banner"><div><p className="w6-eyebrow">Летопись персонажей</p><h1>Мир 6</h1><p>Тело, магия и история твоего героя</p></div></header>
      {onRemotePublish&&<section className="panel w6-remote-publish"><h2>Редактор общей кампании</h2><p className="w6-copy">Изменения готовятся в этом черновике. Публикация отправляет их участникам и проверяет версию кампании на сервере.</p><button className="w6-button w6-primary" disabled={publishing||remotePublishDisabled} onClick={async()=>{setPublishing(true);try{setMessage(await onRemotePublish(world));setDirty(false)}catch(e){setMessage((e as Error).message)}finally{setPublishing(false)}}}>{publishing?'Публикуем…':'Опубликовать изменения кампании'}</button></section>}
      <details className="panel w6-world-settings"><summary>Игра и настройки лобби / мира</summary><CampaignPanel remote={!!onRemotePublish} world={world} onPlan={showPlan} onRestore={applyWorld} onExamples={examples}/></details>
      <SceneEditor value={campaign.scenes} actors={characters} onChange={changeScenes} disabled={initial.blocked}/>
      <p className="w6-notice">{dirty?'Есть несохранённые изменения листов.':onRemotePublish?'Черновик кампании подготовлен. Публикация выполняется отдельной кнопкой.':'Текущие изменения сохранены.'}</p>
      {plan&&<div className="w6-modal-backdrop"><section className="w6-modal" role="dialog" aria-modal="true" aria-labelledby="plan-title"><h2 id="plan-title">Предварительный результат</h2><h3>{plan.text}</h3><ActionReview before={world} after={plan.world}/><details className="w6-fieldset"><summary>Подробный расчёт и основания</summary><p className="w6-prose">{plan.details}</p></details><p className="w6-copy">До подтверждения ресурсы и цель не изменяются. При изменении листов расчёт потребуется повторить.</p><div className="w6-buttons"><button className="w6-button w6-primary" type="button" onClick={confirmPlan}>Подтвердить и сохранить результат</button><button className="w6-button" type="button" onClick={()=>setPlan(null)}>Отмена расчёта</button></div></section></div>}
      <section className="panel">
        <h2>Мои персонажи</h2>
        <form className="w6-create" onSubmit={event => {
          event.preventDefault()
          createCharacter()
        }}>
          <label className="w6-field" htmlFor="new-character-name">
            <span>Имя нового героя</span>
            <input id="new-character-name" type="text" maxLength={40}
              value={newName} disabled={initial.blocked} placeholder="Введи имя"
              onChange={event => setNewName(event.currentTarget.value)} />
          </label>
          <button className="w6-button w6-primary" type="submit"
            disabled={initial.blocked || newName.trim().length === 0}>
            Создать персонажа
          </button>
        </form>
        <p className="w6-notice" role="status">{message}</p>
        <CharacterImportPanel disabled={initial.blocked} savedCount={characters.length}
          onImport={importCharacters} onBackup={backupCharacters} />
        {characters.length === 0 && !initial.blocked &&
          <p>Персонажей пока нет. Создай первого героя.</p>}
        <div className="w6-character-list">
          {characters.map(character => (
            <article className="w6-character-card" key={character.id}>
              <Illustration value={character.profile.portrait} fallback="portrait-traveler" className="w6-roster-portrait"/><h3>{character.name}</h3>
              <div className="w6-buttons">
                <button type="button"
                  className={activeId === character.id ? 'w6-button w6-active' : 'w6-button'}
                  aria-expanded={activeId === character.id}
                  aria-controls={'workspace-' + character.id}
                  onClick={() => setActiveId(character.id)}>Открыть</button>
                <button type="button" className="w6-button w6-danger"
                  aria-label={'Удалить персонажа ' + character.name}
                  onClick={() => deleteCharacter(character.id)}>Удалить</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {characters.map(character => (
        <div id={'workspace-' + character.id} key={character.id}
          hidden={activeId !== character.id}>
          <CharacterWorkspace characterId={character.id} draft={character}
            characters={characters} campaign={campaign} onDraftChange={changeCharacter}
            onCampaign={changeCatalog} onPlan={showPlan} onWorld={applyWorld}
            remote={!!onRemotePublish} onSave={draft => saveCharacter(character.id, draft)} />
        </div>
      ))}
    </div>
  )
}

export default function CharacterManagerWithRecovery(props:ManagerProps){return <CharacterErrorBoundary><CharacterManager {...props}/></CharacterErrorBoundary>}
