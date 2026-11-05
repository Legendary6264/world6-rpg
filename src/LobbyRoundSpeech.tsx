import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { forecastSpeech } from './acoustics'
import type { AcousticScene, SpeechForecast } from './acoustics'
import type { ListeningRow } from './roundListening'
import { listeningPlanLabel } from './roundListening'
import { emptySpeechDecision, speechVolume, speechDistance } from './roundSpeech'
import type { SpeechDecision, SpeechHearer, SpeechLocation, SpeechRow } from './roundSpeech'

const forecastLabel = {
  none: 'голос теряется', sound: 'голос слышен, слова неразборчивы',
  fragment: 'могут быть слышны отдельные слова', clear: 'речь может быть разборчива',
} satisfies Record<SpeechForecast['clarity'], string>
const number = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })

function voicePoint(location: SpeechLocation | undefined) {
  if (location?.x === undefined || location.y === undefined || location.z === undefined) return null
  return { x: location.x, y: location.y, z: location.z + 1.5 }
}

function Listener({ id, summary, acoustics, speaker, listener, volume, children }: {
  id: string; summary: ReactNode; acoustics?: AcousticScene; speaker?: SpeechLocation; listener?: SpeechLocation;
  volume: SpeechRow['action']['volume']; children: ReactNode;
}) {
  const [opened, setOpened] = useState(false)
  const forecast = useMemo(() => {
    if (!opened || !acoustics) return null
    const from = voicePoint(speaker), to = voicePoint(listener)
    return from && to ? forecastSpeech(acoustics, from, to, volume) : null
  }, [opened, acoustics, speaker, listener, volume])
  return <details className="gb-speech-listener" data-hearer-id={id} onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>{summary}</summary>
    {forecast && <p className="gb-speech-forecast" data-acoustic-clarity={forecast.clarity}>
      <strong>Прогноз · {forecastLabel[forecast.clarity]}</strong>
      <small>Голос {number(forecast.signalDb)} дБ · шум {number(forecast.noiseDb)} дБ · речь над шумом {number(forecast.speechSnrDb)} дБ
        {forecast.arrivalMs !== null && ' · задержка ' + number(forecast.arrivalMs) + ' мс'}</small>
      {forecast.viaDoor && <small>Путь через проём «{forecast.viaDoor}»</small>}
      {!!forecast.barriers && <small>Преград на пути: {forecast.barriers}</small>}
    </p>}
    {children}
  </details>
}

