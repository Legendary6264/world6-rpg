// CPU previews of actual saved-size meshes. No WebGL, PBR texture or GPU-shadow claim.
const fs=require('node:fs'),path=require('node:path'),{render,load}=require('./generate-tabletop-thumbnails.cjs')
const {legacyAssets}=load('legacyAssets'),{createEnvironmentObject}=load('sceneEditorPlacement')
for(const slug of ['bridge','rope-bridge','ladder']){
 const a=legacyAssets.find(a=>a.slug===slug),geometry=createEnvironmentObject(a.kind,a.id,'review:'+slug,{x:0,y:0,z:0})
 const thumbnail=render(a,{geometry,width:160,height:132}),review=render(a,{geometry,width:640,height:480})
 fs.writeFileSync(path.resolve(__dirname,'../public/legacy-thumbnails/'+slug+'.png'),thumbnail.buffer)
 fs.writeFileSync(path.resolve(__dirname,'../docs/assets/legacy-v023-'+slug+'.png'),review.buffer)
 console.log(slug,review.stats??'rendered actual mesh')
}
