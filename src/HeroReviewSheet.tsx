import type { Actor } from './rpgEngine'
import { attributeFields, resourceFields } from './characterModel'
import { rankOptions } from './characterProfile'
import { raceById } from './raceCatalog'
import { effectiveAttribute, skillCatalog } from './creationRules'
import { statisticFields } from './characterStatistics'
import { artworkSource } from './visualMedia'
import { downloadJson } from './characterTransfer'
export default function HeroReviewSheet({ sheet, label }: { sheet: Actor; label: string }) {
  return <section className="w6-fieldset" aria-label={label}><h4>{label}: {sheet.name}</h4>
    <img src={artworkSource(sheet.profile.portrait, 'portrait-traveler')} alt={'Портрет ' + sheet.name} width={96} height={96}/>
    <p>{raceById(sheet.creation.raceId, sheet.creation.customRaces).name} · {rankOptions.find(r => r.key === sheet.profile.rank)?.label ?? 'Ранг не задан'} · ступень {sheet.profile.rankStep ?? 1} · {sheet.profile.energy === 'shadow' ? 'Тень' : 'Мана'}</p>
    <p>Происхождение: {sheet.profile.origin || 'Не указано'}</p><p className="w6-prose">{sheet.profile.biography}</p>
    <details><summary>Атрибуты и развитие</summary><div className="w6-table-scroll"><table className="w6-table"><thead><tr><th>Атрибут</th><th>База</th><th>Тренировка</th><th>Специализация</th><th>Итог</th></tr></thead><tbody>
      {attributeFields.map(a => <tr key={a.key}><td>{a.label}</td><td>{sheet.attributes[a.key]}</td><td>{sheet.creation.training[a.key]}</td><td>{sheet.creation.specialization[a.key]}</td><td>{effectiveAttribute(sheet, a.key)}</td></tr>)}</tbody></table></div>
      {skillCatalog.filter(s => sheet.creation.skills[s.id] > 0).map(s => <p key={s.id}>{s.name}: обучение {sheet.creation.skills[s.id]}</p>)}
    </details>
    <details><summary>Ресурсы, тело и показатели</summary>{resourceFields.map(r => <p key={r.key}>{r.label}: {sheet.resources[r.key].current} / {sheet.resources[r.key].maximum}</p>)}
      {Object.entries(sheet.body.parts).map(([id, p]) => <p key={id}>{p.label ?? id}: {p.present ? p.current + ' / ' + p.maximum : 'Отсутствует'}{p.wound ? ' · ' + p.wound : ''}{p.injuries?.map(i => ' · ' + i.label)}</p>)}
      {statisticFields.map(s => <p key={s.key}>{s.label}: {sheet.statistics[s.key]}</p>)}
    </details>
    <details><summary>Снаряжение и способности</summary>{sheet.rpg.inventory.length ? sheet.rpg.inventory.map(i => <p key={i.id}>{i.name} × {i.quantity} · {i.description}</p>) : <p>Снаряжение не задано.</p>}
      {sheet.rpg.abilities.length ? sheet.rpg.abilities.map(a => <p key={a.id}>{a.name} · {a.description} · подготовка {a.preparation} с</p>) : <p>Способности не заданы.</p>}
      <p className="w6-copy">Утверждение героя не утверждает автоматически каждую способность. Мастер проверяет их отдельно по действующим правилам.</p>
    </details>
    <button type="button" className="w6-button" onClick={() => downloadJson(JSON.stringify(sheet), 'grani-bytiya-review-sheet.json')}>Скачать проверяемый лист целиком</button>
  </section>
}
