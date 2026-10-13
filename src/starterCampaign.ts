import { createDefaultCharacter } from './characterModel'
import { emptyCampaign, emptyItem, emptyAbility } from './rpgSchema'
import { instantiateItem } from './rpgEngine'
import type { Actor, World } from './rpgEngine'
import { sceneObject } from './scenes'
import type { Scene, SceneObjectKind } from './sceneTypes'
import { newAtlasEntry } from './campaignAtlas'
import { emptyTrade, newMerchant } from './campaignTrade'
import { emptyEconomy, newEconomyRule } from './campaignEconomy'
import { NIGHT_CROSSING } from './starterCampaignInfo'

// A new optional example, not recovered P19 plot or an extension of confirmed lore.
// The caller supplies a unique namespace; every call returns independent native data.
export function createNightCrossing(namespace: string): {world: World; npcIds: string[]} {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace)) throw Error('Укажи отдельный идентификатор копии примера.')
  const key = (name: string) => namespace + ':' + name
  const campaign = emptyCampaign()
  const staff = {...emptyItem(), id:key('staff'), name:'Дорожный посох', description:'Пример снаряжения. Все параметры меняет мастер.',
    category:'focus' as const, shape:'staff' as const, slot:'right' as const, massKg:1.2, material:'Дерево', tags:['посох'], artwork:'pixel-staff',
    modelLength:1.6, modelWidth:0.12, modelDepth:0.12, color:'#79e6dd'}
  const lamp = {...emptyItem(), id:key('lantern'), name:'Походный фонарь', description:'Реквизит примера. Радиус света и восприятие задаёт мастер; автоматического раскрытия нет.',
    category:'tool' as const, slot:'left' as const, massKg:0.6, material:'Металл', artwork:'pixel-lantern', modelLength:0.3, modelWidth:0.2, modelDepth:0.2}
  const ration = {...emptyItem(), id:key('ration'), name:'Дорожный припас', description:'Предмет для ручного учёта; не лечит и не даёт бонусов автоматически.',
    category:'tool' as const, massKg:0.4, material:'Свёрток', artwork:'pixel-ration'}
  const focus = {...emptyAbility(), id:key('focus'), name:'Сосредоточение',
    description:'Пример эффекта на себе: подготовка 8 секунд, затем отдельный выпуск. Внешний вид условный, характеристики не меняются. Параметры редактирует мастер.',
    mechanism:'effect' as const, preparation:8, duration:30, cost:{mana:1,shadow:0,stamina:0}, artwork:'pixel-focus', stackKey:key('focus-effect')}
  campaign.items = [staff,lamp,ration]; campaign.abilities = [focus]
  function npc(name:string, slug:string, portrait:string, note:string):Actor {
    const a = {...createDefaultCharacter(),id:key(slug),name}
    a.profile.portrait=portrait; a.profile.rank='mortal'; a.profile.energy='mana'; a.profile.biography=note
    // Explicit example values, not a new attribute formula or world balance.
    a.rpg.formulas=[]; a.resources.mana={current:'10',maximum:'10'}; a.resources.shadow={current:'0',maximum:'0'}
    a.statistics.energyRegeneration='0'
    return a
  }
  const guide=npc('Проводник','guide','pixel-guide','Заметка мастера: готов обсудить переход; имя, мотивы и происхождение выбери сам. Это пример, не канон.')
  guide.rpg.inventory=[instantiateItem(staff,key('guide-staff')),instantiateItem(lamp,key('guide-lantern'))]
  guide.rpg.abilities=[{...structuredClone(focus),id:key('guide-focus'),templateId:focus.id,approved:true}]
  const keeper=npc('Кладовщица','keeper','pixel-keeper','Заметка мастера: предлагает запасы. Цены и возможности торговли условные; никаких автоматических наград.')
  const watcher=npc('Наблюдатель','watcher','pixel-watcher','Заметка мастера: стоит на верхней опоре галереи. Можно заменить препятствием, союзником или убрать.')
  const characters=[guide,keeper,watcher]
  const base=(slug:string,name:string,view:Scene['view'],background:string):Scene=>({id:key(slug),name,description:'Редактируемая сцена примера «Ночной переход».',view,
    width:30,depth:20,groundZ:0,minZ:-2,maxZ:10,palette:'neon',roundDurationSeconds:5,background,objects:[],tokens:[]})
  const at=(kind:SceneObjectKind,slug:string,x:number,y:number,z=0)=>sceneObject(kind,key(slug),{x,y,z})
  const gate=base('gate','У перехода','top','pixel-ground-stone')
  gate.description='Тёмная площадка у закрытого прохода. Слышны шаги проводника. Договоритесь, куда идёте и что хотите узнать.'
  gate.objects=[{...at('wall','gate-wall-left',9,10),width:4,height:4},at('door','gate-door',13,10),{...at('wall','gate-wall-right',17,10),width:4,height:4},at('lamp','gate-light',4,3),at('tree','gate-tree',24,5),at('rock','gate-rock',25,15)]
  gate.tokens=[{actorId:guide.id,x:4,y:6,z:0,diameter:0.8,support:{kind:'ground'}}]
  const yard=base('yard','Двор запасов','top','pixel-ground-yard')
  yard.description='Контейнеры и стойка с дорожными припасами. Можно изучить обстановку и договориться о покупке.'
  yard.objects=[at('crate','yard-crate',15,12),at('lamp','yard-light',8,5),{...at('water','yard-water',24,14),width:6,depth:4},at('tree','yard-tree',3,14)]
  yard.tokens=[{actorId:keeper.id,x:8,y:10,z:0,diameter:0.8,support:{kind:'ground'}}]
  const gallery=base('gallery','Боковая галерея','side','pixel-gallery')
  gallery.description='Вид сбоку. Верхняя опора находится на Z=3 м. Высота сохраняется в координатах; подъём или полёт задаются явно.'
  const platform={...at('platform','upper-support',18,2),name:'Верхняя опора',width:8,depth:4,height:3}
  gallery.objects=[platform,at('lamp','gallery-light',3,2),{...at('door','gallery-door',26,2),height:3}]
  gallery.tokens=[{actorId:watcher.id,x:18,y:2,z:3,diameter:0.8,support:{kind:'object',objectId:platform.id}}]
  campaign.scenes={version:1,activeSceneId:gate.id,scenes:[gate,yard,gallery]}
  campaign.perceptions={version:1,heroes:[]}
  const city={...newAtlasEntry('city',key('settlement')),population:'Мастер определяет',name:'Поселение у перехода',kind:'Поселение примера',
    summary:'Отправная точка этого приключения.',description:'Расположение, культура и связь с миром выбираются мастером.',secret:'Пример не утверждает существование нового канонического города.',
    visible:true,sceneIds:[gate.id,yard.id,gallery.id],npcLinks:[{actorId:guide.id,role:'Проводник',publicName:'Проводник',visible:true}]}
  campaign.atlas={version:1,cities:[city],organizations:[]}
  const currency={id:key('coin'),name:'Расчётная монета примера',symbol:'м.'}
  const merchant={...newMerchant(key('merchant')),name:'Дорожная стойка',description:'Торговец примера. Сделки рассчитывает и подтверждает мастер.',
    secret:'Стартовые цены — редактируемые числа примера, не экономика канона.',visible:true,npcId:keeper.id,cityId:city.id,
    balances:[{currencyId:currency.id,amount:20}],stock:[{item:{...instantiateItem(ration,key('ration-stock')),quantity:6},visible:true,prices:[{currencyId:currency.id,unitPrice:2}]}]}
  campaign.trade={...emptyTrade(),currencies:[currency],wallets:[{actorId:guide.id,balances:[{currencyId:currency.id,amount:10}]}],merchants:[merchant]}
  campaign.economy={...emptyEconomy(),periodName:'Учёт запасов по решению мастера',rules:[{...newEconomyRule(key('supply-rule')),name:'Пополнение стойки',
    description:'Отключённый пример: за один подтверждённый период потратить 2 монеты и добавить один припас.',secret:'Включать после определения происхождения поставки; время мира не меняется.',
    inputs:[{id:key('supply-cost'),target:'merchant',targetId:merchant.id,resource:'money',resourceId:currency.id,amount:2}],
    outputs:[{id:key('supply-output'),target:'merchant',targetId:merchant.id,resource:'item',resourceId:ration.id,amount:1}]}]}
  campaign.logs=[{id:key('guide-notes'),seconds:0,text:NIGHT_CROSSING.title+' · пример v1',details:
    'Новый пример по доступным деталям P20; прежний сюжет P19 неизвестен. Все названия и значения условны.\n'+
    '1. Добавьте и утвердите героев обычным способом. В редакторе сцен разместите их у перехода; отдельно раскройте каждому области и контакты.\n'+
    '2. Сыграйте разговор с проводником. Для двери предложите осмотр/открытие с явным подтверждением мастера. Нет обязательного боя или проверки удачи.\n'+
    '3. По решению мастера откройте двор, затем боковую галерею; перенесите токены и обновите личное раскрытие. Связь сцен не телепортирует персонажей сама.\n'+
    '4. NPC проводника можно использовать для пробы посоха и подготовки: раунд 5 с, «Сосредоточение» 8 с, перенос 5/8, завершение в следующем раунде, отдельный выпуск на себя. Бюджет и стоимость действий задайте явно.\n'+
    '5. Цель истории — организовать переход; исход, награды и продолжение выбирает мастер. Копируйте кампанию, правьте NPC, сцены, предметы, цены и заметки. Игровые часы, сборы и броски ещё не запускались.'}]
  return {world:{characters,campaign},npcIds:characters.map(a=>a.id)}
}
