import type { ListeningRow } from './roundListening'
import { listeningPlanLabel } from './roundListening'
import { emptySpeechDecision, speechVolume, speechDistance } from './roundSpeech'
import type { SpeechDecision, SpeechHearer, SpeechLocation, SpeechRow } from './roundSpeech'

export default function LobbyRoundSpeech({rows,form,actors,locations,sceneId,listening=[],onChange}:{rows:SpeechRow[];form:SpeechDecision[];
  actors:{id:string;name:string}[];locations:SpeechLocation[];sceneId:string;listening?:ListeningRow[];onChange:(next:SpeechDecision)=>void}) {
  if(!rows.length)return null
  const name=(id:string)=>actors.find(a=>a.id===id)?.name??'Персонаж'
  const listeners=actors.filter(a=>locations.some(l=>l.sceneId===sceneId&&l.actorId===a.id))
  return <fieldset className="gb-speech-decisions"><legend>Слышимость реплик</legend>
    <p className="w6-copy">Дальность, преграды, слух, язык и разборчивость решает мастер. Расстояние XYZ показано до раунда; движение и события могут изменить условия. Адресат реплики не становится слушателем автоматически. Список услышавших и подслушавших скрыт от игроков.</p>
    {rows.map(r=>{const speechTag=name(r.actorId)+' · '+(r.key.startsWith('new:')?'действие '+(Number(r.key.slice(r.key.lastIndexOf(':')+1))+1):'продолжение реплики'),d=form.find(d=>d.key===r.key)??emptySpeechDecision(r.key)
      function update(next:SpeechDecision){onChange({...next,confirmed:false})}
      function hearer(actorId:string,next:SpeechHearer|null){update({...d,hearers:[...d.hearers.filter(h=>h.actorId!==actorId),...(next?[next]:[])]})}
      return <section key={r.key} className="gb-journal-entry" data-speech-key={r.key}><h4>{name(r.actorId)} · {speechVolume[r.action.volume]}</h4>
        <p className="w6-prose">{r.action.text}</p>
        <label className="w6-field"><span>Условия слышимости</span><textarea aria-label={'Условия слышимости '+speechTag} maxLength={2000} rows={2} value={d.reason} onChange={e=>update({...d,reason:e.currentTarget.value})}/></label>
        {!listeners.some(a=>a.id===r.actorId)&&<p role="alert">Говорящий не размещён в сцене. Перед расчётом размести его или верни заявление.</p>}
        {listeners.filter(a=>a.id!==r.actorId).map(a=>{const h=d.hearers.find(h=>h.actorId===a.id),distance=speechDistance(locations,sceneId,r.actorId,a.id),tag=speechTag+' · '+a.name
          return <details key={a.id} className="gb-speech-listener" data-hearer-id={a.id}><summary>{a.name}{listening.some(r=>r.actorId===a.id)?' · '+[...new Set(listening.filter(r=>r.actorId===a.id).map(listeningPlanLabel))].join(', '):''} · {h?({clear:'слышит целиком',fragment:'разбирает фрагмент',sound:'слышит голос'}[h.clarity]):'не слышит'}{distance!==null?' · до раунда '+distance.toLocaleString('ru-RU',{maximumFractionDigits:3})+' м':''}</summary>
            <label className="w6-field"><span>Что слышит {a.name}</span><select aria-label={'Слышимость '+tag} value={h?.clarity??'none'} onChange={e=>hearer(a.id,e.currentTarget.value==='none'?null:{actorId:a.id,clarity:e.currentTarget.value as SpeechHearer['clarity'],speaker:h?.speaker??'Голос',fragment:'',signs:h?.signs??''})}>
              <option value="none">Не слышит</option><option value="clear">Вся реплика</option><option value="fragment">Только фрагмент</option><option value="sound">Неразборчивый голос</option>
            </select></label>
            {h&&<><label className="w6-field"><span>Известное слушателю обозначение говорящего</span><input aria-label={'Говорящий для '+tag} maxLength={120} value={h.speaker} onChange={e=>hearer(a.id,{...h,speaker:e.currentTarget.value})}/></label>
              {h.clarity==='fragment'&&<label className="w6-field"><span>Дословный услышанный фрагмент</span><textarea aria-label={'Фрагмент для '+tag} maxLength={4000} rows={2} value={h.fragment} onChange={e=>hearer(a.id,{...h,fragment:e.currentTarget.value})}/></label>}
              <label className="w6-field"><span>Только доступные слушателю признаки</span><textarea aria-label={'Признаки для '+tag} maxLength={1000} rows={2} value={h.signs} onChange={e=>hearer(a.id,{...h,signs:e.currentTarget.value})}/></label>
            </>}
          </details>})}
        <p className="w6-copy">Говорящий получит запись о произнесённых словах. У остальных — только выбранная часть. Услышанное не подтверждает истинность сказанного; автоматических штрафов за отсутствие слушателей нет.</p>
        <label className="w6-check"><input type="checkbox" aria-label={'Слышимость подтверждена '+speechTag} checked={d.confirmed}
          onChange={e=>onChange({...d,confirmed:e.currentTarget.checked,recordedAt:e.currentTarget.checked?new Date().toISOString():d.recordedAt})}/>Проверил слышимость и раскрытие личности для этой реплики</label>
      </section>})}
  </fieldset>
}
