import {lazy,Suspense} from 'react'
import App from './App'
import OnlineProvider from './OnlineProvider'
import './uiSystem.css'
import './realmDesign.css'
import InterfacePreferencesBridge from './interfacePreferences'

const Preview3D=lazy(()=>import('./Preview3D'))
const PreviewAbilities=lazy(()=>import('./PreviewAbilities'))
export default function AppEntry(){
 const effects=new URLSearchParams(location.search).get('preview')==='effects'
 const preview=new URLSearchParams(location.search).get('preview')==='3d'||import.meta.env.VITE_PREVIEW_ONLY==='true'
 return <><InterfacePreferencesBridge/>{effects?<Suspense fallback={<p>Открываем мастерскую эффектов…</p>}><PreviewAbilities/></Suspense>:preview?<Suspense fallback={<p>Открываем 3D-полигон…</p>}><Preview3D/></Suspense>:<OnlineProvider><App/></OnlineProvider>}</>
}
