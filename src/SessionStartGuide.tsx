import InterfaceIcon from './InterfaceIcon'
import type {InterfaceIconName} from './InterfaceIcon'
import type {GameSessionView} from './gameSession'

const steps:Record<string,{icon:InterfaceIconName;title:string;hint:string;action:string}>={
 friends:{icon:'lobbies',title:'Соберите партию',hint:'Передай приглашение друзьям и дождись их входа в лобби.',action:'Пригласить игроков'},
 heroes:{icon:'character',title:'Подготовьте героев',hint:'Каждому игроку нужен принятый герой под своим управлением.',action:'Проверить героев'},
 scene:{icon:'worldEditor',title:'Откройте сцену',hint:'Размести героев и явно открой им обстановку.',action:'Подготовить сцену'},
 players:{icon:'lobbies',title:'Подтвердите готовность',hint:'Каждый игрок сам нажимает «Я готов играть» после входа на сцену.',action:'Проверить готовность'},
}
export default function SessionStartGuide({ready=[],disabled,paused,onMembers,onHeroes,onScene,onReadiness}:{ready?:GameSessionView['ready'];disabled:boolean;paused:boolean;onMembers:()=>void;onHeroes:()=>void;onScene:()=>void;onReadiness:()=>void}){
 if(!ready.length)return null
 const done=ready.filter(r=>r.done).length,next=ready.find(r=>!r.done)?.id
 return <section className="realm-start-guide" aria-label="Путь к началу игры"><header><div><small>Перед первым ходом</small><h4>От приглашения до общей сцены</h4></div><span>{done} из {ready.length}</span></header><progress aria-label="Шаги подготовки партии" max={ready.length} value={done}/>
  <ol className="gb-session-ready realm-start-steps" aria-label="Готовность к совместной игре">{ready.map((r,i)=>{
   const info=steps[r.id],action=r.id==='players'?onReadiness:r.section==='heroes'?onHeroes:r.section==='game'?onScene:onMembers
   return <li key={r.id} data-done={r.done} data-current={r.id===next}><details open={!r.done&&r.id===next}><summary><span className="realm-step-icon" aria-hidden="true"><InterfaceIcon name={r.done?'check':info?.icon??'spark'} size={21}/></span><span className="realm-step-title"><small>{r.done?'Готово':'Шаг '+(i+1)+(r.id===next?' · сейчас':' · ожидает')}</small><strong>{info?.title??r.label}</strong></span><span aria-hidden="true">⌄</span></summary><div className="realm-step-body">{info&&<p>{info.hint}</p>}<p className="realm-step-status">{r.label}</p>{!r.done&&<button type="button" className="w6-button" disabled={disabled} onClick={action}>{info?.action??'Проверить шаг'}</button>}</div></details></li>
  })}</ol>
  <p className="realm-start-note" role="status">{paused?'Сессия на паузе. Продолжи её перед запуском.':next?'Шаги обновляются после подтверждения сервером.':'Всё готово. Мастер может подтвердить начало игры.'}</p>
 </section>
}
