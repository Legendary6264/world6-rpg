// Статические URL позволяют Vite включить иллюстрации в production-сборку.
export const magicArtwork = {
  elements: new URL('./assets/magic/elements.webp', import.meta.url).href,
  arcane: new URL('./assets/magic/arcane.webp', import.meta.url).href,
  special: new URL('./assets/magic/special.webp', import.meta.url).href,
  shadow: new URL('./assets/magic/shadow.webp', import.meta.url).href,
  extended: new URL('./assets/magic/special.webp', import.meta.url).href,
}
