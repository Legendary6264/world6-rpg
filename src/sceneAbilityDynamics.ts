import type {AbilityVisualStyle} from './abilityVisualStyles'
import type {AbilityVisualPhase} from './abilityVisuals'

type Point={x:number;y:number;z:number}
// A closed-form presentation trajectory: seeking backwards and frozen samples
// never accumulate simulation error. Units are relative to the visual scale.
export function abilityBurstParticle(style:AbilityVisualStyle,index:number,count:number,phase:AbilityVisualPhase,progress:number,seed:number,point:Point,ground:boolean){
 const p=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0,f=(index+.5)/count,a=index*2.399963+seed
 const age=Math.max(0,(phase==='residue'?.78+p*1.1:p*.78)-(index%5)*.018),speed=1.3+f*2.4,radial=speed*age
 const arch=style.archetype
 if(arch==='renewal'||arch==='growth'){
  const turn=a+age*2.2,r=(.25+f*.65)*(arch==='growth'?1+age*.5:1-age*.2)
  point.x=Math.cos(turn)*r;point.z=Math.sin(turn)*r;point.y=age*(1.1+f)*style.stretch
 }else if(arch==='shadow'){
  const r=(1.4+f*.5)*Math.max(0,1-age*.65),turn=a+age*2
  point.x=Math.cos(turn)*r;point.z=Math.sin(turn)*r;point.y=Math.sin(a)*r*.6
 }else if(arch==='vortex'||arch==='resonance'||arch==='sigil'){
  const turn=a+age*(arch==='vortex'?3.5:1.2);point.x=Math.cos(turn)*radial*.75;point.z=Math.sin(turn)*radial*.75;point.y=Math.sin(age*3+a)*.18+age*.25
 }else{
  const gravity=arch==='fluid'?7.5:arch==='mineral'||arch==='frost'?4.2:arch==='flame'?1.4:.4
  point.x=Math.cos(a)*radial;point.z=Math.sin(a)*radial
  point.y=(1.2+Math.sin(f*Math.PI)*2)*age-gravity*age*age*.5
  if(ground)point.y=Math.max(.035,point.y)
 }
 return Math.max(0,Math.min(1,((arch==='flame'?1.15:arch==='mineral'||arch==='frost'?1.85:1.55)-age)/.4))
}
