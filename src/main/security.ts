/** Small, pure checks used where text from outside the app (web pages, files) decides what the app fetches or reads. */

/** Fragrantica's own domains. Anything else, including look-alikes such as fragrantica.example.com, is refused. */
const FRAGRANTICA_HOSTS = ['fragrantica.com', 'fragrantica.es', 'fragrantica.de', 'fragrantica.fr', 'fragrantica.ru', 'fragrantica.it', 'fragrantica.pl', 'fragrantica.nl', 'fragrantica.ro', 'fragrantica.asia', 'fragrantica.com.br']

export function isFragranticaHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  return FRAGRANTICA_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))
}

/** Picture hosts the importers may download from. */
const IMAGE_HOSTS = ['fimgs.net']

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false
    const h = u.hostname.toLowerCase()
    return IMAGE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`)) || isFragranticaHost(h)
  } catch {
    return false
  }
}

/** The name the app gives a cached picture (see images.ts): 16 hex digits and .png. */
export const isStoredImageName = (s: string): boolean => /^[0-9a-f]{16}\.png$/.test(s)

/**
 * True for the app's own page: the packaged file:// page, or the dev server's origin when running `npm run dev`.
 * `devUrl` is only set in development (electron-vite).
 */
export function isTrustedSender(frameUrl: string, devUrl?: string): boolean {
  if (devUrl) {
    try {
      return new URL(frameUrl).origin === new URL(devUrl).origin
    } catch {
      return false
    }
  }
  return /^file:\/\/\/.*\/renderer\/index\.html(?:[?#].*)?$/i.test(frameUrl)
}
