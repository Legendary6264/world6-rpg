// Public example description only. Live campaign notes and NPC sheets stay on the server.
export const NIGHT_CROSSING = {
  id: 'night-crossing', version: 1, title: 'Ночной переход',
  description: 'Необязательное приключение: договориться о переходе, осмотреть двор и открыть боковую галерею. Мастер может изменить всё или создать свою историю.',
  contents: ['Три отдельные сцены и свободные XYZ', 'Проводник, кладовщица и наблюдатель — NPC мастера', 'Посох, фонарь, дорожный припас и «Сосредоточение»', 'Пример поселения, торговца и ручного учёта'],
} as const

export const THREE_D_SANDBOX = {
  id: 'world6-3d-sandbox', version: 1, title: 'Испытательный 3D-полигон',
  description: 'Отдельная неканоническая кампания: поселение, лес с дорогой и подземное сооружение. Для проверки игры четырёх друзей с мастером.',
  contents: ['Три связанные области с 3D-обзором и редактированием', 'Переход группы и раскрытие сцены подтверждает мастер',
    'Движение, дверь, осмотр и подготовка способности через серверные раунды', 'Самостоятельные сохранения, копии и история без изменения других кампаний'],
} as const
export type StarterExample = typeof NIGHT_CROSSING | typeof THREE_D_SANDBOX
export const starterExample = (id: unknown, version: unknown): StarterExample | undefined =>
  [NIGHT_CROSSING, THREE_D_SANDBOX].find(example => example.id === id && example.version === version)