export default function LobbyRoundSpeech({rows,form,actors,locations,sceneId,acoustics,listening=[],onChange}:{rows:SpeechRow[];form:SpeechDecision[];
  actors:{id:string;name:string;speechEligible?:boolean}[];locations:SpeechLocation[];sceneId:string;acoustics?:AcousticScene;listening?:ListeningRow[];onChange:(next:SpeechDecision)=>void}) {
  if(!rows.length)return null
  const name=(id:string)=>actors.find(a=>a.id===id)?.name??'Персонаж'
  const positions=new Map(locations.filter(l=>l.sceneId===sceneId).map(l=>[l.actorId,l]))
  const listeners=actors.filter(a=>positions.has(a.id))
  const acousticScene=acoustics?.sceneId===sceneId?acoustics:undefined
  return <fieldset className="gb-speech-decisions"><legend>Слышимость реплик</legend>
    <p className="w6-copy">Дальность, преграды, слух, язык и разборчивость решает мастер. Расстояние XYZ показано до раунда; движение и события могут изменить условия. Адресат реплики не становится слушателем автоматически. Список услышавших и подслушавших скрыт от игроков.</p>
    {acousticScene && <p className="w6-copy">Открой слушателя, чтобы оценить акустику до раунда. Расчёт берёт голос и слух на условной высоте 1,5 м над отметками. Проверь изменения в ходе раунда и выбери, что услышал персонаж.</p>}
    {rows.map(r=>{const speechTag=name(r.actorId)+' · '+(r.key.startsWith('new:')?'действие '+(Number(r.key.slice(r.key.lastIndexOf(':')+1))+1):'продолжение реплики'),d=form.find(d=>d.key===r.key)??emptySpeechDecision(r.key)
      const speaker=listeners.find(a=>a.id===r.actorId)
      function update(next:SpeechDecision){onChange({...next,confirmed:false})}
      function hearer(actorId:string,next:SpeechHearer|null){update({...d,hearers:[...d.hearers.filter(h=>h.actorId!==actorId),...(next?[next]:[])]})}
      return <section key={r.key} className="gb-journal-entry" data-speech-key={r.key}><h4>{name(r.actorId)} · {speechVolume[r.action.volume]}</h4>
        <p className="w6-prose">{r.action.text}</p>
        <label className="w6-field"><span>Условия слышимости</span><textarea aria-label={'Условия слышимости '+speechTag} maxLength={2000} rows={2} value={d.reason} onChange={e=>update({...d,reason:e.currentTarget.value})}/></label>
        {!speaker&&<p role="alert">Говорящий не размещён в сцене. Перед расчётом размести его или верни заявление.</p>}
        {listeners.filter(a=>a.id!==r.actorId).map(a=>{const h=d.hearers.find(h=>h.actorId===a.id),distance=speechDistance(locations,sceneId,r.actorId,a.id),tag=speechTag+' · '+a.name
          const plans=[...new Set(listening.filter(r=>r.actorId===a.id).map(listeningPlanLabel))]
          const choice=h?({clear:'слышит целиком',fragment:'разбирает фрагмент',sound:'слышит голос'}[h.clarity]):'не слышит'
          return <Listener key={a.id} id={a.id} acoustics={speaker?.speechEligible===false||a.speechEligible===false?undefined:acousticScene}
            speaker={positions.get(r.actorId)} listener={positions.get(a.id)} volume={r.action.volume}
            summary={<>{a.name}{plans.length?' · '+plans.join(', '):''} · решение: {choice}{distance!==null?' · '+distance.toLocaleString('ru-RU',{maximumFractionDigits:3})+' м до раунда':''}</>}>
            <label className="w6-field"><span>Что слышит {a.name}</span><select aria-label={'Слышимость '+tag} value={h?.clarity??'none'} onChange={e=>hearer(a.id,e.currentTarget.value==='none'?null:{actorId:a.id,clarity:e.currentTarget.value as SpeechHearer['clarity'],speaker:h?.speaker??'Голос',fragment:'',signs:h?.signs??''})}>
              <option value="none">Не слышит</option><option value="clear">Вся реплика</option><option value="fragment">Только фрагмент</option><option value="sound">Неразборчивый голос</option>
            </select></label>
            {h&&<><label className="w6-field"><span>Известное слушателю обозначение говорящего</span><input aria-label={'Говорящий для '+tag} maxLength={120} value={h.speaker} onChange={e=>hearer(a.id,{...h,speaker:e.currentTarget.value})}/></label>
              {h.clarity==='fragment'&&<label className="w6-field"><span>Дословный услышанный фрагмент</span><textarea aria-label={'Фрагмент для '+tag} maxLength={4000} rows={2} value={h.fragment} onChange={e=>hearer(a.id,{...h,fragment:e.currentTarget.value})}/></label>}
              <label className="w6-field"><span>Только доступные слушателю признаки</span><textarea aria-label={'Признаки для '+tag} maxLength={1000} rows={2} value={h.signs} onChange={e=>hearer(a.id,{...h,signs:e.currentTarget.value})}/></label>
            </>}
          </Listener>})}
        <p className="w6-copy">Говорящий получит запись о произнесённых словах. У остальных — только выбранная часть. Услышанное не подтверждает истинность сказанного; автоматических штрафов за отсутствие слушателей нет.</p>
        <label className="w6-check"><input type="checkbox" aria-label={'Слышимость подтверждена '+speechTag} checked={d.confirmed}
          onChange={e=>onChange({...d,confirmed:e.currentTarget.checked,recordedAt:e.currentTarget.checked?new Date().toISOString():d.recordedAt})}/>Проверил слышимость и раскрытие личности для этой реплики</label>
      </section>})}
  </fieldset>
}
