import type {SceneObject,Scene} from './sceneTypes'
import {tabletopAsset,isFloorAsset} from './tabletopCatalog'
import SceneGlyph from './SceneGlyph'

type Appearance=Pick<SceneObject,'kind'|'asset'|'facing'|'open'|'active'|'height'>
type Sketch={asset:string;open:boolean;lit:boolean;edge?:boolean;rear?:boolean}
const wood='#b58b58',lightWood='#d6b47c',darkWood='#6b4d35',iron='#6e817e',stone='#8b9692',clay='#cf9a69',ink='#382d25'
function Flame({x=8,y=9,scale=1}:{x?:number;y?:number;scale?:number}){
 return <g className="gb-schematic-flame" transform={`translate(${x} ${y}) scale(${scale})`} stroke="none"><path d="M0 0C-3-1-3-3 0-7C0-4 4-3 2-1Z" fill="#e99d45"/><path d="M0-1Q-1-2 0-4Q2-2 0-1" fill="#ffe6a1"/></g>
}
function TableSide({round=false}:{round?:boolean}){return <><path d="M3 3V15.7H5V3M11 3V15.7H13V3" fill={darkWood}/>{round?<ellipse cx="8" cy="1.5" rx="7" ry="1.2" fill={lightWood}/>:<rect x="1" y=".3" width="14" height="2.7" rx=".5" fill={lightWood}/>}<path d="M4 10H12" fill="none"/></>}
function Top({asset,open,lit}:Sketch){
 switch(asset){
  case 'table':return <><rect x=".7" y=".7" width="14.6" height="14.6" rx="1" fill={wood}/><path d="M4.5 1V15M8 1V15M11.5 1V15" stroke={darkWood}/><path d="M1.5 2H14.5" stroke={lightWood}/></>
  case 'round-table':return <><circle cx="8" cy="8" r="7.2" fill={wood}/><path d="M2 4H14M1 8H15M2 12H14" stroke={darkWood}/><circle cx="8" cy="8" r="6.4" fill="none" stroke={lightWood}/></>
  case 'chair':return <><path d="M3 3V14M13 3V14" stroke={darkWood} strokeWidth="1.4"/><rect x="2" y="1" width="12" height="3" rx=".6" fill={darkWood}/><rect x="3" y="5" width="10" height="9" rx="1.4" fill={lightWood}/><path d="M5 7H11M5 11H11" stroke={wood}/></>
  case 'stool':return <><circle cx="8" cy="8" r="6.8" fill={wood}/><circle cx="8" cy="8" r="5.4" fill="none" stroke={lightWood}/><path d="M3 6H13M3 10H13" stroke={darkWood}/></>
  case 'bench':return <><rect x=".7" y="2" width="14.6" height="12" rx=".6" fill={wood}/><path d="M1 6H15M1 10H15" stroke={darkWood}/><path d="M2 2V14M14 2V14" stroke={lightWood}/></>
  case 'bar':return <><rect x=".5" y=".7" width="15" height="14.6" rx=".6" fill={darkWood}/><rect x="1" y="1" width="14" height="10" rx=".5" fill={lightWood}/><path d="M1 5H15M1 10H15M4 11V15M12 11V15" stroke={wood}/></>
  case 'mug':return <><path d="M10 4Q16 3 15 8Q15 12 10 11" fill="none" stroke={clay} strokeWidth="2"/><circle cx="6.7" cy="8" r="5.5" fill={clay}/><circle cx="6.7" cy="8" r="3.8" fill="#493829"/><path d="M3 6Q5 3 8 4" fill="none" stroke="#f0c697"/></>
  case 'plate':return <><circle cx="8" cy="8" r="7" fill="#ddc6a4"/><circle cx="8" cy="8" r="5" fill="#c3ac8a" stroke="#f5e3bb"/><circle cx="8" cy="8" r="3.8" fill="#dfcba9" stroke="none"/></>
  case 'bread':return <><path d="M2 3Q8-1 14 3L15 10Q14 15 8 15Q1 15 1 10Z" fill="#d8a25b"/><path d="M5 3L3 6M10 3L7 7M13 6L10 10M7 10L5 13" stroke="#925d35" strokeWidth="1.1"/></>
  case 'barrel':return <><circle cx="8" cy="8" r="7.1" fill={wood}/>{open?<circle cx="8" cy="8" r="5.3" fill="#322a22"/>:<><path d="M2 5H14M1 8H15M2 11H14" stroke={darkWood}/><circle cx="10" cy="6.5" r="1" fill={darkWood}/></>}<circle cx="8" cy="8" r="6.5" fill="none" stroke={iron} strokeWidth="1.2"/></>
  case 'shelf':return <><rect x=".6" y="1" width="14.8" height="14" fill={wood}/><rect x="1" y="1" width="14" height="3" fill={darkWood}/><path d="M1 9H15" stroke={darkWood}/>{[4,8,12].map(x=><circle key={x} cx={x} cy="7" r="1.4" fill="#cbbda0"/>)}</>
  case 'bed':return <><rect x="1" y=".6" width="14" height="14.8" rx=".6" fill={darkWood}/><rect x="2" y="1.5" width="12" height="13" rx="1" fill="#e0d3b6"/><rect x="3" y="2" width="10" height="3" rx="1" fill="#f6e9ce"/><path d="M2 6H14V14H2Z" fill="#6c7c66"/><path d="M3 8H13M8 6V14" stroke="#a5ae8a"/></>
  case 'rug':return <><rect x=".5" y=".5" width="15" height="15" fill="#795950"/><rect x="2" y="2" width="12" height="12" fill="none" stroke="#d3b27a"/><path d="M8 4L12 8L8 12L4 8Z" fill="#b99763"/><path d="M1 0V2M5 0V2M11 14V16M15 14V16" stroke="#cfb17f"/></>
  case 'chest':return <><rect x="1" y="1" width="14" height="14" rx="1" fill={wood}/>{open?<><rect x="2" y="4" width="12" height="10" fill="#302b25"/><rect x="1" y=".5" width="14" height="3" rx=".5" fill={lightWood}/></>:<><path d="M1 5H15M1 10H15" stroke={darkWood}/><path d="M4 1V15M12 1V15" stroke={iron} strokeWidth="1.5"/><rect x="6.5" y="11" width="3" height="3" fill="#d2b373"/></>}</>
  case 'candle':return <><circle cx="8" cy="8" r="6.6" fill={iron}/>{[[5,9],[8,5],[11,10]].map(([x,y])=><circle key={x} cx={x} cy={y} r="1.7" fill="#e2d7b9"/>)}{lit&&<Flame y={11} scale={.85}/>}</>
  case 'brazier':return <><circle cx="8" cy="8" r="7" fill={iron}/><circle cx="8" cy="8" r="5.3" fill="#302c29"/><path d="M4 9L10 5M6 12L12 8" stroke="#625047" strokeWidth="1.4"/>{lit&&<Flame y={12} scale={1.1}/>}</>
  case 'fireplace':return <><rect x=".5" y=".5" width="15" height="15" fill={stone}/><path d="M5 1V6M11 1V6M1 6H15" stroke="#5e6965"/><rect x="3" y="7" width="10" height="8" fill="#2b2b29"/>{lit&&<Flame y={14} scale={.85}/>}</>
  case 'torch':return <><rect x="4" y="1" width="8" height="4" rx="1" fill={iron}/><path d="M8 4V12" stroke={darkWood} strokeWidth="2.6"/><circle cx="8" cy="12" r="2.7" fill="#463a2b"/>{lit&&<Flame y={15} scale={1}/>}</>
  case 'chandelier':return <><path d="M8 1V15M1 8H15" stroke={iron} strokeWidth="1.5"/><circle cx="8" cy="8" r="5.6" fill="none" stroke={iron} strokeWidth="1.8"/>{[[8,2],[2,8],[14,8],[8,14]].map(([x,y])=><circle key={x+':'+y} cx={x} cy={y} r="1.4" fill={lit?'#f3c66e':'#d2cbb3'}/>)}{lit&&<circle className="gb-schematic-flame" cx="8" cy="8" r="1.7" fill="#f2c771" stroke="none"/>}</>
  case 'timber-wall':return <><rect x=".5" y="1" width="15" height="14" fill="#b9aa85"/><path d="M1 2H15M1 14H15M4 2V14M12 2V14" stroke={darkWood} strokeWidth="1.4"/></>
  case 'timber-window':return <><rect x=".5" y="1" width="15" height="14" fill={darkWood}/><rect x="3" y="4" width="10" height="8" fill="#88ada7"/><path d="M8 4V12" stroke={lightWood}/></>
  case 'timber-door':return <><path d="M2 1V15M14 1V15" stroke={darkWood} strokeWidth="2"/>{open?<><path d="M3 2V14" stroke={wood} strokeWidth="2"/><path d="M4 13Q12 13 12 5" fill="none" stroke={lightWood} strokeDasharray="1.5 1.2"/></>:<rect x="3" y="5" width="10" height="6" fill={wood}/>}</>
  case 'stone-wall':return <><rect x=".5" y="1" width="15" height="14" fill={stone}/><path d="M1 6H15M1 11H15M5 1V6M11 6V11M6 11V15" stroke="#5b6967"/></>
  case 'timber-pillar':return <><rect x="1" y="1" width="14" height="14" rx="1" fill={darkWood}/><rect x="3" y="3" width="10" height="10" fill={wood}/><path d="M8 5L11 8L8 11L5 8Z" fill={lightWood}/></>
  case 'timber-railing':return <><rect x="1" y="5" width="14" height="6" fill={wood}/>{[2,8,14].map(x=><rect key={x} x={x-1} y="2" width="2" height="12" fill={darkWood}/>)}</>
  case 'timber-beam':return <><rect x=".5" y="2" width="15" height="12" fill={darkWood}/><path d="M1 5H15M1 10H15M4 3L6 6M11 9L13 12" stroke={wood}/></>
  case 'roof-tile':return <><rect x=".5" y=".5" width="15" height="15" fill="#a05f4c"/>{[1,5,9,13].map(y=><path key={y} d={`M1 ${y}Q4 ${y+3} 7 ${y}Q10 ${y+3} 15 ${y}`} fill="none" stroke="#d1936c"/>)}<path d="M8 1V15" stroke="#623e35"/></>
  case 'stairs':return <><rect x=".5" y=".5" width="15" height="15" fill={stone}/>{[3,6,9,12].map(y=><path key={y} d={`M1 ${y}H15`} stroke="#485b58"/>)}<path d="M1 1H15" stroke="#c5c8b8" strokeWidth="1.2"/></>
  case 'dungeon-arch':return <><rect x=".5" y=".5" width="4" height="15" fill={stone}/><rect x="11.5" y=".5" width="4" height="15" fill={stone}/><path d="M1 5H4M12 10H15" stroke="#566560"/>{!open&&<path d="M4 8H12" stroke={darkWood} strokeWidth="2"/>}</>
  case 'trap-pit':return <><rect x=".5" y=".5" width="15" height="15" fill={stone}/><rect x="2" y="2" width="12" height="12" fill={lit?'#162322':wood}/>{!lit&&<path d="M2 6H14M2 10H14" stroke={darkWood}/>}</>
  case 'trap-spikes':return <><rect x=".5" y=".5" width="15" height="15" fill="#6b7470"/>{[4,8,12].flatMap(x=>[4,8,12].map(y=>lit?<path key={x+':'+y} d={`M${x-1.4} ${y+1.5}L${x} ${y-1.7}L${x+1.4} ${y+1.5}Z`} fill="#d0d7c6"/>:<circle key={x+':'+y} cx={x} cy={y} r="1.2" fill="#323c39"/>))}</>
  case 'trap-fire':return <><rect x=".5" y=".5" width="15" height="15" fill="#596c69"/><circle cx="8" cy="8" r="5.5" fill="#303f3b"/><path d="M4 8H12M8 4V12" stroke={iron} strokeWidth="1.2"/>{lit&&<Flame y={13} scale={1.1}/>}</>
 }
}
function Side({asset,open,lit,edge,rear}:Sketch){
 switch(asset){
  case 'table':return <TableSide/>
  case 'round-table':return <TableSide round/>
  case 'chair':return <>{edge?<><path d="M2 1H4V9H14V11H4V15H2Z" fill={wood}/><path d="M12 11V15" stroke={darkWood} strokeWidth="1.5"/></>:<><path d="M3 3V15M13 3V15" stroke={darkWood} strokeWidth="1.4"/><rect x="2" y="1" width="12" height={rear?9:3} rx=".6" fill={wood}/><rect x="2" y="9" width="12" height="2" fill={lightWood}/></>}</>
  case 'stool':return <><path d="M4 3L2 15.7M12 3L14 15.7M4 12H12" stroke={darkWood} strokeWidth="1.5"/><ellipse cx="8" cy="1.5" rx="7" ry="1.2" fill={lightWood}/></>
  case 'bench':return <><path d="M3 3V15.7H5V3M11 3V15.7H13V3" fill={darkWood}/><rect x=".7" y=".3" width="14.6" height="2.7" rx=".5" fill={lightWood}/><path d="M4 11H12" stroke={wood}/></>
  case 'bar':return <><rect x="1" y="3" width="14" height="12.7" fill={wood}/><path d="M4 5V15M8 5V15M12 5V15" stroke={darkWood}/><rect x=".5" y=".3" width="15" height="2.7" rx=".5" fill={lightWood}/></>
  case 'mug':return <><path d="M10 6Q15 4 15 8Q15 12 10 11" fill="none" stroke={clay} strokeWidth="1.8"/><path d="M2 4H11V12Q10 15 6.5 15Q2 15 2 12Z" fill={clay}/><ellipse cx="6.5" cy="4" rx="4.5" ry="1.5" fill="#59412c"/></>
  case 'plate':return <><ellipse cx="8" cy="9" rx="7" ry="2.5" fill="#d4bd99"/><path d="M2 8Q8 11 14 8" fill="none" stroke="#f3e1b9"/><path d="M5 12H11" stroke="#86765b"/></>
  case 'bread':return <><path d="M1 12Q0 5 5 3Q12 1 15 8V13Q8 16 1 12Z" fill="#d8a25b"/><path d="M5 4L4 8M10 4L9 8" stroke="#925d35"/></>
  case 'barrel':return <><path d="M3 2Q0 8 3 14Q8 17 13 14Q16 8 13 2Z" fill={wood}/><path d="M2 5H14M2 12H14" stroke={iron} strokeWidth="1.5"/><ellipse cx="8" cy="1.8" rx="5" ry="1.5" fill={open?'#302a23':lightWood}/><path d="M6 4V14M10 4V14" stroke={darkWood}/></>
  case 'shelf':return <><rect x="1" y=".5" width="14" height="15" fill={darkWood}/>{edge?<path d="M4 1V15M12 1V15" stroke={wood}/>:<>{[1,5,9,13].map(y=><rect key={y} x="2" y={y} width="12" height="1.5" fill={lightWood}/>)}{[4,8,12].flatMap(x=>[4,8,12].map(y=><circle key={x+':'+y} cx={x} cy={y} r="1.1" fill="#c8bca4"/>))}</>}</>
  case 'bed':return <><path d="M1 2H3V15H1ZM13 6H15V15H13Z" fill={darkWood}/><rect x="3" y="7" width="10" height="4" fill="#d8cbb0"/><rect x="3" y="10" width="10" height="2" fill={wood}/><path d={edge?'M5 7H13V10H5Z':'M3 7H13V10H3Z'} fill="#7d8a70"/></>
  case 'rug':return <><rect x=".5" y="10" width="15" height="2" rx=".6" fill="#9d7660"/><path d="M1 13H3M13 13H15" stroke="#d3b27a"/></>
  case 'chest':return <><rect x="1" y="7" width="14" height="8" rx=".5" fill={wood}/>{open?<><path d="M2 7V2Q8 0 14 2V5" fill={lightWood}/><rect x="2" y="6" width="12" height="2.5" fill="#302b25"/></>:<path d="M1 7V3Q8-2.4 15 3V7Z" fill={lightWood}/>}<path d="M4 8V15M12 8V15" stroke={iron} strokeWidth="1.3"/>{!open&&<rect x="7" y="7" width="2" height="3" fill="#d7b975"/>}</>
  case 'candle':return <><ellipse cx="8" cy="14" rx="7" ry="1.4" fill={iron}/><path d="M4 13V8H6V13M7 13V5H9V13M10 13V9H12V13" fill="#e3d6b3"/>{lit&&<><Flame x={5} y={8} scale={.6}/><Flame y={5} scale={.6}/><Flame x={11} y={9} scale={.6}/></>}</>
  case 'brazier':return <><path d="M4 11L2 15M12 11L14 15" stroke={iron} strokeWidth="1.4"/><path d="M1 7H15L12 12H4Z" fill={iron}/><ellipse cx="8" cy="7" rx="7" ry="1.5" fill="#302c29"/>{lit&&<Flame y={9} scale={1}/>}</>
  case 'fireplace':return <><rect x="1" y="2" width="14" height="13" fill={stone}/><rect x=".5" y="1" width="15" height="2.5" fill="#b8bba9"/><path d="M4 15V9Q8 4 12 9V15Z" fill="#262c28"/>{lit&&<Flame y={15} scale={.9}/>}</>
  case 'torch':return <><rect x="5" y="7" width="6" height="7" rx=".5" fill={iron}/><path d="M8 5V16" stroke={darkWood} strokeWidth="2.3"/>{lit?<Flame y={9} scale={1.15}/>:<path d="M5 3H11L10 8H6Z" fill="#635541"/>}</>
  case 'chandelier':return <><path d="M8 0V6M2 11Q8 15 14 11" fill="none" stroke={iron} strokeWidth="1.2"/><path d="M3 10H13M3 10V7M8 11V7M13 10V7" stroke={iron} strokeWidth="1.4"/>{lit&&[3,8,13].map(x=><Flame key={x} x={x} y={7} scale={.55}/>)}</>
  case 'timber-wall':case 'timber-window':return <><rect x=".5" y=".5" width="15" height="15" fill={edge?darkWood:'#c2b492'}/>{!edge&&<><path d="M1 1H15M1 15H15M3 1V15M13 1V15M3 15L13 1" stroke={darkWood} strokeWidth="1.1"/>{asset==='timber-window'&&<><rect x="4" y="4" width="8" height="7" fill="#88ada7"/><path d="M8 4V11M4 7.5H12" stroke={lightWood}/></>}</>}</>
  case 'timber-door':return <><path d="M1 15V1H15V15" fill="none" stroke={darkWood} strokeWidth="1.5"/><rect x="3" y="2" width={open?3:10} height="13" fill={wood}/>{!open&&<><path d="M6 3V14M10 3V14" stroke={darkWood}/><circle cx="11" cy="9" r=".8" fill="#e4c783"/></>}</>
  case 'stone-wall':return <><rect x=".5" y=".5" width="15" height="15" fill={stone}/><path d="M1 5H15M1 10H15M5 1V5M11 5V10M5 10V15" stroke="#586962"/></>
  case 'timber-pillar':return <><rect x="3" y="2" width="10" height="12" fill={wood}/><rect x="1" y=".5" width="14" height="2.5" fill={lightWood}/><rect x="1" y="13" width="14" height="2.5" fill={darkWood}/><path d="M6 4V12M10 4V12" stroke={darkWood}/></>
  case 'timber-railing':return <><path d="M2 3V15M8 3V15M14 3V15" stroke={wood} strokeWidth={edge?3:1.5}/><rect x=".5" y="1" width="15" height="3" rx=".4" fill={lightWood}/><path d="M1 13H15" stroke={darkWood}/></>
  case 'timber-beam':return <><rect x=".5" y="2" width="15" height="12" fill={wood}/><path d="M1 4H15M1 12H15M4 5L6 7M11 9L13 11" stroke={darkWood}/></>
  case 'roof-tile':return <><path d={edge?'M.5 10L15.5 1V7L.5 15Z':'M.5 14L8 1L15.5 14Z'} fill="#a66a50"/><path d={edge?'M1 12L15 3M1 14L15 5':'M4 9H12M2 13H14M8 2V13'} stroke="#d29b76" fill="none"/></>
  case 'stairs':return <><path d={edge?'M1 15.7V12H4V8H7V4H10V.3H15V15.7Z':'M1 .3H15V15.7H1Z'} fill={stone}/><path d="M1 12H15M4 9H15M7 6H15" stroke="#566d65"/></>
  case 'dungeon-arch':return <><path d="M1 15V7Q1 0 8 .5Q15 0 15 7V15H11V7Q11 4 8 4Q5 4 5 7V15Z" fill={stone}/><path d="M1 9H5M11 12H15M8 1V4" stroke="#566560"/>{!open&&<path d="M5 7H11V15H5Z" fill={darkWood}/>}</>
  case 'trap-pit':return <><path d="M.5 10H15.5V14H.5Z" fill={stone}/><ellipse cx="8" cy="10" rx="6" ry="2" fill={lit?'#162322':wood}/>{!lit&&<path d="M3 10H13" stroke={darkWood}/>}</>
  case 'trap-spikes':return <><rect x=".5" y="13" width="15" height="2" fill={iron}/>{[3,8,13].map(x=><path key={x} d={lit?`M${x-2} 13L${x} 1L${x+2} 13Z`:`M${x-2} 13L${x} 11L${x+2} 13Z`} fill="#c3cec0"/>)}</>
  case 'trap-fire':return <><rect x="1" y="12" width="14" height="3" rx=".5" fill={iron}/><path d="M4 12V10M12 12V10" stroke="#b3c4b3" strokeWidth="1.5"/>{lit&&<><Flame x={5} y={12} scale={1.2}/><Flame x={11} y={12} scale={1.2}/></>}</>
 }
}

