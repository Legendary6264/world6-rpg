import type {SitePage} from './siteRoutes'
export const sitePresentation:Record<SitePage,{description:string;group:string;keywords:string}>={
 home:{description:'Твоя следующая история начинается здесь.',group:'Начать',keywords:'главная начало портал'},
 character:{description:'Герои, внешность, навыки и способности.',group:'Начать',keywords:'герой персонаж тело анатомия магия'},
 lobbies:{description:'Найди компанию или собери собственную партию.',group:'Начать',keywords:'игра сессия друзья мастер кампания чат'},
 guide:{description:'Устройство Мира 6 и правила игры.',group:'Изучить',keywords:'правила канон справка мир'},
 tutorial:{description:'Попробуй действия игрока и мастера.',group:'Изучить',keywords:'обучение помощь пример тренировка'},
 stories:{description:'Идеи и зацепки для новых приключений.',group:'Сообщество',keywords:'сюжеты приключения истории'},
 news:{description:'Что нового в мире и на платформе.',group:'Сообщество',keywords:'новости обновления'},
 forum:{description:'Разговоры, вопросы и идеи игроков.',group:'Сообщество',keywords:'форум общение обсуждение'},
 support:{description:'Сообщи об ошибке или предложи улучшение.',group:'Сообщество',keywords:'поддержка ошибка предложение'},
 account:{description:'Вход, профиль и безопасность.',group:'Личное',keywords:'аккаунт вход регистрация профиль пароль'},
 worldEditor:{description:'Материалы и записи о мире.',group:'Управление',keywords:'редактор мира материалы'},
 admin:{description:'Инструменты управления платформой.',group:'Управление',keywords:'администратор управление'}
}
