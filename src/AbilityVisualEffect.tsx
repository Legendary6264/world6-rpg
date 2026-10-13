import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { abilityVisualAnchor, abilityVisualDefaults, abilityVisualFamilyById } from './abilityVisuals'
import type { AbilityVisualFamilyId, AbilityVisualParticle, AbilityVisualPhase, AbilityVisualPoint, AbilityVisualShape } from './abilityVisuals'
import './abilityVisuals.css'

export type AbilityVisualEffectProps = {
  familyId: AbilityVisualFamilyId
  start: AbilityVisualPoint
  end: AbilityVisualPoint
  phase?: AbilityVisualPhase
  shape?: AbilityVisualShape
  radius?: number
  coneAngleDeg?: number
  scale?: number
  intensity?: number
  durationMs?: number
  paused?: boolean
  reducedMotion?: boolean
  /** Optional projected travel position, 0 = source, 1 = destination. */
  progress?: number
}
const limit = (value: number | undefined, fallback: number, low: number, high: number) =>
  value !== undefined && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback
const orb = <><circle r=".56" className="w6-vfx-shade"/><circle r=".36" className="w6-vfx-primary"/><circle cx="-.12" cy="-.15" r=".13" className="w6-vfx-highlight"/></>

function FamilyGlyph({ familyId }: { familyId: AbilityVisualFamilyId }): ReactNode {
  switch (familyId) {
    case 'fire': return <>
      <path d="M-.58 .5C-.85 .05-.23-.1-.39-.62C-.11-.52 .07-.27 .06-.07C.38-.36 .22-.69 .36-1C.65-.62 .44-.34 .64-.07C1 .4 .45 .75 0 .74Z" className="w6-vfx-primary w6-vfx-flutter"/>
      <path d="M-.22 .48C-.37 .13 .01 .03-.03-.27C.26-.02 .33 .19 .22 .51Z" className="w6-vfx-highlight w6-vfx-breathe"/>
      <path d="M-.6 .69H.5M-.3 .86H.24" className="w6-vfx-line w6-vfx-smoke"/>
    </>
    case 'water': return <>
      <path d="M0-.92C-.19-.51-.68-.05-.68 .3A.68 .68 0 0 0 .68 .3C.68-.05 .19-.51 0-.92Z" className="w6-vfx-primary w6-vfx-breathe"/>
      <path d="M-.38 .06C-.59 .39-.37 .63-.12 .59" className="w6-vfx-light-line"/>
      <g className="w6-vfx-orbit"><path d="M-.97 .48Q-.52 .17 0 .45T.97 .44M-.84 .7Q-.5 .5 0 .67T.83 .66" className="w6-vfx-line"/></g>
    </>
    case 'earth': return <>
      <path d="M-.72-.15L-.4-.66 .18-.77 .7-.35 .63 .46 .17 .72-.57 .49Z" className="w6-vfx-shade"/>
      <path d="M-.4-.66 .18-.77 .48-.35-.02-.1-.72-.15Z" className="w6-vfx-primary"/>
      <path d="M-.02-.1 .04 .24-.2 .52M.04 .24 .45 .43M-.02-.1 .15-.52" className="w6-vfx-light-line"/>
      <path d="M-.97 .37-.69 .58M.76 .71.96 .44M.37-.96.51-.82" className="w6-vfx-line w6-vfx-flutter"/>
    </>
    case 'metal': return <>
      <g className="w6-vfx-turn"><path d="M-.09-.97 .14-.72 .1-.1 .78-.51 .96-.32 .26 .13 .62 .8 .35 .94-.09 .27-.65 .76-.85 .49-.24-.08-.89-.59-.65-.84-.1-.34Z" className="w6-vfx-primary"/>
        <path d="M0-.81V.05L.65-.29M.02 .05 .37 .7M.02 .05-.59 .5M.02 .05-.61-.57" className="w6-vfx-light-line"/></g>
      <circle r=".18" className="w6-vfx-highlight"/>
    </>
    case 'vegetation': return <>
      <path d="M0 .85C-.22 .25 .15-.19 .02-.74M-.08 .39C-.57 .39-.78 .16-.66-.14C-.25-.17-.12 .04-.08 .39M.03-.03C.45.02 .67-.28 .51-.56C.12-.54 .02-.35 .03-.03" className="w6-vfx-primary w6-vfx-growth"/>
      <path d="M0 .86C-.21 .3 .17-.25 .01-.7M-.34 .75-.57 .97M.08 .64.41 .83" className="w6-vfx-light-line"/>
      <path d="M-.93 .6Q-.53 .29-.24 .71T.8 .56" className="w6-vfx-line w6-vfx-flutter"/>
    </>
    case 'wind': return <>
      <g className="w6-vfx-turn"><path d="M-.7-.19C-.35-.93 .53-.9 .69-.25C.81 .33 .32 .47 .04 .25M.36 .57C-.14 .9-.8 .69-.72 .13M-.31-.16C-.02-.4 .3-.21 .18 .05" className="w6-vfx-light-line"/>
        <path d="M-.94-.42Q-.48-1 .18-.92M.72 .78Q.2 1-.36 .9" className="w6-vfx-line"/></g>
    </>
    case 'blood': return <>
      <path d="M0-.83C-.13-.56-.57-.07-.57 .26A.57 .57 0 0 0 .57 .26C.57-.07 .13-.56 0-.83Z" className="w6-vfx-primary w6-vfx-breathe"/>
      <path d="M-.84 .66C-.28 .26-.6-.57-.85-.68M.61 .82C.1 .27 .63-.17 .88-.48" className="w6-vfx-line w6-vfx-flutter"/>
      <path d="M-.21 .17C-.39 .44-.13 .6 .05 .5" className="w6-vfx-light-line"/>
    </>
    case 'electricity': return <>
      <path d="M.15-.99-.54 .14-.07 .08-.29 .95 .64-.3 .13-.23Z" className="w6-vfx-highlight w6-vfx-flicker"/>
      <path d="M-.4-.52-.77-.4-.62-.1-.95 .04M.43 .33.8 .19.69 .56.96 .65" className="w6-vfx-line w6-vfx-flicker"/>
      <circle r=".83" className="w6-vfx-outline" strokeDasharray=".16 .42"/>
    </>
    case 'light': return <>
      <g className="w6-vfx-turn"><path d="M0-.96 .12-.2 .68-.68 .2-.12 .96 0 .2 .12 .68 .68 .12 .2 0 .96-.12 .2-.68 .68-.2 .12-.96 0-.2-.12-.68-.68-.12-.2Z" className="w6-vfx-primary"/></g>
      <circle r=".24" className="w6-vfx-highlight w6-vfx-breathe"/><circle r=".61" className="w6-vfx-outline"/>
    </>
    case 'healing': return <>
      <g className="w6-vfx-breathe"><path d="M-.14-.54H.14V-.14H.54V.14H.14V.54H-.14V.14H-.54V-.14H-.14Z" className="w6-vfx-highlight"/>
        <path d="M-.89 .3C-.79-.4-.22-.63 .25-.58M.89-.3C.79 .4 .22 .63-.25 .58" className="w6-vfx-line"/></g>
      <path d="M-.76 .65Q0 1.02 .76 .65M-.5-.78Q0-.98 .5-.78" className="w6-vfx-light-line w6-vfx-rise"/>
    </>
    case 'shadows': return <>
      <path d="M-.06-.73C-.26-.5-.62-.39-.54-.03C-.48 .21-.79 .53-.61 .75C-.22 .44-.1 .92 .23 .67C.47 .48 .67 .58 .8 .26C.42 .09 .64-.22 .27-.4Z" className="w6-vfx-shade w6-vfx-flutter"/>
      <path d="M-.88 .46Q-.2 .02-.45-.79M.87 .69Q.29 .03 .63-.74" className="w6-vfx-line w6-vfx-flutter"/>
      <path d="M-.23-.2-.07-.26M.12-.26.28-.2" className="w6-vfx-light-line"/>
    </>
    case 'fear': return <>
      <path d="M-.76-.06Q0-.85 .76-.06Q0 .51-.76-.06Z" className="w6-vfx-shade w6-vfx-shiver"/>
      <path d="M-.65-.06Q0-.62 .65-.06Q0 .4-.65-.06Z" className="w6-vfx-line"/>
      <path d="M0-.32 .13-.05 0 .21-.13-.05Z" className="w6-vfx-highlight w6-vfx-breathe"/>
      <path d="M-.79-.5-.98-.85M0-.71V-1M.79-.5.98-.85M-.57 .42-.78 .8M.57 .42.78 .8" className="w6-vfx-line w6-vfx-shiver"/>
    </>
    case 'decay': return <>
      <path d="M-.59-.61 .33-.68 .67-.19 .44 .61-.43 .55-.67 .02Z" className="w6-vfx-shade"/>
      <path d="M-.1-.63-.29-.11 .1 .04-.05 .58M-.29-.11-.62 .07M.1 .04 .58-.01" className="w6-vfx-light-line"/>
      <g className="w6-vfx-fragment"><path d="M-.83 .4-.96 .58-.73 .77-.6 .53M.63-.59.87-.62.98-.32.76-.25" className="w6-vfx-primary"/></g>
      <circle cx=".36" cy=".28" r=".13" className="w6-vfx-primary"/>
    </>
    case 'silence': return <>
      <circle r=".76" className="w6-vfx-shade"/><circle r=".76" className="w6-vfx-outline w6-vfx-breathe"/>
      <path d="M-.18-.15-.42-.32V.32L-.18 .15H.03V-.15ZM.25-.29Q.55 0 .25 .29M.43-.48Q.94 0 .43 .48" className="w6-vfx-line"/>
      <path d="M-.59 .67 .65-.65" className="w6-vfx-light-line"/>
    </>
    case 'oblivion': return <>
      <g className="w6-vfx-erase"><path d="M-.53-.49V-.75H.21M.53-.47V.15M.3 .73H-.39V.48M-.75 .14V-.13" className="w6-vfx-line"/>
        <path d="M-.22-.24H.23V.16H-.13V.4M-.13 .61H-.11" className="w6-vfx-light-line"/></g>
      <path d="M.68-.03H.98M.68 .19H.83M-.94 .46H-.72" className="w6-vfx-line w6-vfx-fragment"/>
    </>
    case 'hunger': return <>
      <g className="w6-vfx-turn"><path d="M-.8-.15A.82 .82 0 1 1 .47 .68L.24 .45 .42 .46 .32 .18 .59 .21 .55-.05 .76-.13" className="w6-vfx-line"/>
        <path d="M-.75-.15-.44-.12-.54 .13-.25 .12-.32 .38-.04 .24" className="w6-vfx-line"/></g>
      <path d="M-.24-.28 .28-.17 .1 .3-.28 .12Z" className="w6-vfx-shade w6-vfx-breathe"/>
    </>
    case 'void': return <>
      <circle r=".56" className="w6-vfx-shade"/><circle r=".59" className="w6-vfx-light-line"/>
      <g className="w6-vfx-turn"><ellipse rx=".95" ry=".76" className="w6-vfx-outline" strokeDasharray=".95 .35 .45 .2"/>
        <path d="M-.98 0H-.71M.71 0H.98M0-.98V-.71M0 .71V.98" className="w6-vfx-line"/></g>
    </>
    case 'space': return <>
      <path d="M-.05-1 .22-.49 .06-.18 .3 .17 .02 1-.2 .39-.02 .16-.28-.14Z" className="w6-vfx-shade w6-vfx-shiver"/>
      <path d="M-.05-.97 .06-.31-.03 .04 .07 .46 .02 .96" className="w6-vfx-light-line"/>
      <path d="M-.31-.67-.56-.72-.68-.41-.46-.2M.36 .19.62 .37.59 .72.38 .79" className="w6-vfx-line w6-vfx-fragment"/>
      <path d="M-.71 .27-.91 .52-.66 .73M.56-.49.73-.63.88-.34" className="w6-vfx-line"/>
    </>
    case 'reflection': return <>
      <g className="w6-vfx-orbit"><path d="M-.61-.68-.13-.48-.24 .72-.7 .47Z" className="w6-vfx-primary"/>
        <path d="M.61-.68 .13-.48 .24 .72 .7 .47Z" className="w6-vfx-primary" opacity=".65"/>
        <path d="M-.57-.55-.3-.43-.39 .43M.57-.55 .3-.43 .39 .43" className="w6-vfx-light-line"/></g>
      <path d="M0-.81V.83M-.93 .03H-.8M.8 .03H.93" className="w6-vfx-line" strokeDasharray=".08 .1"/>
    </>
    case 'runes': return <>
      <g className="w6-vfx-turn"><circle r=".83" className="w6-vfx-outline"/>
        {[0, 60, 120, 180, 240, 300].map(angle => <path key={angle} transform={`rotate(${angle})`} d="M-.09-.91V-.67H.09V-.91M0-.79H.17" className="w6-vfx-light-line"/>)}</g>
      <path d="M0-.56 .49 .28H-.49ZM0 .55-.49-.28H.49Z" className="w6-vfx-line"/>
      <circle r=".11" className="w6-vfx-highlight w6-vfx-breathe"/>
    </>
    case 'magnetism': return <>
      <path d="M-.63-.57V.12A.63 .63 0 0 0 .63 .12V-.57H.31V.12A.31 .31 0 0 1-.31 .12V-.57Z" className="w6-vfx-primary"/>
      <path d="M-.63-.37H-.31M.31-.37H.63" className="w6-vfx-light-line"/>
      <g className="w6-vfx-converge"><path d="M-.82-.67Q0-1.28 .82-.67M-.74-.45Q0-.96 .74-.45M-.45-.69V-.9M.45-.69V-.9" className="w6-vfx-line"/></g>
    </>
    case 'sand': return <>
      <path d="M-.97 .62Q-.7 .51-.34-.27Q-.02 .35 .19 .22Q.44-.57 .97 .57V.8H-.97Z" className="w6-vfx-shade"/>
      <path d="M-.89 .56Q-.49 .25-.34-.27Q-.11 .25 .15 .34Q.52 .02 .68-.2M-.7 .74Q0 .44 .74 .69" className="w6-vfx-line w6-vfx-drift"/>
      <g className="w6-vfx-sift">{[[-.66,-.3],[-.27,-.64],[.25,-.52],[.62,-.76],[.8,.08]].map(([x,y],i)=><rect key={i} x={x} y={y} width=".065" height=".065" className="w6-vfx-highlight"/>)}</g>
    </>
    case 'poisons': return <>
      <path d="M-.46-.68H.46L.29-.05Q.88 .59 .41 .81H-.41Q-.88 .59-.29-.05Z" className="w6-vfx-shade"/>
      <path d="M-.52 .29Q-.24 .08 0 .29T.52 .29V.53Q.48 .72 .28 .72H-.3Q-.52 .7-.52 .29Z" className="w6-vfx-primary w6-vfx-breathe"/>
      <g className="w6-vfx-rise"><circle cx="-.27" cy=".18" r=".09" className="w6-vfx-light-line"/><circle cx=".18" cy="-.2" r=".13" className="w6-vfx-line"/><circle cx="-.11" cy="-.88" r=".07" className="w6-vfx-highlight"/></g>
    </>
    case 'beast': return <>
      <path d="M-.47 .47C-.64 .13-.23-.06 0-.11C.23-.06 .64 .13 .47 .47Q0 .88-.47 .47" className="w6-vfx-primary w6-vfx-breathe"/>
      <g className="w6-vfx-stomp"><ellipse cx="-.56" cy="-.22" rx=".17" ry=".23" className="w6-vfx-primary"/><ellipse cx="-.21" cy="-.54" rx=".17" ry=".23" className="w6-vfx-primary"/><ellipse cx=".21" cy="-.54" rx=".17" ry=".23" className="w6-vfx-primary"/><ellipse cx=".56" cy="-.22" rx=".17" ry=".23" className="w6-vfx-primary"/></g>
      <path d="M-.91 .63-.76 .26M.75 .3.91 .67M-.26 .34Q0 .16 .26 .34" className="w6-vfx-light-line"/>
    </>
    case 'illusion': return <>
      <g className="w6-vfx-split"><path d="M-.66-.57Q-.1-.89 .32-.51L.24 .24-.09 .65-.54 .21ZM-.74-.06Q-.43-.29-.2-.07M-.03-.16 .16-.22" className="w6-vfx-line"/>
      <path d="M-.23-.55Q.27-.85 .7-.52L.55 .27 .24 .71-.11 .25ZM.05-.14 .23-.23M.35-.07Q.55-.24 .69-.07M.1 .4Q.26 .48 .41 .37" className="w6-vfx-light-line"/></g>
      <path d="M-.87-.85H.89M-.86 .89H.76" className="w6-vfx-line w6-vfx-scan" strokeDasharray=".1 .13"/>
    </>
    case 'copying': return <>
      <path d="M-.74-.73H.15V.25H-.74ZM-.39-.32H.72V.77H-.39Z" className="w6-vfx-shade"/>
      <path d="M-.74-.73H.15V.25H-.74ZM-.39-.32H.72V.77H-.39Z" className="w6-vfx-line"/>
      <path d="M-.56-.57-.27-.57V-.3H-.52M-.12-.13 .23-.13V.17H-.08" className="w6-vfx-light-line w6-vfx-scan"/>
      <path d="M-.06 .4H.5M.31 .21.5 .4.31 .59M-.78 .63H-.61" className="w6-vfx-light-line"/>
    </>
    case 'dreams': return <>
      <path d="M.37-.8A.75 .75 0 1 0 .69 .57A.69 .69 0 0 1 .37-.8Z" className="w6-vfx-primary w6-vfx-drift"/>
      <path d="M-.8 .65Q-.89 .4-.64 .38Q-.46 .12-.19 .36Q.14 .27 .23 .53" className="w6-vfx-light-line"/>
      <g className="w6-vfx-orbit"><path d="M.6-.39V-.7M.45-.54H.76M.04-.81V-.99M-.05-.9H.14" className="w6-vfx-light-line"/><circle cx=".89" cy=".02" r=".05" className="w6-vfx-highlight"/></g>
    </>
    case 'divination': return <>
      <circle r=".75" className="w6-vfx-outline"/><path d="M-.61 .03Q0-.49 .61 .03Q0 .58-.61 .03Z" className="w6-vfx-line"/><circle cy=".03" r=".2" className="w6-vfx-highlight w6-vfx-breathe"/>
      <path d="M-.88-.2H.88" className="w6-vfx-light-line w6-vfx-scan"/>
      <g className="w6-vfx-turn"><path d="M0-1V-.82M0 1V.82M-1 0H-.82M1 0H.82M-.7-.7-.58-.58M.7 .7.58 .58" className="w6-vfx-line"/></g>
    </>
    case 'word': return <>
      <path d="M-.89-.58H.45V.48H-.33L-.63 .76V.48H-.89Z" className="w6-vfx-shade"/>
      <g className="w6-vfx-inscribe"><path d="M-.65-.31H-.4V-.08H-.65ZM-.23-.31V-.07H.09M-.64 .18H-.18M-.05 .18H.21" className="w6-vfx-light-line"/></g>
      <path d="M.58-.38Q.97-.05 .58 .29M.72-.59Q1.29-.04 .72 .51" className="w6-vfx-line w6-vfx-breathe"/>
    </>
    case 'trueNames': return <>
      <path d="M-.48-.63H.48V.62H-.48Z" className="w6-vfx-shade"/><path d="M-.48-.63H.48V.62H-.48ZM0-.88V-.65M0 .65V.88M-.88 0H-.5M.5 0H.88" className="w6-vfx-line"/>
      <path d="M-.22-.39V.37M-.22-.31 .19-.05-.22 .17M.08-.32V.41M-.33 .5H.31" className="w6-vfx-light-line w6-vfx-inscribe"/>
      <circle r=".91" className="w6-vfx-outline w6-vfx-orbit" strokeDasharray=".42 .18"/>
    </>
    case 'contracts': return <>
      <path d="M-.7-.69H.47V.74H-.57Q-.7 .67-.7 .5ZM.47-.69 .7-.54V.53H.49" className="w6-vfx-shade"/><path d="M-.7-.69H.47V.74H-.57Q-.7 .67-.7 .5ZM.47-.69 .7-.54V.53H.49" className="w6-vfx-line"/>
      <path d="M-.47-.43H.24M-.47-.2H.24M-.47 .02H-.02M-.47 .36Q-.33 .13-.14 .41M-.13 .4Q0 .2 .2 .42" className="w6-vfx-light-line w6-vfx-inscribe"/>
      <g className="w6-vfx-stomp"><circle cx=".39" cy=".57" r=".23" className="w6-vfx-primary"/><path d="M.31 .57 .39 .49 .47 .57 .39 .65Z" className="w6-vfx-highlight"/></g>
    </>
    case 'bonds': return <>
      <g className="w6-vfx-converge"><ellipse cx="-.33" rx=".5" ry=".32" transform="rotate(-35)" className="w6-vfx-line"/><ellipse cx=".33" rx=".5" ry=".32" transform="rotate(35)" className="w6-vfx-light-line"/></g>
      <path d="M-.94 .62Q-.62 .84-.21 .62M.22-.62Q.6-.86 .95-.66M-.78-.65 .78 .65" className="w6-vfx-line w6-vfx-breathe"/>
      <circle cx="-.77" cy="-.65" r=".09" className="w6-vfx-highlight"/><circle cx=".78" cy=".65" r=".09" className="w6-vfx-highlight"/>
    </>
    case 'soul': return <>
      <path d="M-.58 .82C-.68 .06-.4-.46 0-.77C.4-.46 .68 .06 .58 .82Q0 .38-.58 .82Z" className="w6-vfx-shade"/><path d="M-.58 .82C-.68 .06-.4-.46 0-.77C.4-.46 .68 .06 .58 .82" className="w6-vfx-line"/>
      <path d="M.03-.51C-.19-.19-.36-.13-.29 .15C-.2 .49 .28 .48 .3 .13C.27-.17 .06-.22 .03-.51Z" className="w6-vfx-highlight w6-vfx-rise"/>
      <path d="M-.89 .46Q-.62 .02-.86-.51M.88 .4Q.67-.17 .87-.58" className="w6-vfx-line w6-vfx-flutter"/>
    </>
    case 'spirits': return <>
      <path d="M-.54 .61V-.17A.54 .54 0 0 1 .54-.17V.63L.28 .47 .03 .77-.26 .51Z" className="w6-vfx-primary w6-vfx-drift" opacity=".72"/>
      <path d="M-.18-.08H-.06M.14-.08H.26M-.73 .86Q-.4 1.02-.05 .93T.76 .88" className="w6-vfx-light-line"/>
      <g className="w6-vfx-rise"><circle cx="-.83" cy="-.29" r=".09" className="w6-vfx-highlight"/><circle cx=".84" cy="-.58" r=".12" className="w6-vfx-light-line"/></g>
    </>
    case 'necromancy': return <>
      <path d="M-.38-.73Q-.71-.61-.56-.1L-.39 .06V.4H.39V.06L.56-.1Q.71-.61 .38-.73Z" className="w6-vfx-primary"/>
      <path d="M-.36-.32H-.14V-.12H-.36ZM.14-.32H.36V-.12H.14ZM0-.02-.08 .12H.08Z" className="w6-vfx-shade"/><path d="M-.3 .26H.3M-.16 .15V.4M0 .15V.4M.16 .15V.4" className="w6-vfx-light-line"/>
      <g className="w6-vfx-orbit"><path d="M-.8 .64 .73 .89M-.73 .89 .8 .64M-.83-.55Q-1.13 0-.89 .36M.83-.55Q1.13 0 .89 .36" className="w6-vfx-line"/></g>
    </>
    case 'curses': return <>
      <path d="M-.48-.62 .5 .62M.48-.62-.5 .62M-.47-.63H.47V.63H-.47Z" className="w6-vfx-line w6-vfx-shiver"/>
      <path d="M-.88-.67-.59-.33-.91-.23M.88-.66 .63-.3 .92-.13M-.8 .76-.53 .4-.86 .29M.8 .78 .55 .42 .91 .25" className="w6-vfx-primary w6-vfx-flutter"/>
      <circle r=".19" className="w6-vfx-highlight w6-vfx-flicker"/>
    </>
    case 'fading': return <>
      <g className="w6-vfx-diminish"><path d="M-.87-.67H.83M-.71-.36H.71M-.53-.05H.53M-.37 .26H.37M-.16 .57H.16" className="w6-vfx-light-line"/></g>
      <path d="M-.88 .7V.88H-.59M.89 .65V.89H.73M-.23-.93H.39" className="w6-vfx-line w6-vfx-erase"/>
      <circle cx=".26" cy=".8" r=".025" className="w6-vfx-highlight"/>
    </>
    case 'resonance': return <>
      <g className="w6-vfx-vibrate"><path d="M-.6-.79V-.05Q-.6 .15-.4 .15Q-.2 .15-.2-.05V-.79M-.4 .15V.79M.2-.79V-.05Q.2 .15 .4 .15Q.6 .15 .6-.05V-.79M.4 .15V.79" className="w6-vfx-light-line"/></g>
      <path d="M-.97-.54Q-1.19-.2-.97 .17M.97-.54Q1.19-.2 .97 .17M-.07-.31Q0-.16 .07-.31M-.87 .53Q0 1.06 .87 .53" className="w6-vfx-line w6-vfx-breathe"/>
    </>
    case 'echoes': return <>
      <path d="M-.88-.47Q-.41-.82-.41-.11Q-.41 .25-.76 .33M-.39-.35Q.13-.75 .13-.02Q.13 .4-.24 .48M.19-.2Q.76-.65 .76 .13Q.76 .59 .34 .67" className="w6-vfx-light-line w6-vfx-echo"/>
      <path d="M-.92 .56H-.71M-.36 .72H-.08M.28 .9H.59" className="w6-vfx-line"/>
    </>
    case 'absorption': return <>
      <path d="M-.51-.39V.49Q0 .86 .51 .49V-.39M-.51-.39Q0-.68 .51-.39Q0-.12-.51-.39" className="w6-vfx-line"/>
      <path d="M-.32 .12Q0-.09 .32 .12V.39Q0 .61-.32 .39Z" className="w6-vfx-primary w6-vfx-breathe"/>
      <g className="w6-vfx-converge"><path d="M-.95-.82-.4-.54M-.67-.59-.4-.54-.59-.77M.95-.82 .4-.54M.59-.77 .4-.54 .67-.59M0-1.03V-.68M-.12-.85 0-.68 .12-.85" className="w6-vfx-light-line"/></g>
    </>
    case 'limit': return <>
      <path d="M-.64-.71H.64V.71H-.64Z" className="w6-vfx-shade"/><path d="M-.64-.71H.64V.71H-.64Z" className="w6-vfx-light-line"/>
      <path d="M-.87-.45V-.94H-.39M.39-.94H.87V-.45M-.87 .45V.94H-.39M.39 .94H.87V.45" className="w6-vfx-line w6-vfx-breathe"/>
      <g className="w6-vfx-converge"><path d="M-1.02 0H-.72M1.02 0H.72M0-1.1V-.8M0 1.1V.8" className="w6-vfx-light-line"/></g>
    </>
    case 'embers': return <>
      <path d="M-.69 .11-.46-.12-.24 .05-.35 .36-.63 .36ZM.07-.48 .37-.67 .54-.35 .3-.06 .08-.17ZM.31 .51 .61 .26 .78 .52 .61 .79 .35 .74Z" className="w6-vfx-primary w6-vfx-stomp"/>
      <path d="M-.51 .12-.39 .15M.27-.4 .39-.35M.48 .54 .59 .5" className="w6-vfx-light-line"/>
      <path d="M-.83-.22-.94-.53M-.24-.48-.37-.85M.6-.15.86-.4M-.13 .57-.22 .91" className="w6-vfx-light-line w6-vfx-sift"/>
      <path d="M-.65 .69Q-.94 .17-.66-.59M.59 .09Q.75-.55 .48-.94" className="w6-vfx-line w6-vfx-smoke"/>
    </>
    case 'heatwave': return <>
      <path d="M-.85 .66A.86 .45 0 0 1 .85 .66M-.61 .68A.62 .3 0 0 1 .61 .68" className="w6-vfx-light-line"/>
      <g className="w6-vfx-vibrate"><path d="M-.62 .3C-.85-.04-.43-.27-.64-.72M-.21 .26C-.45-.18 .03-.31-.2-.91M.25 .26C.06-.09 .51-.39 .29-.84M.64 .3C.47-.04 .89-.21 .67-.65" className="w6-vfx-line"/></g>
    </>
    case 'rain': return <>
      <path d="M-.87-.27Q-1-.58-.64-.68Q-.47-1.07-.15-.82Q.13-1.03 .41-.72Q.9-.7 .88-.27Z" className="w6-vfx-shade"/>
      <path d="M-.87-.27Q-1-.58-.64-.68Q-.47-1.07-.15-.82Q.13-1.03 .41-.72Q.9-.7 .88-.27" className="w6-vfx-line"/>
      <g className="w6-vfx-sift"><path d="M-.58-.09-.75 .29M-.12-.1-.29 .28M.35-.1 .18 .28M.74 .12.57 .5M-.06 .42-.19 .74" className="w6-vfx-light-line"/></g>
      <path d="M-.89 .7Q-.73 .58-.57 .7M.25 .79Q.52 .57 .79 .79" className="w6-vfx-line w6-vfx-breathe"/>
    </>
    case 'tide': return <>
      <path d="M-.98 .63Q-.57 .53-.4-.08Q-.05-1.18 .75-.55Q.44-.72 .22-.32Q.06-.03 .47 .14Q.71 .5 .98 .57V.83H-.98Z" className="w6-vfx-primary w6-vfx-flutter"/>
      <path d="M-.83 .57Q-.36 .2-.28-.13Q-.13-.65 .3-.59M-.64 .69Q-.15 .41 .22 .53T.83 .66" className="w6-vfx-light-line"/>
      <path d="M-.52 .97Q0 .73 .53 .92" className="w6-vfx-line w6-vfx-drift"/>
    </>
    case 'mist': return <>
      <g className="w6-vfx-drift"><path d="M-.98 .11Q-.92-.16-.59-.12Q-.48-.47-.16-.25Q.09-.44 .34-.19Q.72-.31 .88 .03Q.66 .21 .43 .13Q.18 .37-.09 .16Q-.47 .37-.71 .13Z" className="w6-vfx-primary" opacity=".5"/>
      <path d="M-.87-.5Q-.47-.76-.15-.56T.78-.59M-.74 .61Q-.43 .43-.11 .61T.96 .55" className="w6-vfx-light-line"/></g>
      <path d="M-.99 .43H-.65M.51 .36H.91M-.29-.83H.23" className="w6-vfx-line w6-vfx-erase"/>
    </>
    case 'frost': return <>
      <g className="w6-vfx-growth">{[0,60,120,180,240,300].map(angle=><g key={angle} transform={`rotate(${angle})`}><path d="M0 0V-.9M0-.37-.26-.58M0-.37 .26-.58M0-.67-.13-.8M0-.67 .13-.8" className="w6-vfx-light-line"/><path d="M0-.98-.07-.86 .07-.86Z" className="w6-vfx-primary"/></g>)}</g>
      <path d="M0-.18 .16-.09 .16 .09 0 .18-.16 .09-.16-.09Z" className="w6-vfx-highlight w6-vfx-breathe"/>
    </>
    case 'roots': return <>
      <path d="M-.2-.76Q0-.95 .2-.76L.12-.31 .31 .01 .75 .31 .93 .64M.12-.31-.29 .03-.75 .27-.95 .63M-.29 .03-.3 .43-.61 .78M.31 .01 .22 .46 .45 .92M-.75 .27-.6 .46-.78 .88M.75 .31 .59 .62 .82 .89M0-.48-.02 .56-.15 .93" className="w6-vfx-line w6-vfx-growth" strokeWidth=".12"/>
      <path d="M-.1-.74V-.26M-.26 .06-.3 .37M.28 .04 .51 .24" className="w6-vfx-light-line"/>
    </>
    case 'thorns': return <>
      <g className="w6-vfx-turn"><circle r=".64" className="w6-vfx-line" strokeWidth=".11"/>{[0,60,120,180,240,300].map(angle=><path key={angle} transform={`rotate(${angle})`} d="M-.15-.63 .13-.64 .03-1ZM-.16-.56-.09-.33 .07-.62Z" className="w6-vfx-primary"/>)}</g>
      <path d="M-.37 .13Q-.13-.22 .21 .02T.38 .32" className="w6-vfx-light-line w6-vfx-growth"/>
    </>
    case 'blossom': return <>
      <g className="w6-vfx-bloom">{[0,72,144,216,288].map(angle=><path key={angle} transform={`rotate(${angle})`} d="M0-.1C-.4-.37-.34-.84 0-.9C.34-.84 .4-.37 0-.1Z" className="w6-vfx-primary"/>)}</g>
      <circle r=".2" className="w6-vfx-highlight"/><path d="M0 .26V.99M0 .82Q-.44 .88-.4 .56Q-.1 .49 0 .82" className="w6-vfx-line"/>
      <circle cx=".77" cy=".56" r=".06" className="w6-vfx-highlight w6-vfx-rise"/>
    </>
    case 'vines': return <>
      <g className="w6-vfx-growth"><path d="M-.33 .96C-.85 .21 .33-.05-.32-.95M.32 .96C.87 .3-.27-.31 .32-.95M-.4 .59Q-.9 .48-.78 .15Q-.47 .2-.4 .59M.4-.3Q.86-.43 .74-.74Q.46-.68 .4-.3" className="w6-vfx-primary"/></g>
      <path d="M-.29-.42Q-.72-.61-.69-.32Q-.65-.19-.54-.28M.31 .4Q.8 .16 .76 .47Q.73 .57 .61 .5" className="w6-vfx-light-line w6-vfx-flutter"/>
    </>
    case 'crystal': return <>
      <g className="w6-vfx-growth"><path d="M-.28 .72V-.56L0-.99 .28-.56V.72ZM-.83 .71-.93-.01-.68-.42-.43-.03-.32 .71ZM.4 .71 .39-.2 .68-.67 .94-.17 .82 .71Z" className="w6-vfx-primary"/>
      <path d="M0-.99V.68M-.28-.56 0-.34 .28-.56M-.68-.42-.57 .71M-.93-.01-.69 .1-.43-.03M.68-.67 .6 .71M.39-.2 .65-.01 .94-.17" className="w6-vfx-light-line"/></g>
    </>
    case 'dust': return <>
      <path d="M-.89 .53Q-1.08 .12-.69-.08Q-.83-.57-.38-.55Q-.14-.89 .11-.46Q.58-.8 .63-.23Q1.1-.05 .87 .42Q.36 .78-.1 .57Q-.54 .86-.89 .53Z" className="w6-vfx-shade w6-vfx-breathe"/>
      <path d="M-.65 .21Q-.31-.17 .02 .17T.68 .25M-.41-.3H-.32M.36-.28H.47M-.12 .51H.01" className="w6-vfx-light-line w6-vfx-sift"/>
      <path d="M-.95 .81H-.66M.61 .84H.99" className="w6-vfx-line"/>
    </>
    case 'rockfall': return <>
      <g className="w6-vfx-sift"><path d="M-.85-.49-.72-.86-.34-.79-.16-.42-.49-.15ZM.14-.19 .3-.58 .7-.51 .89-.16 .64 .09 .28 .08ZM-.13 .21 .04-.04 .31 .12 .25 .5-.04 .61Z" className="w6-vfx-primary"/>
      <path d="M-.72-.86-.59-.52-.85-.49M.3-.58 .49-.26 .89-.16M.04-.04 .09 .28 .25 .5" className="w6-vfx-light-line"/></g>
      <path d="M-.78 .7-.36 .77-.09 .66 .05 .85 .61 .69 .93 .77M-.53-.98-.41-1.16M.8-.64.92-.85" className="w6-vfx-line"/>
    </>
    case 'forging': return <>
      <path d="M-.91 .28H.9L.59 .53H.32V.81H-.47V.54L-.78 .49Z" className="w6-vfx-primary"/>
      <g className="w6-vfx-stomp"><path d="M-.34-.64-.1-.91 .47-.51 .24-.21ZM.13-.3-.34 .19" className="w6-vfx-light-line" strokeWidth=".14"/></g>
      <path d="M-.76-.01-.86-.26M-.42-.07-.5-.35M.49-.03 .64-.28M.74 .12.96 .06M.02 .04V.21" className="w6-vfx-light-line w6-vfx-flicker"/>
    </>
    case 'shield': return <>
      <path d="M0-.95 .72-.64 .59 .34Q.31 .73 0 .93Q-.31 .73-.59 .34L-.72-.64Z" className="w6-vfx-shade"/>
      <path d="M0-.95 .72-.64 .59 .34Q.31 .73 0 .93Q-.31 .73-.59 .34L-.72-.64Z" className="w6-vfx-light-line"/>
      <path d="M0-.85V.78M-.64-.37H.64M-.55 .13H.55M-.33 .54H.33" className="w6-vfx-line"/>
      <path d="M-.96-.51Q-1.07 .24-.76 .67M.96-.51Q1.07 .24 .76 .67" className="w6-vfx-line w6-vfx-breathe"/>
    </>
    case 'blades': return <>
      <g className="w6-vfx-orbit">{[-37,0,37].map(angle=><g key={angle} transform={`rotate(${angle})`}><path d="M-.07 .37V-.68L0-1.01 .12-.66 .08 .37Z" className="w6-vfx-primary"/><path d="M0-.82V.32M-.22 .41H.21M0 .43V.72" className="w6-vfx-light-line"/></g>)}</g>
      <path d="M-.86 .32Q0 .82 .86 .32" className="w6-vfx-line w6-vfx-drift"/>
    </>
    case 'gale': return <>
      <g className="w6-vfx-stream"><path d="M-.99-.49H.37Q.94-.49 .68-.82Q.47-1.04 .31-.75M-.8-.04H.87M-.96 .41H.31Q.91 .41 .62 .76Q.4 .98 .27 .64" className="w6-vfx-light-line"/></g>
      <path d="M-.34-.03Q-.74-.28-.81 .12Q-.75 .41-.34-.03ZM-.8 .12-.42 .03M.2 .19Q.35 .55 .68 .35Q.57 .06 .2 .19" className="w6-vfx-primary w6-vfx-drift"/>
    </>
    case 'cyclone': return <>
      <g className="w6-vfx-vibrate"><path d="M-.91-.61C-.72-.84 .72-.84 .91-.61C1.11-.34-.84-.12-.67 .06C-.53 .29 .53 .27 .66 .07C.87-.13-.5 .36-.43 .48C-.3 .66 .34 .62 .42 .45C.56 .26-.18 .74-.08 .83M-.73-.44Q0-.17 .73-.44M-.42 .15Q0 .36 .42 .15" className="w6-vfx-light-line"/></g>
      <path d="M-.5 .88Q0 1.03 .58 .85" className="w6-vfx-line w6-vfx-orbit"/>
    </>
    case 'pulse': return <>
      <path d="M0 .79C-.8 .19-.88-.22-.57-.57C-.37-.83-.08-.62 0-.38C.12-.64 .43-.78 .67-.51C.97-.14 .55 .42 0 .79Z" className="w6-vfx-shade w6-vfx-breathe"/>
      <path d="M-.91 .02H-.49L-.31-.2-.11 .38 .12-.37 .29 .06H.91" className="w6-vfx-light-line w6-vfx-vibrate"/>
      <path d="M-.22-.6-.4-.84-.69-.95M.33 .54 .52 .78 .81 .92M-.64 .4-.81 .65" className="w6-vfx-line w6-vfx-breathe"/>
    </>
    default: return orb
  }
}

