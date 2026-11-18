import InterfaceIcon from './InterfaceIcon'

export default function AbilityActionGuide({source,target,queue,ready}:{source:string;target:string;queue:string;ready:boolean}){
 return <section className="realm-cast-guide" aria-label="Проверка применения способности" data-ready={ready}><header><InterfaceIcon name={ready?'check':'spark'} size={19}/><strong>{ready?'Можно добавить в ход':'Перед добавлением в ход'}</strong></header><dl><div><dt>Источник</dt><dd>{source}</dd></div><div><dt>Цель</dt><dd>{target}</dd></div><div><dt>Очередь</dt><dd>{queue}</dd></div></dl><p>Это план действия. Время, расход и последствия подтвердит мастер при исполнении раунда.</p></section>
}
