type GroundVector={x:number;z:number}

// Classify a wall along its thickness normal. A diagonal radial test would
// incorrectly cut the front half of the far side wall in a long room.
export function nearCutawayWall(position:GroundVector,target:GroundVector,direction:GroundVector,facing=0){
 const axis=facing%180===0?'z':'x'
 return (position[axis]-target[axis])*direction[axis]>.4
}
