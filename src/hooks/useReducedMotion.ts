import { useSyncExternalStore } from 'react'

function reducedMotion() {
  return document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches
}

function subscribe(onChange: () => void) {
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  media.addEventListener('change', onChange)
  return () => { observer.disconnect(); media.removeEventListener('change', onChange) }
}

// Portaled dialogs/toasts follow the confirmed setting on <html> as well.
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, reducedMotion)
}
