// Actual-mesh CPU previews; no claim about final WebGL texture/light quality.
const fs=require('node:fs'),path=require('node:path'),{render,load}=require('./generate-tabletop-thumbnails.cjs')
const {legacyAssets}=load('legacyAssets'),{createEnvironmentObject}=load('sceneEditorPlacement')
for(const slug of ['sack','basket','jar','amphora']){
 const a=legacyAssets.find(a=>a.slug===slug),geometry=createEnvironmentObject(a.kind,a.id,'review:'+slug,{x:0,y:0,z:0})
 for(const [file,width,height] of [['public/legacy-thumbnails/'+slug+'.png',160,132],['docs/assets/legacy-v025-'+slug+'.png',520,480]])fs.writeFileSync(path.resolve(__dirname,'../'+file),render(a,{geometry,width,height}).buffer)
 if(slug==='sack')fs.writeFileSync(path.resolve(__dirname,'../docs/assets/legacy-v025-sack-open.png'),render(a,{geometry:{...geometry,open:true},width:520,height:480}).buffer)
 console.log(slug,'rendered actual mesh')
}
