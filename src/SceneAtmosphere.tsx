import {useId} from 'react'
import type {SceneEnvironment} from './sceneEnvironment'

// A static illustration for the schematic and the WebGL loading state. It
// contains no scene information, receives no input and needs no animation loop.
export default function SceneAtmosphere({environment,night=false}:{environment:SceneEnvironment;night?:boolean}) {
 const id=useId().replace(/:/g,''),underground=environment==='underground'
 return <div className="gb-scene-atmosphere" data-environment={environment} data-cycle={night?'night':'day'} aria-hidden="true">
  <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" focusable="false">
   <defs>
    <linearGradient id={id+'-sky'} x2="0" y2="1"><stop stopColor={underground?'#101a21':night?'#101c33':'#547f98'}/><stop offset="1" stopColor={underground?'#26393e':night?'#2c414a':'#abc0b5'}/></linearGradient>
    <linearGradient id={id+'-ground'} x2="0" y2="1"><stop stopColor={underground?'#34464a':night?'#263d36':'#6b8454'}/><stop offset="1" stopColor={underground?'#182529':night?'#172c29':'#3d593b'}/></linearGradient>
    <radialGradient id={id+'-glow'}><stop stopColor={night?'#abc8de':'#f8dda0'} stopOpacity=".28"/><stop offset="1" stopColor={night?'#abc8de':'#f8dda0'} stopOpacity="0"/></radialGradient>
    <pattern id={id+'-grass'} width="90" height="68" patternUnits="userSpaceOnUse"><path d="m12 33-3-6m3 6 4-9m45 32-2-5m2 5 5-7M34 11l-2-4m2 4 3-5" stroke={night?'#8ba091':'#c3cd9d'} strokeWidth="1.2" opacity=".18"/></pattern>
   </defs>
   <rect width="1200" height="800" fill={'url(#'+id+'-sky)'}/>
   {underground?<g fill="#111e25" opacity=".85"><path d="M0 0h1200v154l-97-70-54 107-104-68-48 127-100-99-91 60-84-93-95 132-89-76-96 74-94-152-96 85-76-41L0 184Z"/><path d="M0 800V435l83 55 55-33 93 88 91-25 108 72 86-16 132 67 104-94 108 34 81-95 108 45 151-93v360Z"/></g>:<>
    <circle cx="970" cy="118" r="104" fill={'url(#'+id+'-glow)'}/>
    <g data-celestial={night?'moon':'sun'}>{night?<path d="M986 88a31 31 0 1 0 5 54 29 29 0 0 1-5-54" fill="#bdd4dc"/>:<circle cx="970" cy="118" r="25" fill="#edd69e"/>}</g>
    {night&&<g fill="#bad0dc" opacity=".6">{[[85,88],[196,156],[337,54],[469,136],[636,72],[755,183],[1101,67],[1140,238]].map(([x,y])=><circle key={x} cx={x} cy={y} r="1.6"/>)}</g>}
    <g fill={night?'#587085':'#d2ddd4'} opacity={night?.27:.48}>
     <path d="M105 150c-25-1-27-21-9-27 2-25 30-32 43-13 22-14 45-1 46 17 29 3 31 23 6 23Z"/>
     <path d="M611 96c-24-1-26-20-5-25 7-24 38-26 51-6 25-10 47 2 48 18 19 5 18 13-3 13Z"/>
     <path d="M997 272c-21-2-22-19-3-23 9-23 34-21 47-6 23-10 47 4 44 18 17 2 21 11-1 11Z"/>
    </g>
    <path d="M0 455Q182 402 350 453T720 441T1200 454V800H0Z" fill={'url(#'+id+'-ground)'}/>
    <path d="M0 455Q182 402 350 453T720 441T1200 454V800H0Z" fill={'url(#'+id+'-grass)'}/>
   </>}
  </svg>
 </div>
}
