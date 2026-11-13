import type {SceneAbilityAim} from './sceneAbilityAim'
import type { DeclaredAction } from './actionDeclarations'
import GameHeroHud from './GameHeroHud'
import { lazy, Suspense, useEffect,useLayoutEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import type { PlayerCharacter } from './onlineTypes'
import type { ScenePosition } from './sceneTypes'
import type { PerceivedMap } from './scenePerception'
import type { JournalEntry, KnownEffect } from './characterKnowledge'
import { journalCategories, certaintyOptions } from './characterKnowledge'
import PerceivedScene from './PerceivedScene'
import LobbyWorkbench from './LobbyWorkbench'
import LobbyConversations from './LobbyConversations'
import LobbyDialogue from './LobbyDialogue'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import {NetworkError} from './onlineClient'
import {isKnowledgeCommand,isKnowledgeAck,hasKnowledgeEntry} from './knowledgeCommands'
import type {KnowledgeCommand} from './knowledgeCommands'
import { isSoundJournalEntry } from './roundSound'
const LobbyActionDeclarations = lazy(() => import('./LobbyActionDeclarations'))
type PlayerView = { closed?:boolean; work?: import('./roundWork').PersonalRoundWork[]; seconds?: number; revision: number; hero: PlayerCharacter; map: PerceivedMap | null; canWriteNotes: boolean;
  knowledge: { journal: Omit<JournalEntry, 'artwork' | 'eventKey'>[]; knownEffects: Omit<KnownEffect, 'createdAt' | 'updatedAt' | 'artwork'>[] }; inventory: { id: string; name: string; description: string; quantity: number }[] }
type Note = { title: string; text: string; revision?: number;command?:KnowledgeCommand }
const valid = (v: unknown): v is Note => !!v && typeof v === 'object' && typeof (v as Note).title === 'string' && (v as Note).title.length <= 120 && typeof (v as Note).text === 'string' && (v as Note).text.length <= 8000 && ((v as Note).revision === undefined || Number.isSafeInteger((v as Note).revision))&&((v as Note).command===undefined||isKnowledgeCommand((v as Note).command)&&!(v as Note).command!.disclosure)
export default function LobbyPlayerScreen({ accountId, lobbyId, character, checkingAccess, members,active:tableActive=true }: { accountId: string; lobbyId: string; character: PlayerCharacter; checkingAccess: boolean; members: {id:string;displayName:string}[];active?:boolean }) {
  const { request, refresh } = useOnline(), key = lobbyFormKey('player-note', accountId, lobbyId, character.id)
  const [opened, setOpened] = useState(false), [note, setNote] = useState<Note>(() => readLobbyForm(key, valid) ?? { title: '', text: '' }), [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState(''), [query, setQuery] = useState(''), [pointChoice, setPointChoice] = useState<{sceneId:string;point:ScenePosition} | null>(null), [selectedObject,setSelectedObject]=useState(''), [queue,setQueue]=useState<DeclaredAction[]>([])
  const [abilityAim,setAbilityAim]=useState<SceneAbilityAim|null>(null)
  const [playerSection,setPlayerSection]=useState('actions'),[conversationTarget,setConversationTarget]=useState('')
  const [dialogueUnread,setDialogueUnread]=useState(0)
  const appendSceneAction=useRef<((action:DeclaredAction)=>boolean)|null>(null)
  const active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => {pending.current?.abort();pending.current=null;if(active.current)setBusy(false)}, [request,key])
  const path = '/lobbies/' + lobbyId + '/characters/' + character.id, remote = useRemote<PlayerView>(opened ? path + '/perception' : null)
  const latest=useRef({request,key,note,checkingAccess,loading:remote.loading,value:remote.value})
  useLayoutEffect(()=>{latest.current={request,key,note,checkingAccess,loading:remote.loading,value:remote.value}})
  const acknowledged=!!note.command&&!checkingAccess&&!remote.loading&&remote.value?.hero.id===character.id&&hasKnowledgeEntry(remote.value.knowledge.journal,note.command)
  useEffect(()=>{
    if(!acknowledged)return
    const next={title:'',text:''};writeLobbyForm(key,next);pending.current?.abort();pending.current=null
    // oxlint-disable-next-line react/set-state-in-effect -- The addressed journal entry confirms a durable command whose response was lost.
    setNote(next);setBusy(false);setMessage('Запись подтверждена сохранённым журналом героя.')
  },[acknowledged,key])
  function remember(next: Note) { setNote(next);const saved=writeLobbyForm(key,next);setWarning(saved?'':'Заметка доступна до закрытия страницы: не удалось сохранить её на устройстве.');return saved }
  function edit(patch:Partial<Note>){if(pending.current||note.command)return;remember({...note,revision:note.revision??remote.value?.revision,...patch})}
  async function save() {
    const l=latest.current
    if(!active.current||pending.current||l.key!==key||l.note!==note||l.request!==request||l.checkingAccess||l.loading||!l.value)return
    const source=note
    if(!source.command&&(!l.value.canWriteNotes||!source.title.trim()||!source.text.trim()||source.revision!==undefined&&source.revision!==l.value.revision))return
    const command=source.command??{revision:source.revision??l.value.revision,title:source.title,text:source.text,commandKey:'knowledge:'+crypto.randomUUID()}
    if(!remember({...source,revision:command.revision,command})){setMessage('Освободи место на устройстве перед отправкой: команда повтора не сохранена.');return}
    const abort=new AbortController();pending.current=abort;setBusy(true);setMessage('')
    try {
      const result=await request<{duplicate:boolean}>(path+'/knowledge',{signal:abort.signal,method:'POST',body:JSON.stringify(command)})
      if(!active.current||abort.signal.aborted||pending.current!==abort||latest.current.request!==request||latest.current.key!==key)return
      if(!isKnowledgeAck(result,command,character.id))throw Error('Сервер не подтвердил запись. Текст и команда сохранены для проверки повтором.')
      remember({title:'',text:''});setMessage(result.duplicate?'Прежняя запись подтверждена. Журнал мог измениться после её сохранения.':'Личная заметка записана.');refresh()
    }catch(e){if(active.current&&!abort.signal.aborted){if(e instanceof NetworkError&&[400,403,404,409,413].includes(e.status))remember({...source,revision:command.revision,command:undefined});setMessage((e as Error).message);refresh()}}
    finally{if(active.current&&pending.current===abort){pending.current=null;setBusy(false)}}
  }
  const value = remote.value, pickedPoint = pointChoice?.sceneId === value?.map?.frame.id ? pointChoice?.point ?? null : null, unavailable = checkingAccess || remote.loading || busy, stale = !note.command&&!!(note.title||note.text)&&value && note.revision !== undefined && note.revision !== value.revision
  const entries = value?.knowledge.journal.filter(e => (e.title + ' ' + e.text + ' ' + e.annotation).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))) ?? []
  const observations = value?.knowledge.journal.filter(e=>isSoundJournalEntry(e)||e.title==='Результат осмотра').slice(-3).reverse() ?? []
  return <section className="w6-fieldset gb-player-screen"><h4>Экран героя</h4><button className="w6-button" disabled={checkingAccess || busy} onClick={() => setOpened(!opened)}>{opened ? 'Свернуть экран героя' : 'Открыть экран героя'}</button>
    {opened && <><p role="status">{remote.loading ? 'Загружаем доступные герою сведения…' : remote.error}</p>{value && <>
      <GameHeroHud hero={value.hero} map={value.map} seconds={value.seconds} work={value.work}/><p className="w6-copy">Сведения героя индивидуальны. Мастер управляет раскрытием; выбор отметки не перемещает героя и не тратит время.</p>
      <LobbyWorkbench label={'Разделы героя '+character.name} selectedId={playerSection} onSelectSection={setPlayerSection} sections={[
        {id:'actions',label:'Сцена и действия',content:<>
      {value.map ? <PerceivedScene abilityAim={abilityAim} onObjectMove={value.closed?undefined:(id,point)=>{if(checkingAccess||remote.loading)return false;const accepted=appendSceneAction.current?.({kind:'interact',target:{kind:'object',id},operation:'relocate',destination:point,note:''})??false;setMessage(accepted?'Перемещение добавлено в ход. Положение изменится после исполнения раунда.':'Не удалось добавить перемещение. Проверь очередь действий.');return accepted}} map={value.map} selected={selected} onSelect={id=>{setSelected(id);setSelectedObject('')}} onObject={id=>{setSelectedObject(id);setSelected('')}} selectedObject={selectedObject} pickedPoint={pickedPoint} plannedRoute={queue.flatMap(a=>a.kind==='move'?a.route:[])} onPoint={p=>{setPointChoice({sceneId:value.map!.frame.id,point:p})}}/> : <p className="gb-scene-empty">Мастер ещё не открыл этому герою сцену.</p>}
      {!!observations.length&&<section className="gb-game-feed" aria-label="Последние наблюдения героя">{observations.map(e=><article key={e.id}><strong>{e.title} · {e.gameTime}</strong><p className="w6-prose">{e.text}</p></article>)}</section>}
      <Suspense fallback={<p>Загружаем заявления…</p>}><LobbyActionDeclarations key={JSON.stringify([accountId,lobbyId,character.id])} accountId={accountId} lobbyId={lobbyId} characterId={character.id} checkingAccess={checkingAccess||remote.loading||!!value.closed} selectedContact={selected} pickedPoint={pickedPoint} members={members} map={value.map} selectedObject={selectedObject} onAimChange={setAbilityAim} onQueue={setQueue} sceneActionRef={appendSceneAction}
        onTalk={()=>{setConversationTarget(selected);setPlayerSection('conversations')}}/></Suspense>
        </>},
        {id:'state',label:'Состояние',content:<div className="gb-player-tabs">
<details open><summary>Состояние и возможности</summary>
        {value.hero.resources && <p>{Object.entries(value.hero.resources).map(([k, r]) => <span key={k}>{k === 'mana' ? 'Мана' : k === 'shadow' ? 'Тень' : 'Выносливость'}: {r.current} / {r.maximum} · </span>)}</p>}
        {value.hero.sensations?.map((s, i) => <div key={i}><strong>{s.label}</strong>{s.symptoms.map(x => <p key={x}>{x}</p>)}{s.diagnoses.map(x => <p key={x}>Известный диагноз: {x}</p>)}</div>)}
        {value.hero.capabilities?.map(x => <p key={x}>{x}</p>)}
      </details><details><summary>Инвентарь</summary>{value.inventory.length ? value.inventory.map(i => <p key={i.id}>{i.name} × {i.quantity} · {i.description}</p>) : <p>Инвентарь пуст.</p>}</details>
      <div aria-label="Мои заряды">{value.hero.charges?.map(c=><p key={c.id}>{c.name}: {c.status==='ready'?'готов к отдельному выпуску':'подготовка'}.{c.holding&&<> {c.status==='ready'&&c.holding.remainingSeconds!==null?'Осталось удержания: '+c.holding.remainingSeconds+' с.':''} Расход удержания за мировую секунду: Мана {c.holding.holdCost.mana}, Тень {c.holding.holdCost.shadow}, Выносливость {c.holding.holdCost.stamina}.</>}</p>)}</div><details><summary>Известные способности</summary>{value.hero.abilities?.length ? value.hero.abilities.map(a => <p key={a.id}><strong>{a.name}</strong> · {a.description}</p>) : <p>Нет утверждённых способностей.</p>}</details>
        </div>},
        {id:'conversations',label:'Разговоры'+(dialogueUnread?' ('+dialogueUnread+')':''),content:<>
          <LobbyDialogue key={character.id+':'+conversationTarget} accountId={accountId} lobbyId={lobbyId} characterId={character.id} contactId={conversationTarget}
            active={tableActive&&playerSection==='conversations'} onUnreadChange={setDialogueUnread} checkingAccess={checkingAccess||remote.loading} />
          <details><summary>Реплики исполненных раундов</summary><LobbyConversations journal={value.knowledge.journal}/></details>
        </>},
        {id:'journal',label:'Журнал',content:<div className="gb-player-tabs">
      <details open><summary>Знания и журнал</summary><label className="w6-field"><span>Поиск в журнале героя</span><input aria-label="Поиск в журнале героя" value={query} onChange={e => setQuery(e.currentTarget.value)}/></label>
        <p className="w6-copy">Показаны последние {Math.min(20, entries.length)} из {entries.length} подходящих записей.</p>
        {entries.slice(-20).reverse().map(e => <article className="gb-journal-entry" key={e.id}><h4>{e.title}</h4><small>{journalCategories.find(c => c.key === e.category)?.label} · {certaintyOptions.find(c => c.key === e.certainty)?.label} · {e.source} · {e.gameTime}</small><p className="w6-prose">{e.text}</p>{e.annotation && <p className="w6-prose">Примечание: {e.annotation}</p>}</article>)}
        {value.knowledge.knownEffects.map(e => <article key={e.id}><strong>{e.title}</strong><p>{e.description}</p><small>{e.perception === 'identified' ? 'Распознанное воздействие' : 'Ощущение без точного диагноза'} · {e.status === 'ended' ? 'Завершено' : 'Наблюдается'}</small></article>)}
        {value.canWriteNotes ? <fieldset disabled={unavailable||!!note.command}><legend>Личная заметка</legend><label className="w6-field"><span>Заголовок заметки</span><input aria-label="Заголовок заметки" maxLength={120} value={note.title} onChange={e => edit({title:e.currentTarget.value})}/></label>
          <label className="w6-field"><span>Текст личной заметки</span><textarea aria-label="Текст личной заметки" rows={4} maxLength={8000} value={note.text} onChange={e => edit({text:e.currentTarget.value})}/></label>
          <p className="w6-copy">Личная запись помечается как предположение и не меняет факты мастера.</p>
          {stale && <><p role="alert">Кампания изменилась. Проверь заметку перед отправкой.</p><button className="w6-button" onClick={() => remember({ ...note, revision: value.revision })}>Заметка проверена с текущей версией</button></>}
          {!note.command&&<button className="w6-button" disabled={!note.title.trim() || !note.text.trim() || !!stale} onClick={() => void save()}>Записать личную заметку</button>}
        </fieldset> : <p className="w6-copy">{value.closed?'Игра завершена. Журнал и сведения героя доступны для чтения.':'Управление передано: сведения доступны для чтения, заметки записывает действующий управляющий.'}</p>}
        {note.command&&<div role="status"><p>Запись ожидает подтверждения. Повтор проверит ту же команду без второй заметки.</p><button className="w6-button" disabled={unavailable} onClick={()=>void save()}>Проверить запись заметки</button></div>}
      </details>        </div>},
      ]}/>
    </>}{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p></>}
  </section>
}