export default function SceneObjectGlyph({object,view}:{object:Appearance;view:Scene['view']}){
 const asset=tabletopAsset(object.asset)
 if(!asset||asset.kind!==object.kind||isFloorAsset(asset.id))return <SceneGlyph kind={object.kind} open={object.open}/>
 const facing=[0,90,180,270].includes(object.facing??0)?object.facing??0:0,lit=object.active!==false
 const sketch={asset:asset.id,open:object.open,lit,edge:facing%180!==0,rear:facing===180}
 // Side hit targets retain their existing 0.2 m minimum. Thin drawings occupy
 // their actual height at the bottom of that target, so plates do not float.
 const ratio=Math.min(1,Math.max(.025,object.height)/.2)
 const sideTransform=[ratio<1?`translate(0 ${16*(1-ratio)}) scale(1 ${ratio})`:'',facing>=180?'translate(16 0) scale(-1 1)':''].filter(Boolean).join(' ')||undefined
 return <svg viewBox="0 0 16 16" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" pointerEvents="none" shapeRendering="geometricPrecision" data-schematic-asset={asset.id} data-schematic-view={view}>
  <g stroke={ink} strokeWidth=".6" strokeLinejoin="round" strokeLinecap="round" transform={view==='top'?`rotate(${facing} 8 8)`:sideTransform}>{view==='top'?<Top {...sketch}/>:<Side {...sketch}/>}</g>
 </svg>
}
