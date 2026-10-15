export type ThemeChoice = 'dark' | 'light' | 'system'

const KEY = 'ui.theme'

export function storedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'system' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

/** Applies a choice to the document. 'system' follows the operating system and updates live. */
export function applyTheme(choice: ThemeChoice): () => void {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    /* optional */
  }
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: light)')
  const set = () => {
    root.dataset.theme = choice === 'system' ? (media.matches ? 'light' : 'dark') : choice
  }
  set()
  if (choice !== 'system') return () => undefined
  media.addEventListener('change', set)
  return () => media.removeEventListener('change', set)
}
