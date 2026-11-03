/** Respect the deployed page directory, including GitHub Pages project paths. */
export function sceneAssetUrl(path:string,base=typeof document==='undefined'?undefined:document.baseURI){
  return base?new URL(path,base).href:'/'+path
}
