import {useId,useState} from 'react'
import DisclosureMenu from './DisclosureMenu'
import {defaultInterfacePreferences,useInterfacePreferences,updateInterfacePreferences} from './interfacePreferences'
import type {InterfacePreferences} from './interfacePreferences'
export default function InterfaceAppearance(){
 const value=useInterfacePreferences(),[notice,setNotice]=useState(''),accentGroup=useId()
 function change(patch:Partial<InterfacePreferences>){setNotice(updateInterfacePreferences(patch)?'Настройки сохранены на этом устройстве.':'Настройки действуют до закрытия страницы: хранилище недоступно.')}
 return <DisclosureMenu label="Оформление" className="realm-appearance" closeOnAction={false}>
  <header><strong>Твой комфорт</strong><p>Настрой пространство для долгой игры.</p></header>
  <fieldset><legend>Цветовой акцент</legend><div className="realm-accent-options">{([['gold','Золото'],['mana','Мана'],['shadow','Тень']] as const).map(([id,label])=><label key={id} data-accent={id}><input type="radio" name={accentGroup} checked={value.accent===id} onChange={()=>change({accent:id})}/><i aria-hidden="true"/>{label}</label>)}</div></fieldset>
  <label className="w6-field"><span>Плотность панелей</span><select aria-label="Плотность интерфейса" value={value.density} onChange={e=>change({density:e.currentTarget.value as InterfacePreferences['density']})}><option value="comfortable">Свободно · больше воздуха</option><option value="compact">Компактно · больше инструментов</option></select></label>
  <label className="w6-field"><span>Размер текста</span><select aria-label="Размер текста интерфейса" value={value.text} onChange={e=>change({text:e.currentTarget.value as InterfacePreferences['text']})}><option value="standard">Обычный</option><option value="large">Увеличенный</option></select></label>
  <label className="realm-setting-check"><input type="checkbox" checked={value.atmosphere} onChange={e=>change({atmosphere:e.currentTarget.checked})}/><span>Атмосферные детали<small>Иллюстрации и декоративные движения</small></span></label>
  <button type="button" className="w6-button" onClick={()=>change(defaultInterfacePreferences)}>Вернуть исходное оформление</button><p role="status" className="realm-settings-notice">{notice}</p>
 </DisclosureMenu>
}
