import { useEffect, useState } from 'react'

/** Cached images are also served by the main process under the scentimg:// scheme. */
export function imgUrl(file: string | null | undefined): string | null {
  if (!file) return null
  if (/^(scentimg|data|https?):/.test(file)) return file
  return `scentimg://img/${encodeURIComponent(file)}`
}

const cache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

/** Loads a picture through the main process (as a data URL) and remembers it, so it does not depend on the image scheme. */
function loadImage(file: string): Promise<string | null> {
  const hit = cache.get(file)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(file)
  if (!p) {
    p = window.api.images
      .read(file)
      .then((url) => {
        if (url) cache.set(file, url)
        return url
      })
      .catch(() => null)
      .finally(() => pending.delete(file))
    pending.set(file, p)
  }
  return p
}

/**
 * The source to show for a cached picture. Starts from the data URL (instant when already loaded), and falls back to the
 * scentimg:// address if reading it through the main process fails. Null while loading or when there is no picture.
 */
export function useImageSrc(file: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() => (file ? (cache.get(file) ?? null) : null))
  useEffect(() => {
    if (!file) return setSrc(null)
    if (/^(scentimg|data|https?):/.test(file)) return setSrc(file)
    const cached = cache.get(file)
    if (cached) return setSrc(cached)
    let live = true
    setSrc(null)
    void (async () => {
      // The main process already retries; trying again a few more times covers a longer hiccup right after start-up.
      for (let i = 0; i < 5 && live; i++) {
        const url = await loadImage(file)
        if (url) return live && setSrc(url)
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (live) setSrc(imgUrl(file))
    })()
    return () => {
      live = false
    }
  }, [file])
  return src
}
