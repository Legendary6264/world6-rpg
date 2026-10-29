// Actual base model geometry, rendered on CPU without WebGL/PBR verification.
const fs=require('node:fs'),path=require('node:path'),{render}=require('./generate-tabletop-thumbnails.cjs')
const profiles={wall:[3.2,.6,2.6],door:[2,.5,3],crate:[1.6,1.1,1.2],platform:[2.6,1.8,.8],lamp:[.8,.8,2.8],tree:[3,3,4.2],rock:[2.4,1.6,1.3],water:[3,2,.03]}
const review=process.argv.includes('--review'),destination=review?'/tmp/world6-v16-basic-review':path.resolve(__dirname,'../public/basic-thumbnails')
fs.mkdirSync(destination,{recursive:true})
for(const [kind,[width,depth,height]] of Object.entries(profiles)){
 for(const state of ['default',...(['door','crate'].includes(kind)?['open']:kind==='lamp'?['off']:[])]){
  const geometry={kind,width,depth,height,open:state==='open',active:state!=='off'},id=kind+(state==='default'?'':'-'+state)
  const result=render({id},{geometry,...(review?{width:640,height:480}:{})})
  fs.writeFileSync(path.join(destination,id+'.png'),result.buffer);console.log(id,result.buffer.length+' B')
 }
}
