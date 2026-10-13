import { listeningFocusLabel, listeningPlanLabel } from './roundListening'
import type { ListeningRow } from './roundListening'
export default function LobbyListeningPlans({rows,actors,objects}:{rows:ListeningRow[];actors:{id:string;name:string}[];objects:{id:string;name:string}[]}) {
  if(!rows.length)return null
  return <section className="w6-fieldset" aria-label="Намерения слушателей"><h4>Намерения слушателей</h4>
    <p className="w6-copy">Эти планы видят только ведущие с доступом к заявлениям. Просьба подслушать не даёт автоматической слышимости, успеха или скрытности. Точное время внимания появится в расчёте; решение по каждому разговору остаётся за мастером.</p>
    {rows.map(r=><p key={r.key}><strong>{actors.find(a=>a.id===r.actorId)?.name??'Персонаж'}</strong> · {listeningPlanLabel(r)} · {listeningFocusLabel(r,objects)}</p>)}
  </section>
}