function Particle({ kind }: { kind: AbilityVisualParticle }): ReactNode {
  if (kind === 'shard' || kind === 'leaf') return <path d={kind === 'leaf' ? 'M-.06 .09Q-.15-.04 .08-.13Q.15 .07-.06 .09' : 'M-.08-.11 .11-.06 .03 .12-.1 .03Z'}/>
  if (kind === 'spark' || kind === 'star' || kind === 'plus') return <path d="M-.03-.12H.03V-.03H.12V.03H.03V.12H-.03V.03H-.12V-.03H-.03Z"/>
  if (kind === 'dash' || kind === 'wisp') return <rect x="-.16" y="-.025" width=".29" height=".05" rx={kind === 'wisp' ? .025 : 0}/>
  if (kind === 'rune') return <path d="M-.08-.11V.12M-.08-.09 .08-.02-.08 .06M.06-.11V.11" fill="none" stroke="var(--vfx-highlight)" strokeWidth=".035"/>
  if (kind === 'petal') return <path d="M0 .09Q-.17-.03 0-.15Q.17-.03 0 .09"/>
  if (kind === 'feather') return <path d="M-.15 .08Q-.19-.09 .11-.13Q.18 .04-.15 .08M-.13 .07 .08-.1"/>
  if (kind === 'claw') return <path d="M-.09 .11-.06-.13-.02-.04 .02-.15 .03-.04 .09-.13 .06 .11Z"/>
  if (kind === 'square') return <rect x="-.06" y="-.06" width=".12" height=".12"/>
  if (kind === 'eye') return <path d="M-.14 0Q0-.17 .14 0Q0 .14-.14 0"/>
  if (kind === 'drop' || kind === 'wave') return <path d="M0-.13Q-.15 .07 0 .1Q.15 .07 0-.13"/>
  return <path d="M-.05 .1Q-.14 0 0-.16Q.16 .04 .06 .1Z"/>
}

