// Previews of the actual generated meshes; no network, no WebGL/PBR claim.
const fs=require('node:fs'),path=require('node:path'),{render,load}=require('./generate-tabletop-thumbnails.cjs')
const {legacyAssets}=load('legacyAssets'),{createEnvironmentObject}=load('sceneEditorPlacement')
const destination=path.resolve(__dirname,'../public/legacy-thumbnails');fs.mkdirSync(destination,{recursive:true})
let bytes=0
for(const a of legacyAssets){
 const geometry=createEnvironmentObject(a.kind,a.id,'thumbnail:'+a.slug,{x:0,y:0,z:0}),result=render(a,{geometry,width:160,height:132})
 fs.writeFileSync(path.join(destination,a.slug+'.png'),result.buffer);bytes+=result.buffer.length
}
console.log('Actual mesh thumbnails:',legacyAssets.length,Math.round(bytes/1024)+' KiB')
