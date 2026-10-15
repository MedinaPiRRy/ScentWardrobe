import { useEffect, useRef, type RefObject } from 'react'

/**
 * Escape closes only the top-most thing (a nested dialog, then the panel under it), instead of every open layer at
 * once. Layers register in the order they open.
 */
const stack: { id: number; handler: () => void }[] = []
let nextId = 1
let listening = false

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (top) {
    e.preventDefault()
    top.handler()
  }
}

export function useEscapeClose(handler: () => void, enabled = true): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const id = nextId++
    stack.push({ id, handler: () => ref.current() })
    if (!listening) {
      window.addEventListener('keydown', onKey)
      listening = true
    }
    return () => {
      const i = stack.findIndex((s) => s.id === id)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [enabled])
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps keyboard focus inside a dialog: focus moves in when it opens (to the first field, or the container), Tab and
 * Shift+Tab wrap around, and focus goes back to where it was when the dialog closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const root = ref.current
    if (!root || !active) return
    const before = document.activeElement as HTMLElement | null
    const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
    const first = root.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select') ?? items()[0]
    if (first) first.focus({ preventScroll: true })
    else {
      root.tabIndex = -1
      root.focus({ preventScroll: true })
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = items()
      if (list.length === 0) return e.preventDefault()
      const a = document.activeElement as HTMLElement | null
      const i = a ? list.indexOf(a) : -1
      if (e.shiftKey && (i <= 0)) {
        e.preventDefault()
        list[list.length - 1].focus()
      } else if (!e.shiftKey && (i === list.length - 1 || i === -1)) {
        e.preventDefault()
        list[0].focus()
      }
    }
    root.addEventListener('keydown', key)
    return () => {
      root.removeEventListener('keydown', key)
      if (before && document.contains(before)) before.focus({ preventScroll: true })
    }
  }, [ref, active])
}
