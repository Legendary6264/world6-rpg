import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import ts from 'typescript'
await mkdir('server/generated',{recursive:true})
for(const file of await readdir('src')){
 if(!file.endsWith('.ts'))continue
 const js=ts.transpileModule(await readFile('src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText.replace(/(from\s+['"]\.\/[^'"]+)(['"])/g,(_,a,b)=>a+'.mjs'+b)
 await writeFile('server/generated/'+file.replace(/\.ts$/,'.mjs'),js)
}
console.log('Сервер использует общие проверки персонажей и правила игры.')
