import type { PersonalRoundWork } from './roundWork'
import { useState } from 'react'
import type { PlayerCharacter } from './onlineTypes'
import type { PerceivedMap } from './scenePerception'

export default function GameHeroHud({hero,map,seconds,work=[]}:{hero:PlayerCharacter;map:PerceivedMap|null;seconds?:number;work?:PersonalRoundWork[]}) {
  const self=map?.contacts.find(c=>c.kind==='self')
  const snapshot={scene:map?.frame.id,position:self?`${self.x}; ${self.y}; ${self.z??'?'}`:'',seconds,resources:hero.resources??{},doors:map?.objects.filter(o=>o.visible&&o.kind==='door').map(o=>({id:o.id,name:o.name,open:o.open}))??[]}
  const key=JSON.stringify(snapshot),[history,setHistory]=useState(()=>({key,snapshot,events:[] as string[]}))
  if(history.key!==key){
    const changes:string[]=[]
    if(snapshot.scene!==history.snapshot.scene&&map)changes.push('Новая сцена: '+map.title)
    else if(snapshot.position&&snapshot.position!==history.snapshot.position)changes.push('Герой переместился: '+snapshot.position+' м')
    if(seconds!==undefined&&history.snapshot.seconds!==undefined&&seconds>history.snapshot.seconds)changes.push('Прошло '+Number((seconds-history.snapshot.seconds).toFixed(3))+' с игрового времени')
    for(const [id,r] of Object.entries(snapshot.resources)){const before=history.snapshot.resources[id];if(before&&r.current!==before.current)changes.push((id==='mana'?'Мана':id==='shadow'?'Тень':'Выносливость')+': '+before.current+' → '+r.current)}
    for(const door of snapshot.doors){const before=history.snapshot.doors.find(o=>o.id===door.id);if(before&&before.open!==door.open)changes.push(door.name+': '+(door.open?'открыта':'закрыта'))}
    setHistory({key,snapshot,events:[...history.events,...changes].slice(-12)})
  }
  return <><div className="gb-game-hud"><div><strong>{hero.name}</strong><small style={{display:'block'}}>{hero.approved?'В игре':'Ожидает принятия мастером'}{self?' · '+(self.flying?'в воздухе':'на сцене'):''}</small></div>
    {Object.entries(hero.resources??{}).filter(([,r])=>Number(r.maximum)>0).map(([id,r])=><div className="gb-game-resource" key={id}><label htmlFor={'game-resource-'+hero.id+'-'+id}>{id==='mana'?'Мана':id==='shadow'?'Тень':'Выносливость'}</label><meter id={'game-resource-'+hero.id+'-'+id} min={0} max={Math.max(1,Number(r.maximum)||1)} value={Math.max(0,Number(r.current)||0)}/><small>{r.current} / {r.maximum}</small></div>)}
    {seconds!==undefined&&<div><small>Время мира</small><strong style={{display:'block'}}>{Math.floor(seconds/60)}:{String(Math.floor(seconds%60)).padStart(2,'0')}</strong></div>}
    {!!hero.charges?.length&&<div><small>Способности</small>{hero.charges.map(c=><p key={c.id}>{c.name}: {c.status==='ready'?'готово':'подготовка'}</p>)}</div>}
  </div>{!!work.length&&<section className="gb-carried-work" aria-label="Незавершённые действия героя"><strong>Продолжающиеся действия</strong>{work.map(w=>{const total=Number(w.amount.total.numerator)/Number(w.amount.total.denominator),remaining=Number(w.amount.remaining.numerator)/Number(w.amount.remaining.denominator),percent=Math.max(0,Math.min(100,100*(1-remaining/total)));return <div key={w.id}><span>{w.actionKind==='move'?'Движение':w.actionKind==='ability'?'Подготовка способности':w.actionKind==='wait'?'Ожидание':'Действие'} · {Math.round(percent)}%</span><progress aria-label="Прогресс продолжающегося действия" max={100} value={percent}/></div>})}<p>Оставшаяся работа сохранена. Продолжение согласует мастер.</p></section>}{!!hero.sensations?.length&&<div className="gb-game-feed" aria-label="Самочувствие героя">{hero.sensations.map((s,i)=><p key={i}><strong>{s.label}</strong>{s.symptoms.length>0&&' · '+s.symptoms.join(', ')}</p>)}</div>}{!!history.events.length&&<div className="gb-game-feed" role="log" aria-label="События моего героя">{history.events.map((text,i)=><p key={i}>{text}</p>)}</div>}</>
}
