// Native-geometry library thumbnails. This is a small orthographic CPU renderer,
// not a screenshot of the WebGL/PBR renderer. Run from any directory with:
// node scripts/generate-tabletop-thumbnails.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),ts=require('typescript'),THREE=require('three'),{pathToFileURL}=require('node:url')
const root=path.resolve(__dirname,'..'),cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(cache.has(name))return cache.get(name).exports
 const file=path.join(root,'src',name+'.ts'),mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports)
 return mod.exports
}
const {tabletopAssets,createTabletopObject}=load('tabletopCatalog'),{populateEntityModel}=load('scene3dMeshes')
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0})
function chunk(name,data){
 const type=Buffer.from(name),body=Buffer.concat([type,data]);let crc=0xffffffff
 for(const value of body)crc=crcTable[(crc^value)&255]^(crc>>>8)
 const length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0)
 return Buffer.concat([length,body,checksum])
}
function png(rgba,width=160,height=120){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6
 const scan=Buffer.alloc((width*4+1)*height)
 for(let y=0;y<height;y++)Buffer.from(rgba.buffer,y*width*4,width*4).copy(scan,y*(width*4+1)+1)
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))])
}
const key=new THREE.Vector3(-.5,1,.7).normalize(),fill=new THREE.Vector3(1,.5,-.35).normalize(),view=new THREE.Vector3(4.7,4.5,6).normalize(),half=key.clone().add(view).normalize()
const edge=(ax,ay,bx,by,px,py)=>(px-ax)*(by-ay)-(py-ay)*(bx-ax)
function display(value){const x=Math.max(0,value),a=(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),linear=Math.min(1,a);return Math.round(255*(linear<=.0031308?linear*12.92:1.055*linear**(1/2.4)-.055))}
function render(asset,options={}){
 const width=options.width??160,height=options.height??120,aa=3,W=width*aa,H=height*aa
 const geometry=options.geometry??createTabletopObject(asset.id,'thumbnail:'+asset.id,{x:0,y:0,z:0})
 if(!options.geometry&&asset.id==='chest')geometry.open=true
 const scene=new THREE.Group(),resources=[]
 populateEntityModel({id:geometry.id,geometry,appearance:{color:'#8d9985',heightKnown:true,remembered:false}},(g,color,x,y,z,s={})=>{
  const material=new THREE.MeshStandardMaterial({color}),part=new THREE.Mesh(g,material);part.position.set(x,y,z);part.userData.surface=s;scene.add(part);resources.push(g,material);return part
 })
 scene.updateMatrixWorld(true)
 const bounds=new THREE.Box3().setFromObject(scene,true),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,.1)
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,span*20+10)
 camera.position.copy(center).addScaledVector(view,span*5+3);camera.lookAt(center);camera.updateMatrixWorld()
 const projected=new THREE.Box3()
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse))
 const extent=Math.max((projected.max.x-projected.min.x)*.57,(projected.max.y-projected.min.y)*.57*width/height)
 camera.left=-extent;camera.right=extent;camera.top=extent*height/width;camera.bottom=-camera.top;camera.updateProjectionMatrix()
 const rgba=new Uint8ClampedArray(W*H*4),depth=new Float32Array(W*H).fill(Infinity)
 const foot=new THREE.Vector3(center.x,bounds.min.y,center.z).project(camera),cx=(foot.x+1)*W/2,cy=(1-foot.y)*H/2
 const shadowX=Math.min(W*.4,Math.max(aa*6,Math.max(size.x,size.z)/extent*W*.22)),shadowY=shadowX*.22
 for(let y=Math.max(0,Math.floor(cy-shadowY*2));y<Math.min(H,cy+shadowY*2);y++)for(let x=Math.max(0,Math.floor(cx-shadowX*2));x<Math.min(W,cx+shadowX*2);x++){
  const r=((x-cx)/shadowX)**2+((y-cy)/shadowY)**2,alpha=Math.exp(-r*2.4)*42,i=(y*W+x)*4
  rgba[i]=10;rgba[i+1]=22;rgba[i+2]=20;rgba[i+3]=alpha
 }
 let triangles=0
 const drawables=[];scene.traverse(part=>{if(part.isMesh)drawables.push(part)})
 drawables.sort((a,b)=>{const transparent=p=>(p.userData.surface.opacity??1)<1,ta=transparent(a),tb=transparent(b);return ta!==tb?Number(ta)-Number(tb):ta?b.position.distanceToSquared(camera.position)-a.position.distanceToSquared(camera.position):0})
 for(const part of drawables){
  const g=part.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index,count=index?.count??p.count,s=part.userData.surface,c=part.material.color
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(part.matrixWorld),verts=[]
  for(let i=0;i<p.count;i++){
   const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(part.matrixWorld),normal=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize(),screen=point.clone().project(camera)
   verts.push({point,x:(screen.x+1)*W/2,y:(1-screen.y)*H/2,z:screen.z,nx:normal.x,ny:normal.y,nz:normal.z})
  }
  const metal=s.metalness??.05,rough=s.roughness??.85,shininess=6+(1-rough)*60,alpha=s.opacity??1
  for(let i=0;i<count;i+=3){
   const a=verts[index?index.getX(i):i],b=verts[index?index.getX(i+1):i+1],d=verts[index?index.getX(i+2):i+2]
   const normal=b.point.clone().sub(a.point).cross(d.point.clone().sub(a.point)),front=normal.dot(view)>0
   if(!front&&!s.doubleSided)continue
   const sign=front?1:-1,area=edge(a.x,a.y,b.x,b.y,d.x,d.y)
   if(Math.abs(area)<1e-8)continue
   const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,d.x))),maxX=Math.min(W-1,Math.ceil(Math.max(a.x,b.x,d.x))),minY=Math.max(0,Math.floor(Math.min(a.y,b.y,d.y))),maxY=Math.min(H-1,Math.ceil(Math.max(a.y,b.y,d.y)))
   triangles++
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const u=edge(b.x,b.y,d.x,d.y,x+.5,y+.5)/area,v=edge(d.x,d.y,a.x,a.y,x+.5,y+.5)/area,w=1-u-v
    if(u<-.000001||v<-.000001||w<-.000001)continue
    const z=u*a.z+v*b.z+w*d.z,at=y*W+x
    if(z>=depth[at])continue
    if(alpha>=1)depth[at]=z
    let nx=(u*a.nx+v*b.nx+w*d.nx)*sign,ny=(u*a.ny+v*b.ny+w*d.ny)*sign,nz=(u*a.nz+v*b.nz+w*d.nz)*sign
    const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len
    const k=Math.max(0,nx*key.x+ny*key.y+nz*key.z)*.61,f=Math.max(0,nx*fill.x+ny*fill.y+nz*fill.z)*.17,ambient=.42+.1*Math.max(0,ny)
    const spec=Math.max(0,nx*half.x+ny*half.y+nz*half.z)**shininess*(.08+metal*.55),emission=s.emissive?1.5:0,offset=at*4
    const rgb=[display(c.r*(ambient+k+f*.77+emission)+spec*(.65+.35*c.r)),display(c.g*(ambient+k*.93+f*.88+emission)+spec*(.65+.35*c.g)),display(c.b*(ambient+k*.8+f+emission)+spec*(.65+.35*c.b))]
    const previous=rgba[offset+3]/255,out=alpha+previous*(1-alpha)
    for(let channel=0;channel<3;channel++)rgba[offset+channel]=(rgb[channel]*alpha+rgba[offset+channel]*previous*(1-alpha))/Math.max(.00001,out)
    rgba[offset+3]=out*255
   }
  }
 }
 const result=new Uint8ClampedArray(width*height*4)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=(y*width+x)*4;let a=0,r=0,g=0,b=0
  for(let dy=0;dy<aa;dy++)for(let dx=0;dx<aa;dx++){const i=((y*aa+dy)*W+x*aa+dx)*4,alpha=rgba[i+3];a+=alpha;r+=rgba[i]*alpha;g+=rgba[i+1]*alpha;b+=rgba[i+2]*alpha}
  result[at]=a?r/a:0;result[at+1]=a?g/a:0;result[at+2]=a?b/a:0;result[at+3]=a/(aa*aa)
 }
 resources.forEach(r=>r.dispose())
 return {buffer:png(result,width,height),triangles}
}
module.exports={render,load}
if(require.main===module){
const destination=path.join(root,'public','tabletop-thumbnails');fs.mkdirSync(destination,{recursive:true})
let bytes=0
for(const asset of tabletopAssets){const result=render(asset);fs.writeFileSync(path.join(destination,asset.id+'.png'),result.buffer);bytes+=result.buffer.length;console.log(asset.id,result.buffer.length+' B',result.triangles+' triangles')}
console.log('Generated',tabletopAssets.length,'native-geometry thumbnails:',Math.round(bytes/1024)+' KiB')

}
