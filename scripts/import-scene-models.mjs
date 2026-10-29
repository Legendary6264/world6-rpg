// Offline asset preparation. Runtime never contacts Poly Haven.
// node scripts/import-scene-models.mjs [/tmp/world6-assets]
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {MeshoptSimplifier} from 'three/examples/jsm/libs/meshopt_simplifier.module.js'

const cache=process.argv[2]??'/tmp/world6-assets',out='public/models'
const assets=[['wooden_crate_02','crate'],['wooden_lantern_01','lantern'],['pine_sapling_small','pine'],['rock_moss_set_01','rocks']]
mkdirSync(out,{recursive:true});await MeshoptSimplifier.ready
const credits=[]
function download(url,file){
 mkdirSync(join(file,'..'),{recursive:true})
 if(!existsSync(file))execFileSync('curl',['-fL','--retry','2','--max-time','90','-sS',url,'-o',file])
 return readFileSync(file)
}
for(const [id,name] of assets){
 const dir=join(cache,id),meta=JSON.parse(download('https://api.polyhaven.com/files/'+id,join(dir,'files.json')))
 const spec=meta.gltf['1k'].gltf,source=download(spec.url,join(dir,'source.gltf'))
 const doc=JSON.parse(source),sourceFiles=[]
 for(const [uri,file] of Object.entries(spec.include)){
  const bytes=download(file.url,join(dir,uri))
  if(createHash('md5').update(bytes).digest('hex')!==file.md5)throw Error('Source checksum: '+uri)
  sourceFiles.push({uri,url:file.url,md5:file.md5})
 }
 const buffers=doc.buffers.map(b=>readFileSync(join(dir,b.uri)))
 const parts=[],views=[],accessors=[];let length=0
 function append(data,target){
  const bytes=Buffer.from(data.buffer??data,data.byteOffset??0,data.byteLength??data.length)
  const offset=length,padding=(4-bytes.length%4)%4
  parts.push(bytes,Buffer.alloc(padding));length+=bytes.length+padding
  return views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})})-1
 }
 const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},arrays={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array}
 function attribute(index){
  const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],ArrayType=arrays[a.componentType],size=components[a.type]
  if(!ArrayType||a.sparse||v.byteStride)throw Error('Unsupported source accessor')
  const bytes=buffers[v.buffer].subarray((v.byteOffset??0)+(a.byteOffset??0),(v.byteOffset??0)+(a.byteOffset??0)+a.count*size*ArrayType.BYTES_PER_ELEMENT)
  return new ArrayType(Uint8Array.from(bytes).buffer)
 }
 function save(data,source,target){
  const a={...source,bufferView:append(data,target),count:data.length/components[source.type]}
  delete a.byteOffset;delete a.min;delete a.max
  if(source.type==='VEC3'&&target===34962&&source.min){
   a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity]
   for(let i=0;i<data.length;i++) {const k=i%3;a.min[k]=Math.min(a.min[k],data[i]);a.max[k]=Math.max(a.max[k],data[i])}
  }
  return accessors.push(a)-1
 }
 let triangles=0
 for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
  let indices=Uint32Array.from(attribute(primitive.indices))
  const positions=attribute(primitive.attributes.POSITION)
  if(name==='pine'&&indices.length>90000){
   // Retain UV seams and silhouette; do not use topology-destroying sloppy decimation.
   const [reduced]=MeshoptSimplifier.simplify(indices,positions,3,90000,.008)
   indices=reduced
  }
  const used=[...new Set(indices)],remap=new Map(used.map((v,i)=>[v,i]))
  const compact=used.length<65536?Uint16Array.from(indices,i=>remap.get(i)):Uint32Array.from(indices,i=>remap.get(i))
  for(const [key,index] of Object.entries(primitive.attributes)){
   const data=attribute(index),a=doc.accessors[index],size=components[a.type],packed=new data.constructor(used.length*size)
   used.forEach((old,next)=>packed.set(data.subarray(old*size,(old+1)*size),next*size))
   primitive.attributes[key]=save(packed,a,34962)
  }
  primitive.indices=save(compact,{componentType:compact.BYTES_PER_ELEMENT===2?5123:5125,type:'SCALAR'},34963)
  triangles+=compact.length/3
 }
 for(const image of doc.images){
  const file=join(dir,image.uri),compressed=file+'.optimized.jpg'
  // Preserve 1K resolution. Upstream JPEGs are near-lossless; quality 90 avoids
  // shipping several megabytes per map without changing the material's channels.
  execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=90,subsampling=0,optimize=True)',file,compressed])
  image.bufferView=append(readFileSync(compressed));image.mimeType='image/jpeg';delete image.uri
 }
 doc.asset.extras={source:'https://polyhaven.com/a/'+id,license:'CC0-1.0',processing:'Self-contained GLB, recompressed JPEG, compact indices; pine silhouette-preserving simplification.'}
 doc.buffers=[{byteLength:length}];doc.bufferViews=views;doc.accessors=accessors
 const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bin=Buffer.concat(parts),header=Buffer.alloc(20),binHeader=Buffer.alloc(8)
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+bin.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16)
 binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4)
 const glb=Buffer.concat([header,padded,binHeader,bin]);writeFileSync(join(out,name+'.glb'),glb)
 credits.push({id,file:name+'.glb',source:'https://polyhaven.com/a/'+id,license:'CC0-1.0',bytes:glb.length,triangles,sha256:createHash('sha256').update(glb).digest('hex'),sourceFiles})
 console.log(name,triangles+' triangles',(glb.length/1e6).toFixed(2)+' MB')
}
writeFileSync(join(out,'sources.json'),JSON.stringify(credits,null,2)+'\n')
const surfaces=[['medieval_blocks_03','stone'],['medieval_wood','wood'],['cobblestone_floor_03','paving'],['forest_ground_04','forest']]
mkdirSync('public/materials',{recursive:true})
const surfaceCredits=[]
for(const [id,name] of surfaces){
 const dir=join(cache,id),meta=JSON.parse(download('https://api.polyhaven.com/files/'+id,join(dir,'files.json'))),files=[]
 for(const [channel,key] of [['color','Diffuse'],['normal','nor_gl'],['arm','arm']]){
  const spec=meta[key]['1k'].jpg,file=join(dir,channel+'.jpg'),bytes=download(spec.url,file)
  if(createHash('md5').update(bytes).digest('hex')!==spec.md5)throw Error('Texture checksum: '+id)
  const target='public/materials/'+name+'-'+channel+'.jpg'
  execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=90,subsampling=0,optimize=True)',file,target])
  const result=readFileSync(target);files.push({channel,file:target.split('/').at(-1),url:spec.url,md5:spec.md5,bytes:result.length,sha256:createHash('sha256').update(result).digest('hex')})
 }
 surfaceCredits.push({id,source:'https://polyhaven.com/a/'+id,license:'CC0-1.0',files})
 console.log('material',name)
}
writeFileSync('public/materials/sources.json',JSON.stringify(surfaceCredits,null,2)+'\n')
