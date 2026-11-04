import {abilityVisualDurationMs,sampleAbilityVisual} from './abilityVisualTimeline'
import type {SceneAbilityVisual} from './sceneAbilityVisuals'

// One presentation clock per release, shared by SVG and WebGL. Historical
// effects are quiet on entry; only a newly observed release or explicit replay
// starts a sequence. Pausing, disabling and hiding the view are caller concerns.
export class SceneAbilityPlayback {
  private frame:string|undefined
  private seen=new Set<string>()
  private entries=new Map<string,{elapsed:number;duration:number;playing:boolean}>()
  constructor(frame:string,visuals:SceneAbilityVisual[]){this.sync(frame,visuals)}
  sync(frame:string,visuals:SceneAbilityVisual[],replay=false){
    const same=this.frame===frame
    if(!same){this.seen.clear();this.entries.clear();this.frame=frame}
    const next=new Map<string,{elapsed:number;duration:number;playing:boolean}>()
    for(const visual of visuals){
      if(visual.phase==='sequence'){
        const previous=this.entries.get(visual.id),fresh=same&&!this.seen.has(visual.id)
        next.set(visual.id,{elapsed:replay||fresh?0:previous?.elapsed??0,duration:abilityVisualDurationMs(visual),playing:replay||fresh||previous?.playing===true})
      }
      this.seen.add(visual.id)
    }
    this.entries=next
    // Keep active IDs and a bounded history across temporary disclosure loss.
    if(this.seen.size>1024){const current=new Set(visuals.map(v=>v.id));for(const id of this.seen){if(!current.has(id))this.seen.delete(id);if(this.seen.size<=1024)break}}
  }
  get active(){return [...this.entries.values()].some(e=>e.playing)}
  advance(deltaMs:number){
    if(!Number.isFinite(deltaMs)||deltaMs<=0)return
    for(const entry of this.entries.values())if(entry.playing){entry.elapsed=Math.min(entry.duration,entry.elapsed+deltaMs);if(entry.elapsed>=entry.duration)entry.playing=false}
  }
  elapsed(id:string){return this.entries.get(id)?.elapsed??0}
  sample(visual:SceneAbilityVisual,reduced=false,controlledMs?:number){
    const entry=this.entries.get(visual.id)
    return sampleAbilityVisual(visual,controlledMs??entry?.elapsed??0,controlledMs!==undefined||entry?.playing===true,reduced)
  }
}
