import { useRef, useState } from 'react'
import { MAX_IMPORT_BYTES, parseCharacterArchive } from './characterTransfer'
import type { ImportPreview } from './characterTransfer'
import type { ReadyCharacterDraft } from './characterModel'

type Props = {
  disabled: boolean
  savedCount: number
  onImport: (characters: ReadyCharacterDraft[]) => void
  onBackup: () => void
}

export default function CharacterImportPanel({ disabled, savedCount, onImport, onBackup }: Props) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [message, setMessage] = useState('')
  const [reading, setReading] = useState(false)
  const readId = useRef(0)

  async function readFile(file: File | undefined) {
    const current = ++readId.current
    setPreview(null)
    setMessage('')
    setReading(false)
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage('Файл больше 10 МиБ. Выбери меньший архив.')
      return
    }
    setReading(true)
    try {
      const result = parseCharacterArchive(await file.text())
      if (current !== readId.current) return
      if (result.ok) {
        setPreview(result.preview)
        setMessage('Файл проверен. Добавление начнётся после нажатия кнопки ниже.')
      } else setMessage(result.message)
    } catch {
      if (current === readId.current) setMessage('Не удалось прочитать файл.')
    } finally {
      if (current === readId.current) setReading(false)
    }
  }

  function importCharacters() {
    if (!preview || disabled || reading) return
    try {
      onImport(preview.characters)
      setPreview(null)
      setMessage('Персонажи добавлены и сохранены как отдельные копии.')
    } catch {
      setMessage('Не удалось сохранить импорт. Исходные герои остались на месте; можно повторить.')
    }
  }

  return (
    <details className="w6-transfer">
      <summary>Импорт и резервные копии</summary>
      <p className="w6-copy">Копия содержит текущие листы героев и настройки кампании.
        Для текущего черновика используй «Экспорт этого персонажа» внизу его листа.</p>
      <button className="w6-button" type="button" disabled={savedCount === 0}
        onClick={() => {
          try { onBackup(); setMessage('Скачивание резервной копии запрошено.') }
          catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось подготовить копию.') }
        }}>Экспорт текущих героев ({savedCount})</button>
      <label className="w6-field w6-spaced" htmlFor="character-import-file">
        <span>JSON с персонажами</span>
        <input id="character-import-file" type="file" accept=".json,application/json" disabled={disabled}
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            void readFile(file)
          }} />
      </label>
      {reading && <p className="w6-copy">Читаю и проверяю файл…</p>}
      {preview && <div className="w6-import-preview">
        <h3>{preview.sourceLabel}</h3>
        <p className="w6-copy">Будет добавлено копий: {preview.characters.length}.
          Совпадающие имена допускаются; существующие герои сохраняются. Незавершённые применения прерываются, связанные с источником механические эффекты снимаются. Часы и общий каталог этим импортом не заменяются.</p>
        <ul>{preview.characters.map((character, index) => <li key={index}>{character.name}</li>)}</ul>
        <div className="w6-buttons">
          <button className="w6-button w6-primary" type="button" disabled={disabled || reading}
            onClick={importCharacters}>Добавить копии персонажей</button>
          <button className="w6-button" type="button" onClick={() => { setPreview(null); setMessage('Импорт отменён.') }}>Отмена</button>
        </div>
      </div>}
      <p className="w6-notice" role="status">{message}</p>
    </details>
  )
}
