// Geometry/composition QA only: no textures, WebGL, real shadows or GPU timing.
// Uses the actual scene meshes and reference camera. Reproduce with:
// node scripts/render-reference-tavern.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),{createRequire}=require('node:module'),repoRequire=createRequire(path.resolve(__dirname,'..','package.json')),ts=repoRequire('typescript'),THREE=repoRequire('three'),{pathToFileURL}=require('node:url')
const root=path.resolve(__dirname,'..'),cache=new Map()
function load(name){
 name=name.replace(/\.tsx?$/,'');if(cache.has(name))return cache.get(name).exports
 const file=path.join(root,'src',name+'.ts'),mod={exports:{}};cache.set(name,mod)
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href))
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(id=>id.startsWith('./')?load(id.slice(2)):repoRequire(id),mod,mod.exports)
 return mod.exports
}
const {populateEntityModel}=load('scene3dMeshes')
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
 const width=options.width??590,height=options.height??870,aa=options.aa??1,W=width*aa,H=height*aa
 const {createVideoTavernScene,tavernReferenceShot:shot}=load('tavernReference'),data=options.sceneData??createVideoTavernScene(['a','b','c','d']),scene=new THREE.Group(),resources=[],stats={objects:data.objects.length,actors:data.tokens.length,triangles:0,materialGroups:0,unbatchedMeshes:0,cutWalls:[]}
 const add=(geometry,color,x,y,z,s={})=>{const material=new THREE.MeshStandardMaterial({color}),part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);part.userData.surface=s;resources.push(geometry,material);return part}
 const background=options.background??'#21192e',base=add(new THREE.BoxGeometry(data.width,.32,data.depth),options.ground??background,data.width/2,-.17,data.depth/2);scene.add(base)
 const {masterRenderModel}=load('scene3dModel'),model=masterRenderModel(data,[]),span=Math.max(data.width,data.depth),target=new THREE.Vector3().fromArray(options.target??shot.target),offset=new THREE.Vector3().fromArray(options.offset??shot.offset),direction=offset.clone().setY(0).normalize()
 const camera=new THREE.OrthographicCamera(-span*.58*width/height,span*.58*width/height,span*.58,-span*.58,.05,500)
 camera.position.copy(target).add(offset);camera.zoom=options.zoom??shot.zoom;camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();view.copy(offset).normalize();half.copy(key).add(view).normalize()
 for(const e of model.entities){
  const group=new THREE.Group(),p=e.transform.position,materials=new Set();group.position.set(p.x,p.z,p.y);group.rotation.y=-(e.geometry.facing??0)*Math.PI/180
  populateEntityModel(e,(g,c,x,y,z,s={})=>{const part=add(g,c,x,y,z,s);group.add(part);stats.triangles+=(g.index?.count??g.attributes.position.count)/3;stats.unbatchedMeshes++;materials.add((s.opacity??1)>=.99&&!s.emissive?'palette:'+JSON.stringify([s,false,1]):JSON.stringify([c,s]));return part})
  stats.materialGroups+=materials.size
  const wall=load('legacyAssets').legacyAsset(e.geometry)?.wallLike??(!!e.geometry.asset&&e.geometry.kind==='wall'&&!['timber-pillar','timber-beam','timber-railing'].includes(e.geometry.asset))
  if(wall&&options.cutaway!==false){
   const near=load('scene3dCutaway').nearCutawayWall(group.position,target,direction,e.geometry.facing)
   if(near){group.scale.y=.18;stats.cutWalls.push({x:p.x,y:p.y,facing:e.geometry.facing})}
  }
  scene.add(group)
 }
 scene.updateMatrixWorld(true)
 const rgba=new Uint8ClampedArray(W*H*4),depth=new Float32Array(W*H).fill(Infinity)
 const bg=new THREE.Color(background),rgb=[bg.r,bg.g,bg.b].map(x=>Math.round(255*(x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055)))
 for(let i=0;i<W*H;i++){rgba[i*4]=rgb[0];rgba[i*4+1]=rgb[1];rgba[i*4+2]=rgb[2];rgba[i*4+3]=255}
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
 return {buffer:png(result,width,height),triangles,stats}
}
module.exports={render,load}
if(require.main===module){
const destination=path.join(root,'docs','assets')+path.sep;fs.mkdirSync(destination,{recursive:true})
const prefix=process.argv[2]??'tavern-reference-geometry'
if(!/^[a-z0-9-]+$/.test(prefix))throw Error('Use a filename prefix containing lowercase letters, numbers and hyphens.')
const variants=[[prefix+'-portrait',{width:590,height:870,aa:2}],[prefix+'-landscape',{width:1100,height:700,aa:2}]]
for(const [name,opts] of variants){const result=render(null,opts);fs.writeFileSync(destination+name+'.png',result.buffer);fs.writeFileSync(destination+name+'.json',JSON.stringify(result.stats,null,2));console.log(name,result.stats)}
}
