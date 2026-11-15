import { listeningFocusLabel } from './roundListening'
import type { RuleActor, RuleSceneObject } from './roundRuleForms'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { useRemote } from './onlineHooks'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import { actionSummary } from './actionDeclarations'
import type { ActionDeclarations, DeclarationEntry } from './actionDeclarations'
import LobbyRoundTimeline from './LobbyRoundTimeline'
import type { RoundWork } from './roundWork'
import type { AcousticScene } from './acoustics'
import {NetworkError} from './onlineClient'
import {isDeclarationTransitionCommand,isDeclarationTransitionAck,declarationTransitionRequest,declarationTransitionLabels,declarationTransitionSuccess} from './declarationTransitions'
import type {DeclarationTransitionCommand,DeclarationTransitionIntent} from './declarationTransitions'
type MasterView = { revision: number; generation?:number; rulesStamp?:string; paused?: boolean; roundWork?: RoundWork; executed?: boolean; acoustics?: AcousticScene; movementBodies?: {sceneId:string;actorId:string;diameter:number;x?:number;y?:number;z?:number}[]; declarations: ActionDeclarations; scenes: { id: string; name: string; objects: RuleSceneObject[] }[]; actors: (RuleActor & {approved:boolean;items:{id:string;name:string}[];abilities:{id:string;name:string}[]})[] }
type Draft = { sceneId: string; duration: string; allowReplace: boolean; participantIds: string[]; revision?: number;
  command?:DeclarationTransitionCommand;returns: Record<string, { text: string; collectionId: string; epoch: number; baseVersion: number;generation?:number }> }
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && (() => { const d = v as Draft; return typeof d.sceneId === 'string' && typeof d.duration === 'string' && d.duration.length <= 40 &&
  typeof d.allowReplace === 'boolean' && Array.isArray(d.participantIds) && d.participantIds.length <= 200 && d.participantIds.every(id => typeof id === 'string') &&
  (d.revision === undefined || Number.isSafeInteger(d.revision)) && (d.command===undefined||isDeclarationTransitionCommand(d.command)) && !!d.returns && typeof d.returns === 'object' && Object.keys(d.returns).length <= 200 && Object.values(d.returns).every(r => r && typeof r.text === 'string' && r.text.length <= 2000 && typeof r.collectionId === 'string' && Number.isSafeInteger(r.epoch) && Number.isSafeInteger(r.baseVersion)&&(r.generation===undefined||Number.isSafeInteger(r.generation)&&r.generation>0)) })()
