export type SchematicView={x:number;y:number;width:number;height:number}
export type SchematicFrame={width:number;height:number}
export const wholeSchematic=(frame:SchematicFrame):SchematicView=>({x:0,y:0,width:frame.width,height:frame.height})
export function constrainSchematic(view:SchematicView,frame:SchematicFrame):SchematicView{
 const width=Math.max(frame.width/12,Math.min(frame.width*2,view.width)),height=width*frame.height/frame.width
 const axis=(value:number,span:number,limit:number)=>{const margin=Math.min(span*.25,limit*.5),lo=-margin,hi=limit-span+margin;return hi<lo?(limit-span)/2:Math.max(lo,Math.min(hi,value))}
 return {x:axis(view.x,width,frame.width),y:axis(view.y,height,frame.height),width,height}
}
export function zoomSchematic(view:SchematicView,frame:SchematicFrame,scale:number,anchor={x:view.x+view.width/2,y:view.y+view.height/2}){
 const width=Math.max(frame.width/12,Math.min(frame.width*2,view.width*scale)),height=width*frame.height/frame.width,rx=(anchor.x-view.x)/view.width,ry=(anchor.y-view.y)/view.height
 return constrainSchematic({x:anchor.x-rx*width,y:anchor.y-ry*height,width,height},frame)
}
export function fitSchematic(bounds:{minX:number;minY:number;maxX:number;maxY:number},frame:SchematicFrame){
 const width=Math.max(frame.width/12,(bounds.maxX-bounds.minX)*1.45,(bounds.maxY-bounds.minY)*1.45*frame.width/frame.height),height=width*frame.height/frame.width
 return constrainSchematic({x:(bounds.minX+bounds.maxX-width)/2,y:(bounds.minY+bounds.maxY-height)/2,width,height},frame)
}
