import {useEffect,useRef} from 'react'
import EditorIcon from './EditorIcon'

const groups=[
 {title:'Выделение и перенос',rows:[['ЛКМ + движение','Перетащить объект в 3D или на схеме'],['Shift + клик','Добавить в группу или убрать из неё'],['Shift + рамка','Добавить область к выделению в 3D или на схеме'],['ПКМ','Действия и выбор объектов под курсором'],['Shift при переносе','Точный перенос без сетки'],['Esc при переносе','Отменить жест без записи изменений'],['Ctrl + A','Выделить по текущему фильтру']]},
 {title:'Редактирование',rows:[['Ctrl + Z / Ctrl + Shift + Z','Отменить / вернуть'],['Ctrl + C / Ctrl + V','Копировать объекты / выбрать место вставки'],['Ctrl + D · Del','Дублировать / удалить'],['R · E','Повернуть / действие с объектом'],['End · Shift + End','Опустить на ближайшую поверхность / на землю'],['Опускание группы','Содержимое опор перемещается вместе с ними'],['Создать ряд','Количество копий, ось сцены и промежуток между краями'],['Повторять вставку','Расставлять композиции или целые ряды с сохранением настроек'],['Ctrl + Z при повторной вставке','Отменить последнюю вставку; Ctrl + Shift + Z — вернуть'],['Esc при вставке','Завершить расстановку, сохранив буфер'],['Стрелки · Page Up / Down','Точный сдвиг / высота по опоре'],['Shift + G','Выделить предметы на опоре; герои следуют за своими опорами'],['Композиция на опоре','Перенести, скопировать или дублировать предметы вместе']]},
 {title:'Рабочее место',rows:[['B · I · O','Библиотека / инспектор / объекты'],['Копия сцены','Параметры сцены → копирование обстановки без героев'],['Положение группы','Координаты центра X/Y и нижней точки Z'],['Свойства группы','Выравнивание по краям и промежуток в метрах'],['Активный объект','Последний выбранный объект — ориентир расстановки'],['Граница панели','Потяни для изменения ширины'],['Двойной клик по границе','Вернуть стандартную ширину'],['V · G','Выбор / инструмент переноса'],['W · Q · P · M','Стена / комната / пол / измерение']]},
 {title:'Список объектов',rows:[['Shift + клик','Выделить диапазон строк'],['Ctrl + клик · Пробел','Добавить или убрать строку'],['↑↓ · Home / End','Выбрать строки без перемещения объектов'],['←→','Кнопки видимости и защиты'],['Enter · F','Свойства / показать на сцене'],['/ · Ctrl + F','Поиск внутри списка'],['Ctrl + A','Выделить найденные строки']]},
 {title:'Камера и схема',rows:[['Alt + ЛКМ (3D)','Повернуть камеру'],['Средняя кнопка','Сдвинуть вид'],['Пробел + ЛКМ (схема)','Сдвинуть схему'],['Колесо','Приблизить / отдалить'],['1 · 2 · 3 (3D)','Сверху / спереди / объёмный вид'],['F','Приблизить выделение'],['Home (схема)','Показать всю сцену']]},
]
export default function EditorControlsHelp({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose
 useEffect(()=>{const previous=document.activeElement as HTMLElement|SVGElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();return ()=>previous?.focus?.({preventScroll:true})},[])
 return <div className="gb-controls-backdrop" onPointerDown={e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose()}}><div ref={dialog} className="gb-controls-dialog" role="dialog" aria-modal="true" aria-labelledby="gb-controls-title" onKeyDown={e=>{
  e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();return}
  if(e.key==='Tab'){const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,a,input,[tabindex="0"]')??[]),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 }}>
  <header><div><small>РАБОЧЕЕ МЕСТО МАСТЕРА</small><h2 id="gb-controls-title">Управление редактором</h2></div><button type="button" aria-label="Закрыть управление редактором" onClick={onClose}><EditorIcon name="close"/></button></header>
  <div className="gb-controls-grid">{groups.map(g=><section key={g.title}><h3>{g.title}</h3><dl>{g.rows.map(([keys,label])=><div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{label}</dd></div>)}</dl></section>)}</div>
  <footer>Команды действуют в редакторе. Поля ввода сохраняют обычное управление. Высота героя зависит от его опоры.</footer>
 </div></div>
}
