const fs=require('node:fs'),path=require('node:path'),{render,load}=require('./render-reference-tavern.cjs')
const {create3DSandbox}=load('sandboxCampaign'),scenes=create3DSandbox('browser-preview').world.campaign.scenes.scenes
scenes[0].tokens.push(...Array.from({length:4},(_,i)=>({actorId:'preview-player-'+i,x:4+i*2,y:17,z:0,diameter:.8,support:{kind:'ground'}})))
const destination=path.resolve(__dirname,'../docs/assets');fs.mkdirSync(destination,{recursive:true})
for(const [index,data] of scenes.entries()){
 const slug=['settlement','forest','underground'][index],options={sceneData:data,width:1280,height:800,aa:2,target:[15,1,10],offset:[22,25,32],zoom:1.12,background:'#18232b',ground:index===1?'#546542':index===2?'#555954':'#6e7666'}
 const result=render(null,options),name='original-v021-'+slug
 fs.writeFileSync(path.join(destination,name+'.png'),result.buffer);fs.writeFileSync(path.join(destination,name+'.json'),JSON.stringify(result.stats,null,2));console.log(name,result.stats)
}
