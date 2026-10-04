import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useReducedMotion } from './useReducedMotion'

interface ItemPosition { node: HTMLElement; top: number; left: number; width: number }

// Data changes immediately. A noninteractive exit copy and FLIP transforms
// keep neighbouring rows steady; neither height nor other layout is animated.
export function useEditorItemMotion(ref: RefObject<HTMLDivElement | null>, ids: string) {
  const reduced = useReducedMotion()
  const previous = useRef(new Map<string, ItemPosition>())
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const before = previous.current
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-item-id]'))
    const after = new Map(rows.map((node) => [node.dataset.itemId!, { node, top: node.offsetTop, left: node.offsetLeft, width: node.offsetWidth }]))
    previous.current = after
    if (reduced) return
    const style = getComputedStyle(document.documentElement)
    const duration = parseFloat(style.getPropertyValue('--dur-base')) || 0
    const easing = style.getPropertyValue('--ease-out').trim()
    const animations: Animation[] = []
    const ghosts: HTMLElement[] = []
    for (const [id, position] of after) {
      const old = before.get(id)
      if (!old) animations.push(position.node.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration, easing }))
      else if (old.top !== position.top) animations.push(position.node.animate([{ transform: `translateY(${old.top - position.top}px)` }, { transform: 'none' }], { duration, easing }))
    }
    for (const [id, old] of before) {
      if (after.has(id)) continue
      const ghost = old.node.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-item-id')
      ghost.classList.add('editor-item--exit')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.inert = true
      ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
      Object.assign(ghost.style, { top: `${old.top}px`, left: `${old.left}px`, width: `${old.width}px` })
      container.append(ghost)
      ghosts.push(ghost)
      animations.push(ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration, easing, fill: 'forwards' }))
    }
    const timer = window.setTimeout(() => ghosts.forEach((ghost) => ghost.remove()), duration)
    const cancel = () => { animations.forEach((animation) => animation.cancel()); ghosts.forEach((ghost) => ghost.remove()) }
    window.addEventListener('beforeprint', cancel)
    return () => { window.clearTimeout(timer); window.removeEventListener('beforeprint', cancel); cancel() }
  }, [ids, reduced, ref])
}