export default function LobbyDeclarationsMaster({ accountId, lobbyId, checkingAccess, members }: { accountId: string; lobbyId: string; checkingAccess: boolean; members: {id:string;displayName:string}[] }) {
  const { request, refresh } = useOnline(), path = '/lobbies/' + lobbyId + '/declarations', key = lobbyFormKey('declarations-master', accountId, lobbyId)
  const [opened, setOpened] = useState(false), remote = useRemote<MasterView>(opened ? path : null)
  const [draft, setDraft] = useState(() => readLobbyForm(key, valid) ?? { sceneId: '', duration: '', allowReplace: true, participantIds: [], returns: {} })
  const [busySource,setBusy]=useState<{request:typeof request;key:string}|null>(null), [message, setMessage] = useState(''), [warning, setWarning] = useState(''), active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => {pending.current?.abort();pending.current=null}, [request,key])
  const value = remote.value, c = value?.declarations.active,busy=busySource?.request===request&&busySource.key===key, disabled = busy || checkingAccess || remote.loading || !!value?.paused || !!draft.command, duration = Number(draft.duration.replace(',', '.'))
  const latest=useRef({request,key,checkingAccess,loading:remote.loading,value,draft})
  useLayoutEffect(()=>{latest.current={request,key,checkingAccess,loading:remote.loading,value,draft}})
  function remember(next: Draft) { const stored = { ...next, revision: next.revision ?? value?.revision }; setDraft(stored);const saved=writeLobbyForm(key,stored); setWarning(saved ? '' : 'Черновик не сохранён на устройстве. Не закрывай страницу.');return saved }
  async function send(intent?:DeclarationTransitionIntent) {
    const current=latest.current
    if(!active.current||pending.current||current.key!==key||current.request!==request||current.draft!==draft||current.checkingAccess||current.loading||!value||current.value!==value||draft.command&&intent||!draft.command&&(!intent||value.paused))return
    let command=draft.command
    if(!command){
      if(typeof value.generation!=='number'||!Number.isSafeInteger(value.generation)||value.generation<1){setMessage('Сервер не подтвердил версию управления раундами. Обнови сервер игры.');return}
      command={...intent!,generation:value.generation,commandKey:'roundflow:'+crypto.randomUUID()}
    }
    if(!isDeclarationTransitionCommand(command)){setMessage('Проверь параметры управления раундом.');return}
    if(!remember({...draft,command})){writeLobbyForm(key,draft);setDraft(draft);setMessage('Команда не отправлена: не удалось сохранить её для повтора. Освободи место на устройстве.');return}
    const abort = new AbortController(),target=declarationTransitionRequest('/lobbies/'+lobbyId,command); pending.current = abort; setBusy({request,key});setMessage('')
    try {
      const result=await request<unknown>(target.path,{method:target.method,signal:abort.signal,body:JSON.stringify(command)})
      if(!active.current||abort.signal.aborted||latest.current.key!==key||latest.current.request!==request)return
      if(!isDeclarationTransitionAck(result,command))throw Error('Сервер не подтвердил эту команду раунда. Проверь её результат повтором.')
      remember({...draft,command:undefined});setMessage(result.duplicate?'Получено подтверждение прежней команды: '+declarationTransitionLabels[command.operation]+'. Текущий раунд мог измениться позже.':declarationTransitionSuccess[command.operation]);refresh()
    } catch (e) {
      if(active.current&&!abort.signal.aborted&&latest.current.key===key&&latest.current.request===request){
        const rejected=e instanceof NetworkError&&[400,409,413].includes(e.status)
        if(rejected)remember({...draft,command:undefined})
        setMessage((e as Error).message+(rejected?' Проверь текущее состояние перед новой командой.':' Команда сохранена для проверки повтором.'));refresh()
      }
    } finally { if (active.current && pending.current === abort) {pending.current=null;setBusy(null)} }
  }
  function phase(operation:'close'|'reopen'|'archive') { if (c) void send({ collectionId: c.id, epoch: c.epoch, operation }) }
  const stale = value && draft.revision !== undefined && draft.revision !== value.revision
  const name = (id: string) => value?.actors.find(a => a.id === id)?.name ?? 'Удалённый герой'
  const authorName = (id: string) => members.find(m => m.id === id)?.displayName ?? 'Бывший участник'
  const objectName = (id: string) => value?.scenes.find(s => s.id === c?.sceneId)?.objects.find(o => o.id === id)?.name ?? 'Прежний объект'
  function returnDraft(e: DeclarationEntry, text: string) { if (!c) return; const old = draft.returns[e.actorId]; remember({ ...draft, returns: { ...draft.returns, [e.actorId]: { text, collectionId: old?.collectionId ?? c.id, epoch: old?.epoch ?? c.epoch, baseVersion: old?.baseVersion ?? e.revision,generation:old?.generation??value?.generation } } }) }
  return <section className="w6-fieldset"><h3>Приём заявлений</h3><button className="w6-button" disabled={checkingAccess||busy} onClick={() => setOpened(!opened)}>{opened ? 'Свернуть приём заявлений' : 'Открыть инструменты заявлений'}</button>
    {!opened&&draft.command&&<p role="status">Переход раунда ожидает подтверждения. Открой инструменты для проверки.</p>}
    {opened && <>{value?.paused&&<p role="status">Кампания на паузе. Приём и исполнение продолжатся после решения мастера.</p>}<p role="status">{remote.loading ? 'Проверяем заявления и права…' : remote.error}</p><p className="w6-copy">Сначала игроки отправляют планы, затем мастер закрывает приём и проверяет время и последствия. Мир изменится после применения рассчитанного раунда. Отсутствие заявления не назначает герою штраф или пропуск.</p>
      {draft.command&&<section aria-label="Проверка команды раунда"><p>Ожидает подтверждения: {declarationTransitionLabels[draft.command.operation]}. Повтор проверит исходную команду без второго перехода.</p><button type="button" className="w6-button" disabled={checkingAccess||busy||remote.loading||!value} onClick={()=>void send()}>Проверить команду раунда</button></section>}
      {value && <>{c ? <><h4>{c.sceneName} · {c.phase === 'open' ? 'приём открыт' : c.phase === 'closed' ? 'приём закрыт' : 'сцена удалена'}</h4><p>Длительность раунда: {c.durationSeconds} с · {c.allowReplace ? 'Игроки могут заменять планы до закрытия.' : 'Изменение после возврата мастером.'}</p>
        <p className="gb-round-readiness">Получено ходов: {c.entries.filter(e=>e.status==='submitted').length} / {c.participantIds.length}{c.participantIds.every(id=>c.entries.some(e=>e.actorId===id&&e.status==='submitted'))?' · все готовы':''}</p>
        <div className="w6-buttons">{c.phase === 'open' ? <button className="w6-button" disabled={disabled} onClick={() => phase('close')}>Закрыть приём заявлений</button> : <>{c.phase === 'closed' && !value.executed && <button className="w6-button" disabled={disabled} onClick={() => phase('reopen')}>Открыть приём повторно</button>}<button className="w6-button" disabled={disabled} onClick={() => { if (window.confirm('Сохранить этот сбор в истории? Это не исполнит действия и не продвинет время.')) phase('archive') }}>Сохранить сбор в истории</button></>}</div>
        {c.phase==='closed'&&value.executed&&<div className="gb-next-round"><p>Раунд применён. Следующий сохранит эту сцену, длительность и состав участников; прежние ходы останутся в истории.</p><button className="w6-button w6-primary" disabled={disabled} onClick={()=>void send({operation:'next',revision:value.revision,collectionId:c.id,epoch:c.epoch})}>Начать следующий раунд</button></div>}
        {c.phase === 'closed' && <LobbyRoundTimeline key={JSON.stringify([accountId, lobbyId, c.id])} accountId={accountId} lobbyId={lobbyId} collection={c} revision={value.revision} rulesStamp={value.rulesStamp} checkingAccess={disabled} roundWork={value.roundWork ?? {version:1,entries:[]}} executed={!!value.executed} actors={value.actors} movementBodies={value.movementBodies ?? []} acoustics={value.acoustics} objects={value.scenes.flatMap(s => s.objects.map(o => ({...o,sceneId:s.id})))}/>}
        {c.participantIds.map(id => { const e = c.entries.find(e => e.actorId === id), r = draft.returns[id], old = r && (r.collectionId !== c.id || r.epoch !== c.epoch || r.baseVersion !== e?.revision || r.generation!==undefined&&r.generation!==value.generation)
          return <article className="gb-journal-entry" key={id}><h4>{name(id)} · {e?.status === 'submitted' ? 'заявление получено' : e?.status === 'returned' ? 'возвращено' : 'заявления нет'}</h4>
            {e?.actions.map((a, i) => <p key={i}>{i + 1}. {actionSummary(a)}{a.kind==='wait'&&a.listening?' · '+listeningFocusLabel(a.listening,value.scenes.filter(s=>s.id===c.sceneId).flatMap(s=>s.objects)):''}{'target' in a && (a.target.kind === 'contact' ? ' · контакт героя' : a.target.kind === 'object' ? ' · ' + objectName(a.target.id) : a.target.kind === 'point' ? ` · точка (${a.target.point.x}; ${a.target.point.y}; ${a.target.point.z})` : a.target.kind === 'self' ? ' · на себя' : ' · без конкретной цели')}{a.kind === 'item' ? ' · ' + (value.actors.find(x => x.id === id)?.items.find(x => x.id === a.itemId)?.name ?? 'Прежний предмет') : a.kind === 'ability' ? ' · ' + (value.actors.find(x => x.id === id)?.abilities.find(x => x.id === a.abilityId)?.name ?? 'Прежняя способность') : ''}{e.resolved.find(x => x.index === i)?.actorId && ' · персонаж: ' + name(e.resolved.find(x => x.index === i)!.actorId!)}{a.note && ' · ' + a.note}</p>)}
            {e && <small>Инициатор: {authorName(e.submittedBy)} · версия {e.revision}</small>}{e?.note && <p>Замечание: {e.note}</p>}
            {c.phase === 'open' && e?.status === 'submitted' && <fieldset disabled={disabled}><legend>Возврат плана</legend><textarea aria-label={'Замечание к заявлению ' + name(id)} maxLength={2000} value={r?.text ?? ''} onChange={event => returnDraft(e, event.currentTarget.value)}/>
              {old && <><p role="alert">Заявление, приём или сохранённая кампания изменились. Проверь замечание.</p><button className="w6-button" onClick={() => remember({ ...draft, returns: { ...draft.returns, [id]: { ...r, collectionId: c.id, epoch: c.epoch, baseVersion: e.revision,generation:value.generation } } })}>Замечание к плану проверено</button></>}
              <button className="w6-button" disabled={!r?.text.trim() || !!old} onClick={() => void send({operation:'return',actorId:id,collectionId:r.collectionId,epoch:r.epoch,baseVersion:r.baseVersion,note:r.text})}>Вернуть заявление {name(id)}</button>
            </fieldset>}</article> })}
        <details><summary>История сбора ({c.history.length})</summary>{c.history.slice(-30).reverse().map(e => <p key={e.id}>{e.at} · {({ open: 'приём открыт', close: 'приём закрыт', reopen: 'приём открыт повторно', submit: 'заявление', withdraw: 'заявление снято', return: 'возврат' }[e.kind])} · {authorName(e.authorId)}{e.entry && <span> · {e.entry.actorName}: {e.entry.actions.map(actionSummary).join('; ')}</span>}</p>)}</details>
      </> : <fieldset disabled={disabled}><legend>Новый сбор</legend><label className="w6-field"><span>Сцена приёма</span><select aria-label="Сцена приёма" value={draft.sceneId} onChange={e => remember({ ...draft, sceneId: e.currentTarget.value })}><option value="">Выбери сцену</option>{value.scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="w6-field"><span>Длительность раунда, с</span><input aria-label="Длительность раунда, с" inputMode="decimal" value={draft.duration} onChange={e => remember({ ...draft, duration: e.currentTarget.value })}/></label><p className="w6-copy">Задаёт мастер; автоматической формулы темпа пока нет. Длительность сохраняется для следующих сборов этой сцены.</p>
        <label><input type="checkbox" aria-label="Разрешить замену заявления" checked={draft.allowReplace} onChange={e => remember({ ...draft, allowReplace: e.currentTarget.checked })}/> Разрешить замену плана до закрытия приёма</label>
        <fieldset><legend>Участники сбора</legend>{value.actors.filter(a => a.approved).map(a => <label key={a.id} className="gb-disclosure-row"><input type="checkbox" aria-label={'Участник сбора ' + a.name} checked={draft.participantIds.includes(a.id)} onChange={e => remember({ ...draft, participantIds: e.currentTarget.checked ? [...draft.participantIds, a.id] : draft.participantIds.filter(id => id !== a.id) })}/>{a.name}</label>)}</fieldset>
        {stale && <><p role="alert">Кампания изменилась. Проверь участников и настройки.</p><button className="w6-button" onClick={() => remember({ ...draft, revision: value.revision })}>Настройки приёма проверены</button></>}
        <button className="w6-button" disabled={!draft.sceneId || !draft.participantIds.length || !Number.isFinite(duration) || duration <= 0 || duration > 86400 || !!stale} onClick={() => void send({operation:'open',revision:draft.revision??value.revision,sceneId:draft.sceneId,participantIds:draft.participantIds,durationSeconds:duration,allowReplace:draft.allowReplace})}>Начать приём заявлений</button>
      </fieldset>}
      {!!value.declarations.archive.length && <details><summary>Предыдущие сборы ({value.declarations.archive.length})</summary>{value.declarations.archive.map(a => <article key={a.id}><h4>{a.sceneName} · {a.entries.filter(e => e.status === 'submitted').length} заявлений</h4>{a.entries.map(e => <p key={e.actorId}>{e.actorName}: {e.actions.map(actionSummary).join('; ')}</p>)}</article>)}</details>}
      </>}{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p></>}
  </section>
}
