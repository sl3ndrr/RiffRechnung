export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.tabIndex = -1
  link.setAttribute('aria-hidden', 'true')
  try {
    document.body.append(link)
    link.click()
  } catch (error) {
    link.remove()
    URL.revokeObjectURL(url)
    throw error
  }
  // Some engines finish initiating the download after click() returns. Keep
  // both the attached anchor and its blob alive until they have consumed it.
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url) }, 60_000)
}

export function downloadText(filename: string, content: string, type = 'application/json'): void {
  downloadBlob(filename, new Blob([content], { type }))
}

export function downloadBytes(fileName: string, bytes: Uint8Array): void {
  downloadBlob(fileName, new Blob([bytes.slice().buffer], { type: 'application/octet-stream' }))
}