/** Render inside an existing SVG. The caller owns playback events and visible-area clipping. */
export default function AbilityVisualEffect({ familyId, start, end, phase = 'impact', shape = 'point', radius,
  coneAngleDeg, scale, intensity, durationMs, paused = false, reducedMotion = false, progress }: AbilityVisualEffectProps) {
  const gradientId = 'w6-vfx-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const family = abilityVisualFamilyById(familyId)
  if (!family || ![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null
  const duration = limit(durationMs, abilityVisualDefaults.durationMs, 500, 10000)
  const areaRadius = limit(radius, 1, .001, 1e6)
  const size = areaRadius * limit(scale, 1, .25, 4)
  const power = limit(intensity, 1, .25, 2)
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) * 180 / Math.PI
  const moving = phase === 'travel' && progress === undefined
  const anchor = moving ? start : abilityVisualAnchor(start, end, phase, progress)
  const broad = (phase === 'impact' || phase === 'residue' || phase === 'travel') && shape !== 'point'
  const coneWidth = length * Math.tan(limit(coneAngleDeg, 60, 1, 179) * Math.PI / 360)
  const count = Math.min(12, Math.max(4, Math.round(power * 7)))
  const style = {
    '--vfx-primary': family.primary, '--vfx-highlight': family.highlight, '--vfx-shade': family.shade,
    '--vfx-duration': duration + 'ms', '--vfx-dx': dx + 'px', '--vfx-dy': dy + 'px',
    '--vfx-mid-x': dx / 2 + 'px', '--vfx-mid-y': dy / 2 + 'px',
  } as CSSProperties
  return <g className={`w6-vfx w6-vfx-${phase}${paused ? ' w6-vfx-paused' : ''}${reducedMotion ? ' w6-vfx-reduced' : ''}`}
    style={style} aria-hidden="true" pointerEvents="none" data-vfx-family={familyId} data-vfx-phase={phase}>
    <defs><radialGradient id={gradientId}><stop offset="0" stopColor={family.primary} stopOpacity=".22"/><stop offset="1" stopColor={family.primary} stopOpacity="0"/></radialGradient></defs>
    {broad && shape === 'sphere' && <g transform={`translate(${end.x} ${end.y})`}>
      <circle r={areaRadius} fill={`url(#${gradientId})`}/><circle r={areaRadius} className="w6-vfx-area" strokeWidth={areaRadius * .035} strokeDasharray={`${areaRadius * .16} ${areaRadius * .11}`}/>
      <circle r={areaRadius * .78} className="w6-vfx-area w6-vfx-breathe" strokeWidth={areaRadius * .025}/>
    </g>}
    {broad && (shape === 'beam' || shape === 'cone') && length > 0 && <g transform={`translate(${start.x} ${start.y}) rotate(${angle})`}>
      {shape === 'beam' ? <>
        <path d={`M0 0H${length}`} className="w6-vfx-channel" strokeWidth={size * .85}/>
        <path d={familyId === 'electricity' ? `M0 0L${length * .17} ${size * .35} ${length * .29} ${-size * .4} ${length * .48} ${size * .25} ${length * .65} ${-size * .3} ${length * .83} ${size * .25} ${length} 0` : `M0 0Q${length * .25} ${-size * .3} ${length * .5} 0T${length} 0`}
          className="w6-vfx-light-line w6-vfx-channel-core" strokeWidth={size * .12}/>
        <path d={`M0 ${-areaRadius}H${length}M0 ${areaRadius}H${length}`} className="w6-vfx-area" strokeWidth={areaRadius * .035}/>
      </> : <>
        <path d={`M0 0L${length} ${-coneWidth}Q${length + coneWidth * .2} 0 ${length} ${coneWidth}Z`} fill={family.primary} opacity=".1"/>
        <path d={`M0 0L${length} ${-coneWidth}M0 0L${length} ${coneWidth}`} className="w6-vfx-area" strokeWidth={size * .045}/>
        {[.25, .5, .75, 1].map(t => <path key={t} d={`M${length * t} ${-coneWidth * t}Q${length * t + coneWidth * t * .3} 0 ${length * t} ${coneWidth * t}`} className="w6-vfx-area w6-vfx-breathe" strokeWidth={size * .04}/>) }
      </>}
    </g>}
    <g transform={`translate(${anchor.x} ${anchor.y})`}><g className={moving ? 'w6-vfx-traveller' : ''}>
      <g transform={`scale(${size * (phase === 'preparation' ? .68 : .82)})`}>
        <circle r="1.45" fill={`url(#${gradientId})`}/>
        {phase === 'preparation' && <circle r="1.05" className="w6-vfx-outline w6-vfx-turn" strokeDasharray=".22 .11 .06 .11"/>}
        {(phase === 'release' || phase === 'impact') && <circle r=".94" className="w6-vfx-outline w6-vfx-shockwave"/>}
        <g className="w6-vfx-glyph"><FamilyGlyph familyId={familyId}/></g>
        <g className={'w6-vfx-particles' + (['hunger', 'void', 'absorption', 'magnetism'].includes(familyId) ? ' w6-vfx-inward' : '')}>
          {Array.from({ length: count }, (_, i) => {
            const turn = i * 360 / count + 17, distance = .88 + (i % 3) * .18
            return <g key={i} transform={`rotate(${turn}) translate(${distance} 0)`}>
              <g className="w6-vfx-particle" style={{ animationDelay: -duration * i / count + 'ms' }}><Particle kind={family.particle}/></g>
            </g>
          })}
        </g>
      </g>
    </g></g>
  </g>
}
