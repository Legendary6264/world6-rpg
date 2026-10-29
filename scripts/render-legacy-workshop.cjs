// CPU views of the real workshop meshes; GPU/PBR lighting is checked separately.
const fs=require('node:fs'),path=require('node:path'),{render,load}=require('./generate-tabletop-thumbnails.cjs')
const {legacyAssets}=load('legacyAssets'),{createEnvironmentObject}=load('sceneEditorPlacement')
for(const slug of ['anvil','grindstone','bellows']){
 const asset=legacyAssets.find(a=>a.slug===slug),geometry=createEnvironmentObject(asset.kind,asset.id,'review:'+slug,{x:0,y:0,z:0})
 for(const [file,width,height] of [['public/legacy-thumbnails/'+slug+'.png',160,132],['docs/assets/legacy-v028-'+slug+'.png',600,560]])fs.writeFileSync(path.resolve(__dirname,'../'+file),render(asset,{geometry,width,height}).buffer)
 console.log(slug,'rendered actual mesh')
}
