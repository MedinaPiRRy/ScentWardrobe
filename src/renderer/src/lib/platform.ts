/** Keyboard shortcuts use Command on macOS and Control elsewhere. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
export const MOD_LABEL = isMac ? '⌘' : 'Ctrl+'
export const hasMod = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)
