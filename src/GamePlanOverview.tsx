import type {DeclaredAction} from './actionDeclarations'

const categories=[['move','Движение'],['interact','Окружение'],['speak','Речь'],['item','Предметы'],['ability','Способности'],['wait','Ожидание']] as const
export default function GamePlanOverview({actions,issues}:{actions:DeclaredAction[];issues:number}){
 return <section className="realm-plan-overview" aria-label="Обзор плана хода"><header><strong>{actions.length?'Последовательность действий':'С чего начнём?'}</strong><span>{actions.length} / 20</span></header>
  {actions.length?<><div className="realm-plan-kinds">{categories.map(([kind,label])=>{const count=actions.filter(action=>action.kind===kind).length;return count>0?<span key={kind}>{label} <strong>{count}</strong></span>:null})}</div><p>Порядок — сверху вниз. Стрелки меняют последовательность; правку можно отменить.</p></>:<p>Выбери действие на панели над очередью. После исполнения результат появится на карте.</p>}
  {issues>0&&<p className="realm-plan-warning" role="status">Нужно проверить действий: {issues}. Причины показаны в очереди.</p>}
 </section>
}
