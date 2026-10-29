// CPU previews of the five actual legacy models, not final WebGL lighting.
const fs=require('node:fs'),path=require('node:path'),{render,load}=require('./generate-tabletop-thumbnails.cjs')
const {legacyAssets}=load('legacyAssets'),{createEnvironmentObject}=load('sceneEditorPlacement')
for(const slug of ['campfire','torch','street-lamp','hanging-lantern','signal-lantern']){
 const a=legacyAssets.find(a=>a.slug===slug),geometry=createEnvironmentObject(a.kind,a.id,'review:'+slug,{x:0,y:0,z:0})
 for(const [file,width,height] of [['public/legacy-thumbnails/'+slug+'.png',160,132],['docs/assets/legacy-v024-'+slug+'.png',480,480]])fs.writeFileSync(path.resolve(__dirname,'../'+file),render(a,{geometry,width,height}).buffer)
 console.log(slug,'rendered actual mesh')
}
