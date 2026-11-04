import {lazy,Suspense} from 'react'
import App from './App'
import OnlineProvider from './OnlineProvider'

const Preview3D=lazy(()=>import('./Preview3D'))
const PreviewAbilities=lazy(()=>import('./PreviewAbilities'))
export default function AppEntry(){
 if(new URLSearchParams(location.search).get('preview')==='effects')return <Suspense fallback={<p>Открываем мастерскую эффектов…</p>}><PreviewAbilities/></Suspense>
 const preview=new URLSearchParams(location.search).get('preview')==='3d'||import.meta.env.VITE_PREVIEW_ONLY==='true'
 return preview?<Suspense fallback={<p>Открываем 3D-полигон…</p>}><Preview3D/></Suspense>:<OnlineProvider><App/></OnlineProvider>
}
