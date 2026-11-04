import {resolveAbilityVisual} from './abilityVisuals'
import {copyAbilitySpatial} from './abilitySpatial'
import type {DeclarationAbility, DeclarationCharge} from './actionDeclarations'
import type {RpgState, LearnedAbility} from './rpgTypes'

// Own-hero options contain only presentation fields, never target actor IDs,
// action inputs, notes, formulas or the full paid ability snapshot.
const summary=(a:LearnedAbility):DeclarationAbility=>({id:a.id,name:a.name,rangeM:a.rangeM,cost:{...a.cost},visualEffect:resolveAbilityVisual(a),...(a.spatial?{spatial:copyAbilitySpatial(a.spatial)}:{})})
export function declarationAbilities(rpg:RpgState):{abilities:DeclarationAbility[];casts:DeclarationCharge[]} {
  const active=rpg.casts.filter(c=>c.ability.approved&&(c.status==='preparing'||c.status==='ready'))
  const abilities=new Map(rpg.abilities.filter(a=>a.approved).map(a=>[a.id,{...summary(a),canPrepare:true}]))
  for(const cast of active)if(!abilities.has(cast.ability.id))abilities.set(cast.ability.id,{...summary(cast.ability),canPrepare:false})
  const casts:DeclarationCharge[]=active.map(c=>{
    const {id:abilityId,...ability}=summary(c.ability),policy=c.ability.chargePolicy
    return {...ability,id:c.id,abilityId,status:c.status as DeclarationCharge['status'],binding:c.roundPreparation?.binding??'bound',readyAt:c.readyAt,
      holdUntil:c.status==='ready'&&c.roundPreparation&&policy?.maxHoldSeconds!==undefined&&policy.maxHoldSeconds!==null?c.readyAt+policy.maxHoldSeconds:null,
      holdCost:{...(c.roundPreparation?policy?.holdCost:undefined)??{mana:0,shadow:0,stamina:0}}}
  })
  return {abilities:[...abilities.values()],casts}
}
