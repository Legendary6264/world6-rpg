import { useEffect,useLayoutEffect, useRef, useState } from 'react'
import { useOnline } from './onlineContext'
import { journalCategories, certaintyOptions } from './characterKnowledge'
import type { JournalCategory, KnowledgeCertainty } from './characterKnowledge'
import { lobbyFormKey, readLobbyForm, writeLobbyForm } from './lobbyFormDrafts'
import {NetworkError} from './onlineClient'
import {isKnowledgeCommand,isKnowledgeAck} from './knowledgeCommands'
import type {KnowledgeCommand} from './knowledgeCommands'
type Draft = { title: string; text: string; category: JournalCategory; certainty: KnowledgeCertainty; revision: number;command?:KnowledgeCommand }
const valid = (v: unknown): v is Draft => !!v && typeof v === 'object' && typeof (v as Draft).title === 'string' && (v as Draft).title.length <= 120 && typeof (v as Draft).text === 'string' && (v as Draft).text.length <= 8000 &&
  Number.isSafeInteger((v as Draft).revision) && journalCategories.some(c => c.key === (v as Draft).category) && certaintyOptions.some(c => c.key === (v as Draft).certainty)&&((v as Draft).command===undefined||isKnowledgeCommand((v as Draft).command)&&(v as Draft).command!.disclosure===true)
export default function LobbyKnowledgeDisclosure({ accountId, lobbyId, characterId, characterName, revision, disabled }: { accountId: string; lobbyId: string; characterId: string; characterName: string; revision: number; disabled: boolean }) {
  const { request, refresh } = useOnline(), key = lobbyFormKey('knowledge-disclosure', accountId, lobbyId, characterId)
  const [draft, setDraft] = useState<Draft>(() => readLobbyForm(key, valid) ?? { title: '', text: '', category: 'other' as const, certainty: 'reported' as const, revision })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [warning, setWarning] = useState('')
  const active = useRef(false), pending = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => () => {pending.current?.abort();pending.current=null;if(active.current)setBusy(false)}, [request,key])
  const latest=useRef({request,key,draft,disabled,revision})
  useLayoutEffect(()=>{latest.current={request,key,draft,disabled,revision}})
  function remember(next: Draft) { setDraft(next);const saved=writeLobbyForm(key,next);setWarning(saved?'':'Черновик сведения доступен до закрытия страницы: не удалось сохранить его на устройстве.');return saved }
  function edit(patch:Partial<Draft>){if(pending.current||draft.command)return;remember({...draft,revision:!draft.title&&!draft.text?revision:draft.revision,...patch})}
  async function send() {
    const l=latest.current
    if(!active.current||pending.current||l.key!==key||l.draft!==draft||l.request!==request||l.disabled)return
    const source=draft
    if(!source.command&&(source.revision!==l.revision||!source.title.trim()||!source.text.trim()))return
    const command=source.command??{revision:source.revision,title:source.title,text:source.text,category:source.category,certainty:source.certainty,disclosure:true,commandKey:'knowledge:'+crypto.randomUUID()}
    if(!remember({...source,command})){setMessage('Освободи место на устройстве перед отправкой: команда повтора не сохранена.');return}
    const abort=new AbortController();pending.current=abort;setBusy(true);setMessage('')
    try {
      const result=await request<{revision:number;duplicate:boolean}>('/lobbies/'+lobbyId+'/characters/'+characterId+'/knowledge',{signal:abort.signal,method:'POST',body:JSON.stringify(command)})
      if(!active.current||abort.signal.aborted||pending.current!==abort||latest.current.key!==key||latest.current.request!==request)return
      if(!isKnowledgeAck(result,command,characterId))throw Error('Сервер не подтвердил раскрытие. Текст, адресат и команда сохранены для проверки повтором.')
      remember({...source,title:'',text:'',revision:Math.max(result.revision,latest.current.revision),command:undefined});setMessage(result.duplicate?'Прежнее раскрытие подтверждено без повторной записи.':'Сведение раскрыто только выбранному герою.');refresh()
    }catch(e){if(active.current&&!abort.signal.aborted){if(e instanceof NetworkError&&[400,403,404,409,413].includes(e.status))remember({...source,command:undefined});setMessage((e as Error).message);refresh()}}
    finally{if(active.current&&pending.current===abort){pending.current=null;setBusy(false)}}
  }
  const stale = !draft.command&&!!(draft.title||draft.text)&&draft.revision !== revision
  return <details className="w6-fieldset"><summary>Раскрыть сведение герою {characterName}</summary><fieldset disabled={busy || disabled||!!draft.command}>
    <label className="w6-field"><span>Заголовок раскрываемого сведения</span><input aria-label="Заголовок раскрываемого сведения" maxLength={120} value={draft.title} onChange={e => edit({title:e.currentTarget.value})}/></label>
    <label className="w6-field"><span>Текст раскрываемого сведения</span><textarea aria-label="Текст раскрываемого сведения" maxLength={8000} rows={4} value={draft.text} onChange={e => edit({text:e.currentTarget.value})}/></label>
    <label className="w6-field"><span>Категория сведения</span><select value={draft.category} onChange={e => edit({category:e.currentTarget.value as JournalCategory})}>{journalCategories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
    <label className="w6-field"><span>Достоверность сведения</span><select value={draft.certainty} onChange={e => edit({certainty:e.currentTarget.value as KnowledgeCertainty})}>{certaintyOptions.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
    <p className="w6-copy">Это явная передача информации выбранному герою, включая сообщения от других персонажей. Участники не получают сведения автоматически всей группой.</p>
    {stale && <><p role="alert">Кампания изменилась. Проверь текст и адресата перед отправкой.</p><button className="w6-button" onClick={() => remember({ ...draft, revision })}>Сведение проверено с текущей версией</button></>}
    {!draft.command&&<button className="w6-button" disabled={stale || !draft.title.trim() || !draft.text.trim()} onClick={() => void send()}>Раскрыть сведение выбранному герою</button>}
  </fieldset>{draft.command&&<div role="status"><p>Раскрытие ожидает подтверждения. Повтор адресован тому же герою.</p><button className="w6-button" disabled={busy||disabled} onClick={()=>void send()}>Проверить раскрытие сведения</button></div>}{warning && <p role="alert">{warning}</p>}<p role="status">{message}</p></details>
}
