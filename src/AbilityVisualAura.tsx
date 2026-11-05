import type {AbilityVisualStyle} from './abilityVisualStyles'
import {visualEaseOut} from './abilityVisualStyles'
import type {AbilityVisualPhase} from './abilityVisuals'
import AbilityImpactGlyph from './AbilityImpactGlyph'

/** Fine, bounded vector layers around the established school glyph. */
export default function AbilityVisualAura({style,phase,progress=.45,gradientId}:{style:AbilityVisualStyle;phase:AbilityVisualPhase;progress?:number;gradientId:string}){
  const p=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):.45,impact=phase==='impact'
  const flow=style.archetype
  return <g data-vfx-layer="aura" data-vfx-archetype={flow} opacity={phase==='residue'?.55:1}>
    <circle r="1.7" fill={`url(#${gradientId})`} opacity=".75"/>
    {(flow==='flame')&&<g className="w6-vfx-plume">
      {[-1,0,1].map((offset,i)=><path key={i} transform={`translate(${offset*.42} ${Math.abs(offset)*.13}) scale(${.65-i*.08} ${1.2-i*.13})`} d="M-.47 .45C-.9-.18-.13-.48-.25-1.6C.35-1.22 .05-.69 .47-.22C.9 .39 .45 .84 0 .78Z" fill={`url(#${gradientId})`} className="w6-vfx-flame-sheet"/>) }
      <path d="M-.9 .65Q-.12 .88 .86 .53M-.75 .86Q0 1.02 .67 .8" className="w6-vfx-light-line w6-vfx-smoke" opacity=".55"/>
    </g>}
    {(flow==='fluid')&&<g className="w6-vfx-liquid">
      {[0,1,2].map(i=><ellipse key={i} rx={.8+i*.22} ry={.3+i*.12} transform={`rotate(${i*45+style.variant*13})`} fill="none" stroke="var(--vfx-primary)" strokeWidth={.075-i*.015} opacity={.65-i*.12} className="w6-vfx-orbit"/>)}
      <path d="M-.66-.38Q-.14-.83 .39-.35M-.62 .42Q0 .8 .62 .35" className="w6-vfx-light-line" strokeWidth=".06"/>
    </g>}
    {flow==='storm'&&<g className="w6-vfx-corona">{Array.from({length:6},(_,i)=><path key={i} transform={`rotate(${i*60+style.variant*17})`} d="M.27 0 .56-.08 .68 .08 .83-.07 1.09 .03 1.4-.15M.68 .08 .77 .32 .98 .36" className="w6-vfx-light-line" strokeWidth=".035"/>)}</g>}
    {flow==='vortex'&&<g className="w6-vfx-stream-ring">{[0,1,2,3].map(i=><path key={i} transform={`rotate(${i*90})`} d="M-.25-.14C-.97-.54-.65-1.26 .26-1.15C1.36-1.02 1.56 .47 .72 1.22" className="w6-vfx-light-line" strokeWidth={.045+i*.009} opacity={.4+i*.12}/>)}</g>}
    {(flow==='mineral'||flow==='frost')&&<g className="w6-vfx-shard-crown">{Array.from({length:flow==='frost'?6:5},(_,i)=>{
      const turn=i*(flow==='frost'?60:72)+style.variant*11
      return <g key={i} transform={`rotate(${turn}) translate(0 ${impact?-.45-visualEaseOut(p)*.65:-.62})`}><path d="M0-.64 .16-.18 .09 .22-.12 .2-.2-.11Z" fill="var(--vfx-shade)" opacity=".75"/><path d="M0-.64 .04 .04 .16-.18Z" fill="var(--vfx-highlight)" opacity=".75"/><path d="M0-.64 .04 .04-.12 .2" className="w6-vfx-light-line" strokeWidth=".025"/></g>
    })}</g>}
    {(flow==='growth'||flow==='renewal')&&<g className="w6-vfx-lifelines">
      <path d="M-.9 .88C.95 .4-1.02-.34 .25-1.22M.9 .88C-.95 .4 1.02-.34-.25-1.22" className="w6-vfx-line w6-vfx-rise" strokeWidth=".065"/>
      {flow==='growth'?[-1,1].map(sign=><path key={sign} transform={`scale(${sign} 1)`} d="M.43 .42Q.82 .02 .94 .33Q.87 .62 .43 .42M.08-.36Q.63-.64 .55-.25Q.37-.08 .08-.36" fill="var(--vfx-primary)" opacity=".5"/>):[[-.7,.45],[.6,.1],[-.3,-.75]].map(([x,y],i)=><path key={i} transform={`translate(${x} ${y})`} d="M-.08 0H.08M0-.08V.08" className="w6-vfx-light-line" strokeWidth=".04"/>)}
      <ellipse cy=".9" rx="1.05" ry=".3" className="w6-vfx-light-line" strokeWidth=".035" opacity=".5"/>
    </g>}
    {flow==='radiance'&&<g className="w6-vfx-radiant-crown">{Array.from({length:8},(_,i)=><path key={i} transform={`rotate(${i*45})`} d="M-.04 .45 0 1.62 .04 .45Z" fill="var(--vfx-highlight)" opacity={i%2?.38:.7}/>)}<circle r=".72" className="w6-vfx-light-line" strokeWidth=".022"/></g>}
    {flow==='shadow'&&<g className="w6-vfx-accretion"><circle r=".79" fill="var(--vfx-shade)" opacity=".8"/><circle r=".83" className="w6-vfx-light-line" strokeWidth=".025"/>{[0,1,2].map(i=><path key={i} transform={`rotate(${i*120})`} d="M-.3-.1C-1.4-.28-1.16-1.45-.26-1.27C.38-1.18 .43-.6 .18-.33" className="w6-vfx-line" strokeWidth=".095" opacity=".65"/>)}</g>}
    {flow==='sigil'&&<g className="w6-vfx-seal"><circle r="1.2" className="w6-vfx-light-line" strokeWidth=".022"/><circle r="1.06" className="w6-vfx-outline" strokeWidth=".035" strokeDasharray=".11 .09 .03 .09"/>{Array.from({length:8},(_,i)=><path key={i} transform={`rotate(${i*45})`} d="M-.045-1.34V-1.14H.045V-1.34M0-1.22 .11-1.28" className="w6-vfx-light-line" strokeWidth=".025"/>)}</g>}
    {flow==='resonance'&&<g className="w6-vfx-wavefronts">{[0,1,2,3].map(i=><ellipse key={i} rx={.45+i*.3} ry={.7+i*.15} className="w6-vfx-light-line" strokeWidth=".035" opacity={.72-i*.14}/>)}</g>}
    {(impact||phase==='release'||phase==='residue')&&<AbilityImpactGlyph style={style} phase={phase} progress={p}/>}
  </g>
}
