import { useState } from 'react'
import type { JournalEntry } from './characterKnowledge'
import { isSpeechJournalEntry } from './roundSpeech'

export default function LobbyConversations({journal}:{journal:Omit<JournalEntry,'artwork'|'eventKey'>[]}) {
  const [query,setQuery]=useState(''),all=journal.filter(isSpeechJournalEntry)
  const entries=all.filter(e=>(e.source+' '+e.text).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')))
  return <section aria-label="Разговоры героя"><h4>Разговоры героя</h4>
    <p className="w6-copy">Здесь только произнесённые героем и доступные ему реплики после применения раунда. Неразборчивый голос не раскрывает полные слова. Содержание чужих разговоров и список слушателей не показываются.</p>
    <label className="w6-field"><span>Поиск в услышанном</span><input aria-label="Поиск в разговорах героя" value={query} onChange={e=>setQuery(e.currentTarget.value)}/></label>
    <p className="w6-copy">Последние {Math.min(20,entries.length)} из {entries.length} подходящих записей.</p>
    {entries.slice(-20).reverse().map(e=><article className="gb-journal-entry" key={e.id}><h4>{e.title}</h4><small>{e.source} · {e.gameTime}</small><p className="w6-prose">{e.text}</p>{e.annotation&&<p className="w6-prose">Примечание: {e.annotation}</p>}</article>)}
    {!all.length&&<p>Пока нет доступных герою разговоров.</p>}
  </section>
}
