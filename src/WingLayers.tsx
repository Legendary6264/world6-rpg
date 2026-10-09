import { useId } from 'react'
import { wingProjection } from './wingAnatomy'
import type { WingStyle } from './wingAnatomy'
import type { StructureKind } from './anatomyModel'

export default function WingLayers({layer,style,parts}:{layer:StructureKind|'body'|'armor';style:WingStyle;parts:string[]}){
 const id=useId().replace(/:/g,''),outer=['body','skin','armor'].includes(layer)
 const pt=(x:number,y:number)=>{const p=wingProjection(x,y,style);return `${p.x} ${p.y}`}
 const line=(points:number[][])=>points.map(([x,y],i)=>(i?'L':'M')+pt(x,y)).join(' ')
 return <g pointerEvents="none" aria-hidden="true"><defs>
 <clipPath id={id+'-visible'}>{parts.includes('leftWing')&&<rect x="176" width="124" height="310"/>}{parts.includes('rightWing')&&<rect width="124" height="310"/>}</clipPath>
 <clipPath id={id+'-feathers'}><rect x="0" y="90" width="111" height="220"/><rect x="189" y="90" width="111" height="220"/></clipPath>
 <linearGradient id={id+'-muscle'}><stop stopColor="#723c37"/><stop offset=".45" stopColor="#ce8d78"/><stop offset="1" stopColor="#824a43"/></linearGradient>
 </defs><g clipPath={'url(#'+id+'-visible)'} opacity={outer?1:.16}>
 {style==='membrane'?<image href={new URL('./assets/anatomy/wings-realistic-v2.png',import.meta.url).href} width="300" height="600"/>:<image href={new URL('./assets/anatomy/bird-realistic-v2.png',import.meta.url).href} y="-65" width="300" height="600" clipPath={'url(#'+id+'-feathers)'}/>}
 </g>{['left','right'].map(side=>parts.includes(side+'Wing')&&<g key={side} transform={side==='right'?'translate(300 0) scale(-1 1)':undefined} data-wing-layer={layer} data-wing-region={side+'Wing'}>
 {(layer==='bone'||layer==='joint')&&<g fill="none" stroke="#deceb0" strokeLinecap="round" strokeLinejoin="round">
 <path d={line([[.02,.57],[.02,.52],[.12,.46],[.24,.36]])} strokeWidth="3.8"/>
 <path d={line([[.12,.48],[.24,.38]])} strokeWidth="1.5"/>
 {[[[.24,.36],[.50,.16],[.76,.01]],[[.24,.36],[.61,.44],[.92,.53]],[[.24,.36],[.51,.68],[.67,.96]],[[.24,.36],[.19,.64],[.10,.83]]].map((p,i)=><path key={i} d={line(p)} strokeWidth={i?2:2.8}/>)}
 {[[.02,.52],[.12,.46],[.24,.36]].map(([x,y])=>{const p=wingProjection(x,y,style);return <circle key={x} cx={p.x} cy={p.y} r="2.7" fill="#b7a489" strokeWidth=".7"/>})}</g>}
 {layer==='muscle'&&<g fill={'url(#'+id+'-muscle)'} stroke="#dba894" strokeWidth=".7">
 <path d={`M${pt(.01,.43)}Q${pt(.20,.46)} ${pt(.11,.59)}L${pt(.015,.67)}Z`}/>
 <path d={`M${pt(.09,.43)}Q${pt(.21,.29)} ${pt(.25,.37)}L${pt(.14,.51)}Z`}/>
 <path d={`M${pt(.10,.51)}Q${pt(.31,.34)} ${pt(.28,.48)}L${pt(.17,.57)}Z`}/>
 {Array.from({length:6},(_,i)=><path key={i} d={line([[.02+i*.016,.48],[.035+i*.016,.61]])} fill="none" opacity=".55"/>)}
 </g>}
 {layer==='vessel'&&<g fill="none" strokeLinecap="round"><path d={line([[.02,.56],[.12,.46],[.24,.36],[.50,.16],[.76,.01]])} stroke="#c78075" strokeWidth="2.2"/><path d={line([[.02,.58],[.14,.48],[.26,.38],[.62,.45],[.92,.53]])} stroke="#7c9bad" strokeWidth="1.6"/>{[[.58,.45],[.46,.68],[.20,.75]].map(([x,y])=><path key={x} d={line([[.24,.37],[x,y]])} stroke="#c78075" strokeWidth=".8"/>)}<path d={line([[.47,.68],[.67,.96]])} stroke="#7c9bad" strokeWidth=".9"/></g>}
 {layer==='organ'&&<g fill="none" stroke="#e0be78" strokeLinecap="round"><path d={line([[.01,.55],[.08,.52],[.12,.46],[.24,.36]])} strokeWidth="2.3"/>{Array.from({length:5},(_,i)=><path key={i} d={line([[.06,.54],[.025+i*.025,.62],[.02+i*.035,.70]])} strokeWidth=".85"/>)}<path d={line([[.24,.36],[.44,.56],[.52,.75]])} strokeWidth="1.1"/></g>}
 </g>)}</g>
}
