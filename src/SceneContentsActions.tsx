type Props={objectCount:number;actorCount:number;blocked:boolean;disabled:boolean;onSelect:()=>void;onMove:()=>void;onCopy:()=>void;onDuplicate:()=>void}

export default function SceneContentsActions({objectCount,actorCount,blocked,disabled,onSelect,onMove,onCopy,onDuplicate}:Props){
 return <section className="gb-contents-actions" aria-label="Композиция с содержимым">
  <h4>Композиция на опоре</h4>
  <p>Объектов: {objectCount}{actorCount>0?' · героев на опорах: '+actorCount:''}</p>
  <div><button className="w6-button" type="button" disabled={disabled||blocked} onClick={onMove}>Перенести с содержимым</button><button className="w6-button" type="button" disabled={blocked} onClick={onCopy}>Копировать с содержимым</button><button className="w6-button" type="button" disabled={disabled||blocked} onClick={onDuplicate}>Дублировать с содержимым</button><button className="w6-button" type="button" disabled={blocked} onClick={onSelect} title="Shift+G">Выделить с содержимым</button></div>
  {blocked?<p role="status">В композиции есть скрытые или защищённые предметы. Покажи их и сними защиту для общего действия.</p>:<p>Предметы сохраняют взаимное расположение. Герои следуют за своими опорами при переносе; при копировании остаются на месте.</p>}
 </section>
}
