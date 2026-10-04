import { useCallback, useState } from 'react'
import type { ToastMessage } from '../types'
import { uid } from '../lib/identities'

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toast = useCallback((message: string, tone: ToastMessage['tone'] = 'info', options: Pick<ToastMessage, 'action' | 'durationMs'> = {}) => {
    setToasts((current) => [...current, { id: uid('toast'), message, tone, ...options }].slice(-3))
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((current) => current.filter((item) => item.id !== id)), [])
  const clearUndoToasts = useCallback(() => setToasts((current) => current.filter((item) => !item.action)), [])
  return { toasts, toast, dismissToast, clearUndoToasts }
}
