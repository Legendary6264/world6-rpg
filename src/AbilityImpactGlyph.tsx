import type {AbilityVisualStyle} from './abilityVisualStyles'
import {visualEaseOut} from './abilityVisualStyles'
import type {AbilityVisualPhase} from './abilityVisuals'

export default function AbilityImpactGlyph({style,phase,progress}:{style:AbilityVisualStyle;phase:AbilityVisualPhase;progress:number}){
 const p=Math.max(0,Math.min(1,progress)),residue=phase==='residue',radius=residue?1.8:phase==='release'?.5+visualEaseOut(p)*.6:.5+visualEaseOut(p)*1.4
 const arch=style.archetype,spokes=(count:number,path:string,width=.035)=>Array.from({length:count},(_,i)=><path key={i} transform={`rotate(${i*360/count+style.variant*13})`} d={path} className="w6-vfx-light-line" strokeWidth={width} opacity={.5+(i%3)*.18}/>)
 return <g data-vfx-layer="elemental-impact" data-vfx-impact={arch} transform={`scale(${radius})`} opacity={residue?.48*(1-p):1-p*.65}>
  {arch==='flame'&&<><ellipse rx=".9" ry=".24" cy=".4" fill="var(--vfx-shade)" opacity=".5"/>{spokes(11,'M.23 0Q.56-.14 1.14-.05M.7-.05 .83-.22',.055)}{[0,1,2,3,4].map(i=><ellipse key={i} cx={(i-2)*.3} cy={-.3-(i%3)*.22} rx=".2" ry=".32" fill="var(--vfx-shade)" opacity=".16"/>)}</>}
  {arch==='fluid'&&<><ellipse rx="1.1" ry=".45" className="w6-vfx-light-line" strokeWidth=".05"/>{spokes(9,'M.3 0Q.7-.36 1.14-.1M.85-.22Q1.03-.58 1.12-.46',.05)}{[0,1,2,3,4,5].map(i=><ellipse key={i} transform={`rotate(${i*60}) translate(.9 -.2)`} rx=".04" ry=".1" fill="var(--vfx-highlight)"/>)}</>}
  {arch==='storm'&&<>{spokes(7,'M.18 0 .39-.08 .48 .08 .64-.09 1.2 .02M.48 .08 .64 .36 .91 .32',.035)}<circle r=".2" fill="var(--vfx-highlight)" opacity=".65"/></>}
  {arch==='vortex'&&<>{[0,1,2,3].map(i=><path key={i} transform={`rotate(${i*90+style.variant*13})`} d="M.12 0C-.1-.66 .63-.94 1.03-.48C1.53.1 .8 1.27 .02 1.1" className="w6-vfx-light-line" strokeWidth={.025+i*.014} opacity={.45+i*.12}/>)}</>}
  {arch==='mineral'&&<>{spokes(7,'M.15 0 .42-.06 .58 .08 .77-.05 1.14 0M.58 .08 .65 .3 .87 .4',.05)}{[0,1,2,3,4].map(i=><path key={i} transform={`rotate(${i*72}) translate(.85 -.15)`} d="M-.12-.1 .07-.18 .19 .04-.04 .15Z" fill="var(--vfx-primary)" stroke="var(--vfx-highlight)" strokeWidth=".015"/>)}</>}
  {arch==='frost'&&<>{spokes(6,'M.13 0H1.16M.4 0 .56-.18M.4 0 .56 .18M.68 0 .94-.25M.68 0 .94 .25',.035)}<path d="M0-.25 .22-.12 .22 .12 0 .25-.22 .12-.22-.12Z" fill="var(--vfx-highlight)" opacity=".35"/></>}
  {arch==='growth'&&<>{spokes(7,'M.1 0Q.65-.27 1.18 .04M.55-.08Q.65-.43 .85-.3M.78-.02Q.95 .35 1.12 .26',.05)}{spokes(5,'M.43 0Q.66-.23 .79-.04Q.63 .2 .43 0',.025)}</>}
  {arch==='renewal'&&<>{spokes(5,'M.12 0C-.2-.65 .71-.96 .91-.48C1.08-.08 .73 .22 .46 .15',.035)}{[-.85,0,.85].map((x,i)=><path key={i} transform={`translate(${x} ${-.45-(i%2)*.5})`} d="M-.09 0H.09M0-.09V.09" className="w6-vfx-light-line" strokeWidth=".04"/>)}</>}
  {arch==='radiance'&&<>{Array.from({length:12},(_,i)=><path key={i} transform={`rotate(${i*30})`} d={`M-.025 .2 0 ${i%2?1:1.3} .025 .2Z`} fill="var(--vfx-highlight)" opacity={i%2?.35:.75}/>)}<circle r=".42" className="w6-vfx-light-line" strokeWidth=".018"/></>}
  {arch==='shadow'&&<><circle r=".75" fill="var(--vfx-shade)" opacity=".65"/>{spokes(5,'M1.18-.24C.9-.72 .2-.7 .12-.08M.28-.29 .57-.18 .47 .09',.07)}</>}
  {arch==='sigil'&&<><path d="M0-1 1 0 0 1-1 0ZM-.7-.7H.7V.7H-.7Z" className="w6-vfx-light-line" strokeWidth=".025"/><circle r=".84" className="w6-vfx-outline"/>{spokes(8,'M-.06-1.16V-1H.06V-1.16M0-1.06 .14-1.12',.025)}</>}
  {arch==='resonance'&&<>{[0,1,2,3].map(i=><circle key={i} r={.35+i*.25} className="w6-vfx-light-line" strokeWidth={.035-i*.005} strokeDasharray={i%2?'.14 .05':undefined} opacity={.8-i*.15}/>)}</>}
 </g>
}
