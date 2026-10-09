import { magicSymbolPaths } from './magicSymbols'
import type { MagicSchool } from './magicCatalog'
export default function MagicSigil({school,size=48}:{school:MagicSchool;size?:number}){
  return <svg className="w6-magic-sigil" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{color:school.color}}>
    <path d={magicSymbolPaths[school.id]} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}
