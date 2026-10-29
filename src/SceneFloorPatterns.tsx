// The same flat floor symbols are used for the master and for disclosed maps.
// Prefixes are local to a viewport; these patterns contain no scene entities.
export default function SceneFloorPatterns({suffix}:{suffix:string}){
 return <>
  <pattern id={'floor-stone-'+suffix} width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#727a73"/><path d="M0 0H2V2H0ZM0 1H2M1 0V1M.5 1V2" fill="none" stroke="#4d5752" strokeWidth=".035"/></pattern>
  <pattern id={'floor-wood-'+suffix} width="1" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="2" fill="#806448"/><path d="M0 0V2M.5 0V2M0 .6H.5M.5 1.5H1" fill="none" stroke="#534839" strokeWidth=".035"/></pattern>
  <pattern id={'floor-grass-'+suffix} width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#496449"/><path d="M.2 .4l.1-.1 .1 .15M.6 .8l.1-.15 .1 .1" fill="none" stroke="#71865e" strokeWidth=".025"/></pattern>
 </>
}
