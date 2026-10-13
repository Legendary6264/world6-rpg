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
    default: return orb
  }
}

function Particle({ kind }: { kind: AbilityVisualParticle }): ReactNode {
  if (kind === 'shard' || kind === 'leaf') return <path d={kind === 'leaf' ? 'M-.06 .09Q-.15-.04 .08-.13Q.15 .07-.06 .09' : 'M-.08-.11 .11-.06 .03 .12-.1 .03Z'}/>
  if (kind === 'spark' || kind === 'star' || kind === 'plus') return <path d="M-.03-.12H.03V-.03H.12V.03H.03V.12H-.03V.03H-.12V-.03H-.03Z"/>
  if (kind === 'dash' || kind === 'wisp') return <rect x="-.16" y="-.025" width=".29" height=".05" rx={kind === 'wisp' ? .025 : 0}/>
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
        <g className={'w6-vfx-particles' + (familyId === 'hunger' || familyId === 'void' ? ' w6-vfx-inward' : '')}>
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
