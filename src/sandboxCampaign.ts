import { createNightCrossing } from './starterCampaign'
import { sceneObject } from './scenes'
import { THREE_D_SANDBOX } from './starterCampaignInfo'

// A separate editable copy. Example dimensions and spells are test fixtures,
// never new facts about World 6, and existing campaigns are never overwritten.
export function create3DSandbox(namespace: string) {
  const example = createNightCrossing(namespace), { campaign } = example.world
  const [settlement, forest, underground] = campaign.scenes!.scenes
  settlement.name = 'Полигон · поселение'; settlement.palette = 'stone'
  settlement.description = 'Неканонический полигон. Поселение связано дорогой с лесом, а лес — с подземным сооружением. Переход группы подтверждает мастер в запуске сцены.'
  const obj = (kind: Parameters<typeof sceneObject>[0], slug: string, x: number, y: number) => sceneObject(kind, namespace + ':' + slug, { x, y, z: 0 })
  settlement.objects.push({ ...obj('crate', 'practice-crate', 7, 15), name: 'Тестовый контейнер', width: 1.5, depth: 1.5, height: 1.2 },
    { ...obj('platform', 'settlement-support', 20, 15), name: 'Тестовая опора', width: 5, depth: 3, height: 1.5 })
  forest.name = 'Полигон · лес и дорога'; forest.palette = 'forest'; forest.background = 'auto'
  forest.description = 'Дорога через лес соединяет поселение и вход в подземное сооружение. Деревья и камни — реальные препятствия; область справа остаётся свободной для маршрутов.'
  forest.objects = [
    ...[[3, 4], [7, 4], [11, 4], [3, 15], [8, 16], [13, 16], [25, 5], [27, 15]].map(([x, y], i) => ({ ...obj('tree', 'forest-tree-' + i, x, y), height: 5, width: 2.5, depth: 2.5 })),
    { ...obj('rock', 'forest-rock', 15, 6), height: 1.3, width: 2, depth: 2 },
    { ...obj('water', 'forest-pool', 25, 10), name: 'Неглубокий водоём полигона', width: 5, depth: 3 },
    { ...obj('lamp', 'forest-beacon', 20, 17), name: 'Отметка входа в подземное сооружение', height: 2.5 },
  ]
  underground.name = 'Полигон · подземное сооружение'; underground.palette = 'stone'
  underground.background = 'auto'; underground.view = 'top'
  underground.description = 'Подземная испытательная площадка. Верхняя опора находится на Z=3 м. Подъём, полёт и изменение опоры подтверждаются по действующим правилам; камера не меняет положение персонажа.'
  underground.objects.push(
    { ...obj('wall', 'underground-wall', 12, 11), name: 'Каменная перегородка', width: 12, depth: .6, height: 4 },
    { ...obj('crate', 'underground-crate', 24, 14), name: 'Контейнер для испытаний', height: 1.2 },
  )
  const city = campaign.atlas!.cities[0]
  city.name = 'Поселение испытательного полигона'; city.summary = 'Неканоническая тестовая территория из трёх связанных областей.'
  city.description = 'Поселение → лес и дорога → подземное сооружение. Переходы выполняются мастером через подготовку сцены. Путь и время перехода определяет мастер.'
  city.secret = 'Только тестовая территория; не переносить факты испытаний в канон.'
  campaign.logs = [{ id: namespace + ':sandbox-guide', seconds: 0, text: THREE_D_SANDBOX.title + ' · v1', details:
    'Отдельная неканоническая копия. Четыре места для игроков плюс мастер по умолчанию.\n' +
    '1. Пригласи игроков, утверди героев и открой поселение через «Запуск сцены». Выбирай раскрытие явно.\n' +
    '2. Проверь 3D-обзор, свободное размещение и отключаемую привязку к сетке. Схема доступна рядом с 3D.\n' +
    '3. Сыграй движение, открытие двери, осмотр и подготовку способности через существующие серверные раунды.\n' +
    '4. Заверши активный сбор и незавершённые действия; перенеси выбранных героев в лес, затем в подземное сооружение через подготовку сцены.\n' +
    '5. Проверь Z=3 м, переподключение, сохранение и восстановление отдельной копии через копии и историю.\n' +
    'Этап 1: 3D и связанная серверная сессия. Разрушения, новая модель реакций, физическая симуляция и миграции компонентных сущностей реализуются отдельными этапами. Ни визуальная модель, ни камера не рассчитывают урон, падение или стоимость действий.' }]
  return example
}
