import {lazy,Suspense} from 'react'
import App from './App'
import OnlineProvider from './OnlineProvider'

const Preview3D=lazy(()=>import('./Preview3D'))
export default function AppEntry(){
 const preview=new URLSearchParams(location.search).get('preview')==='3d'||import.meta.env.VITE_PREVIEW_ONLY==='true'
 return preview?<Suspense fallback={<p>Открываем 3D-полигон…</p>}><Preview3D/></Suspense>:<OnlineProvider><App/></OnlineProvider>
}
