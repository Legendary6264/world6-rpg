import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { downloadJson } from './characterTransfer'
export default class CharacterErrorBoundary extends Component<{children:ReactNode},{error:string|null}>{
 state:{error:string|null}={error:null}
 static getDerivedStateFromError(e:Error){return {error:e.message}}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('Ошибка листа Мира 6',error,info.componentStack)}
 render(){if(this.state.error)return <section className="panel"><h2>Не удалось открыть лист</h2><p>Сохранения не удалены. Сообщение ошибки:</p><pre className="w6-prose">{this.state.error}</pre><div className="w6-buttons"><button className="w6-button" type="button" onClick={()=>{try{downloadJson(window.localStorage.getItem('world6.characters.v2')??'{}','world6-recovery.json')}catch{window.alert('Браузер не разрешил прочитать сохранение.')}}}>Скачать исходное сохранение</button><button className="w6-button" type="button" onClick={()=>window.location.reload()}>Перезагрузить</button></div></section>;return this.props.children}
}
