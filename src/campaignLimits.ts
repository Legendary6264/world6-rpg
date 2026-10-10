// Leave room inside the 10 MiB HTTP/import limit for revision, ownership metadata
// and backup headers. The same snapshot budget applies to adding and publishing.
export const MAX_CAMPAIGN_BYTES = 8 * 1024 * 1024
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
export function assertCampaignSize(value: unknown): void {
  if (jsonBytes(value) > MAX_CAMPAIGN_BYTES) {
    throw new Error('Кампания превышает 8 МиБ. Уменьши размер листов или каталога перед добавлением и публикацией.')
  }
}
