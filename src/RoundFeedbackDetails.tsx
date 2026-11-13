import {feedbackResourceLabels,feedbackStatusLabels} from './roundFeedback'
import type {PersonalRoundFeedback} from './roundFeedback'
import './roundResults.css'

export default function RoundFeedbackDetails({report}:{report:Pick<PersonalRoundFeedback,'resources'|'actions'|'note'|'coverage'>}){
  return <>
    {!!report.resources.length&&<ul className="gb-round-resources" aria-label="Изменения ресурсов за раунд">{report.resources.map(resource=><li key={resource.id}>
      <strong>{feedbackResourceLabels[resource.id]}</strong><span>{resource.before||'—'} → {resource.after||'—'}</span>
      {resource.beforeMaximum!==resource.afterMaximum&&<small>Предел {resource.beforeMaximum||'—'} → {resource.afterMaximum||'—'}</small>}
    </li>)}</ul>}
    {report.actions.length?<ol className="gb-round-actions">{report.actions.map(action=><li key={action.id} data-status={action.status}>
      <span>{action.label}</span><strong>{feedbackStatusLabels[action.status]}</strong>{action.progress!==undefined&&<small>{action.progress.toLocaleString('ru-RU')}%</small>}
    </li>)}</ol>:<p className="w6-copy">Плановые действия героя в этом раунде не исполнялись.</p>}
    {report.note&&<section className="gb-round-note" aria-label="Пояснение мастера"><strong>Мастер о результате</strong><p className="w6-prose">{report.note}</p></section>}
    {report.coverage==='events'&&<p className="gb-game-help">В этой записи сохранились события исполнения. Изменения ресурсов не восстановлены.</p>}
  </>
}
