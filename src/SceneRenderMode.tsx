import type { ReactNode } from 'react'
export default function SceneRenderMode({ mode, onChange, children }: {
  mode: '3d' | 'map'; onChange: (mode: '3d' | 'map') => void; children?: ReactNode
}) {
  return <div className="gb-render-toolbar" aria-label="Отображение сцены">
    <div className="gb-render-modes"><button type="button" className="w6-button" aria-pressed={mode === '3d'} onClick={() => onChange('3d')}>3D</button>
      <button type="button" className="w6-button" aria-pressed={mode === 'map'} onClick={() => onChange('map')}>Схема</button></div>{children}
  </div>
}
