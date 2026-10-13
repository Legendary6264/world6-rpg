import { productBrand } from './productBrand.ts'

// These public build settings never select an authentication destination.
function parsePublicUrl(raw: string, name: string, originOnly: boolean): URL {
  const invalid = () => new Error(name + ': нужен точный HTTP(S)-адрес без логина, пароля, query, hash или *. Для API укажи только origin; HTTP допустим только для localhost.')
  let url: URL
  try { url = new URL(raw) } catch { throw invalid() }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!/^https?:\/\//.test(raw) || /[\\\s]/.test(raw) || [...raw].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    !['https:', 'http:'].includes(url.protocol) || url.protocol === 'http:' && !local ||
    url.username || url.password || raw.includes('?') || raw.includes('#') || url.hostname.includes('*') ||
    originOnly && url.pathname !== '/') throw invalid()
  return url
}

export function readSitePresentation(env: Record<string, string | undefined>) {
  const site = env.VITE_SITE_URL?.trim() || '', api = env.VITE_API_URL?.trim() || ''
  const siteUrl = site ? parsePublicUrl(site, 'VITE_SITE_URL', false) : null
  if (siteUrl && !siteUrl.pathname.endsWith('/')) siteUrl.pathname += '/'
  if (api) parsePublicUrl(api, 'VITE_API_URL', true)
  return { siteUrl: siteUrl?.href ?? '' }
}

export function siteHeadTags(siteUrl: string) {
  const meta = (name: string, content: string) => ({ tag: 'meta', attrs: { name, content } })
  const og = (property: string, content: string) => ({ tag: 'meta', attrs: { property, content } })
  return [
    meta('description', productBrand.description), meta('application-name', productBrand.name),
    meta('theme-color', '#0e1420'), meta('color-scheme', 'dark'),
    og('og:title', productBrand.title), og('og:description', productBrand.description),
    og('og:site_name', productBrand.name), og('og:type', 'website'), og('og:locale', 'ru_RU'),
    ...(siteUrl ? [{ tag: 'link', attrs: { rel: 'canonical', href: siteUrl } }, og('og:url', siteUrl)] : []),
  ]
}
