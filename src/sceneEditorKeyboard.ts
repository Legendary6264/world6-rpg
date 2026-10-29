// Letter shortcuts keep working with a Russian keyboard layout. Latin keys
// follow their printed letter; other layouts can use the physical Latin key.
export function editorKey(event:{key:string;code?:string}){
 const key=event.key.toLowerCase()
 return /^[a-z]$/.test(key)?key:/^Key[A-Z]$/.test(event.code??'')?event.code!.slice(3).toLowerCase():key
}
