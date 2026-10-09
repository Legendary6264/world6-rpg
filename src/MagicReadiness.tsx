import type { ReadyCharacterDraft } from './characterModel'
import type { AbilityDefinition } from './rpgTypes'
import { abilityDiagnostics, abilityLimits, developmentLabel, magicSpecialization } from './creationRules'
import { schoolById } from './magicCatalog'

export default function MagicReadiness({actor,ability,compact=false}:{actor:ReadyCharacterDraft;ability:AbilityDefinition;compact?:boolean}){
 const issues=abilityDiagnostics(actor,ability),s=ability.schoolId?magicSpecialization(actor,ability.schoolId,ability.basisSchoolId):null,limits=abilityLimits(actor.profile)
 return <details className="w6-fieldset w6-magic-readiness" open={!compact}>
 <summary>{issues.length?'Не выполнено требований: '+issues.length:'Требования развития выполнены'}</summary>
 <p>Минимум: {developmentLabel(ability.minimumLevel??0)}.</p>
 {!!issues.length&&<ul>{issues.map(t=><li key={t}>{t}</li>)}</ul>}
 {ability.schoolId&&!ability.innate&&<><p>Пределы текущего развития: сила {limits.power}, дальность {limits.range} м, длительность {limits.duration} с. Расчётная сила после усилений также ограничивается этим пределом.</p>{s&&<><p>Основа: {schoolById(s.baseSchool)?.name}. Освоено основных школ: {s.count}. Расовая склонность: +{s.racial}%; индивидуальная: +{s.individual}%.</p><p>Эффективность = (1 + ({s.racial} + {s.individual}) / 100) / {s.divisor} = {Math.round(s.efficiency*100)}%.</p></>}</>}
 </details>
}
