import { useMemo, useState } from 'react'
import type { SceneActor, SceneState } from './sceneTypes'
import type { SceneMergeChoices } from './sceneDraftMerge'
import { mergeSceneDraft } from './sceneDraftMerge'
import './sceneMergeStyle.css'

type Props = { base?: SceneState; local: SceneState; remote: SceneState; actors: SceneActor[]; previousActors: SceneActor[]; revision: number;
  disabled: boolean; expired: boolean; onApply: (value: SceneState) => void; onCancel: () => void }
const count = (state: SceneState) => `сцен ${state.scenes.length} · объектов ${state.scenes.reduce((n, s) => n + s.objects.length, 0)} · героев ${state.scenes.reduce((n, s) => n + s.tokens.length, 0)}`

export default function SceneDraftReview({ base, local, remote, actors, previousActors, revision, disabled, expired, onApply, onCancel }: Props) {
  const [choices, setChoices] = useState<SceneMergeChoices>({}), [mode, setMode] = useState('merge'), [visible, setVisible] = useState(20)
  const result = useMemo(() => {
    const ids = actors.map(a => a.id), labels = new Map([...previousActors, ...actors].map(a => [a.id, a.name]))
    const selected = mode === 'local' ? local : remote
    return mode === 'merge' ? mergeSceneDraft(base, local, remote, ids, choices, labels) : mergeSceneDraft(undefined, selected, selected, ids)
  }, [base, local, remote, actors, previousActors, choices, mode])
  const blocked = disabled || expired
  return <section className="gb-scene-merge" aria-label="Сверка сцен с сервером">
    <header><div><p className="w6-eyebrow">Согласование черновика</p><h4>Сверка с серверной версией {revision}</h4></div><button className="w6-button" type="button" onClick={onCancel}>Закрыть сверку</button></header>
    <p>Независимые правки объединены. Для спорных изменений выбери вариант. Проверка и применение к черновику не записывают изменения на сервер.</p>
    <dl className="gb-merge-counts"><div><dt>Мой черновик</dt><dd>{count(local)}</dd></div><div><dt>Сервер</dt><dd>{count(remote)}</dd></div></dl>
    {expired && <p role="alert">Сцены или серверная версия изменились после сверки. Повтори её перед применением.</p>}
    <fieldset disabled={blocked} className="gb-merge-mode"><legend>Какие сцены подготовить</legend>
      {[['merge', 'Объединить изменения'], ['local', 'Целиком мой черновик'], ['remote', 'Целиком серверный вариант']].map(([value, title]) => <label key={value}><input type="radio" name="scene-merge-mode" value={value} checked={mode === value} onChange={() => setMode(value)}/>{title}</label>)}
    </fieldset>
    {mode !== 'merge' && <p className="gb-merge-warning">Выбран целый набор сцен. Правки из другого варианта в него не попадут. До отдельного сохранения сервер останется прежним.</p>}
    {result.conflicts.length > 0 && <div className="gb-merge-conflicts">
      <p role="status">Спорных изменений: {result.conflicts.length}. Осталось выбрать: {result.unresolved}.</p>
      {result.conflicts.slice(0, visible).map(conflict => <fieldset key={conflict.id} disabled={blocked} data-merge-conflict={conflict.id}>
        <legend>{conflict.label}</legend><div className="gb-merge-variants">{(['local', 'remote'] as const).map(side => <label key={side} className={choices[conflict.id] === side ? 'gb-merge-chosen' : ''}>
          <span><input type="radio" name={'scene-merge-' + conflict.id} value={side} aria-label={(side === 'local' ? 'Мой вариант · ' : 'Серверный вариант · ') + conflict.label} checked={choices[conflict.id] === side} onChange={() => setChoices(previous => ({ ...previous, [conflict.id]: side }))}/><strong>{side === 'local' ? 'Мой вариант' : 'Серверный вариант'}</strong></span>
          <span>{conflict[side]}</span>
        </label>)}</div>
      </fieldset>)}
      {result.conflicts.length > visible && <button className="w6-button" type="button" onClick={() => setVisible(n => n + 20)}>Показать следующие спорные изменения</button>}
    </div>}
    {!result.conflicts.length && <p role="status">Спорных изменений нет. Можно принять подготовленный вариант в черновик.</p>}
    {result.issue && <p role="alert">{result.issue}</p>}
    <button className="w6-button w6-primary" type="button" disabled={blocked || result.unresolved > 0 || !!result.issue} onClick={() => onApply(result.state)}>Принять согласованный черновик</button>
  </section>
}
