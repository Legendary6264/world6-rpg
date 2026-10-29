type RandomSource=Pick<Crypto,'getRandomValues'>&Partial<Pick<Crypto,'randomUUID'>>

// Local HTTP previews expose getRandomValues, but some browsers reserve
// randomUUID for secure contexts. Both paths produce ordinary random UUIDs;
// object IDs never require a weaker Math.random fallback.
export function sceneEditorId(random:RandomSource=globalThis.crypto):string{
 if(typeof random?.randomUUID==='function')return random.randomUUID()
 if(typeof random?.getRandomValues!=='function')throw Error('Браузер не поддерживает создание идентификатора объекта.')
 const bytes=random.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
}
