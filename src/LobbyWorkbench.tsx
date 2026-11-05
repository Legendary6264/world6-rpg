import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import './lobbyWorkbench.css'
import WorkspaceNavigation from './WorkspaceNavigation'

export type LobbySection = { id: string; label: string; content: ReactNode }

// Keep every permitted panel mounted: moving between tools must not reset a draft
// or detach an in-flight command. Permission checks belong to the caller.
export default function LobbyWorkbench({ label, sections, selectedId, onSelectSection }: { label: string; sections: LobbySection[]; selectedId?: string; onSelectSection?: (id: string) => void }) {
  const prefix = useId(), [selected, setSelected] = useState(sections[0]?.id)
  const preferred = selectedId ?? selected
  const current = sections.some(s => s.id === preferred) ? preferred : sections[0]?.id
  const grouped=sections.length>6
  const navigation=sections.map(s=>({id:s.id,label:s.label,group:['game','heroes','chat'].includes(s.id)?'Игра':['round','world'].includes(s.id)?'Ведение':'Кампания'}))
  function choose(id: string) { setSelected(id); onSelectSection?.(id) }
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 :
      event.key === 'ArrowRight' ? (index + 1) % sections.length :
      event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : null
    if (next === null) return
    event.preventDefault()
    choose(sections[next].id)
    document.getElementById(prefix + '-tab-' + sections[next].id)?.focus()
  }
  return <div className={'gb-lobby-workbench'+(grouped?' ui-workspace-layout':'')}>
    {grouped?<WorkspaceNavigation label={label} sections={navigation} selectedId={current??''} onSelect={choose} tabs idPrefix={prefix}/>:<div className="gb-lobby-tabs" role="tablist" aria-label={label}>
      {sections.map((s, index) => <button key={s.id} id={prefix + '-tab-' + s.id} type="button"
        className="w6-button" role="tab" aria-selected={s.id === current}
        aria-controls={prefix + '-panel-' + s.id} tabIndex={s.id === current ? 0 : -1}
        onClick={() => choose(s.id)} onKeyDown={e => move(e, index)}>{s.label}</button>)}
    </div>}
    <div className={grouped?'ui-workspace-content':undefined}>
    {grouped&&<p className="ui-lobby-overview">{navigation.find(s=>s.id===current)?.group}<span aria-hidden="true">/</span><strong>{sections.find(s=>s.id===current)?.label}</strong></p>}
    {sections.map(s => <section key={s.id} id={prefix + '-panel-' + s.id} role="tabpanel"
      className="gb-lobby-panel" aria-labelledby={prefix + '-tab-' + s.id} hidden={s.id !== current}
      tabIndex={0}>{s.content}</section>)}
    </div>
  </div>
}
