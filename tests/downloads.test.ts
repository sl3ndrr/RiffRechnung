import test from 'node:test'
import assert from 'node:assert/strict'
import { downloadBytes, downloadText } from '../src/lib/downloads'

test('P04: Downloads erhalten Blob und angehängten Link bis zur asynchronen Initiierung; Fehler geben sie frei', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const revoke = URL.revokeObjectURL
  const revoked: string[] = []
  const timers: Array<() => void> = []
  let completion: Promise<{ bytes: Uint8Array; type: string }>
  let attached = false
  let failClick = false
  let currentUrl = ''
  const link = {
    href: '', download: '', tabIndex: 0,
    setAttribute() {},
    remove() { attached = false },
    click() {
      currentUrl = this.href
      if (failClick) throw new Error('Downloadinitiierung fehlgeschlagen')
      // A real Node Blob URL is consumed in a later microtask. Early revocation
      // fails the fetch; a detached link would fail the attached-state assertion.
      completion = Promise.resolve().then(async () => {
        assert.equal(attached, true)
        const response = await fetch(this.href)
        return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get('content-type')! }
      })
    },
  }
  try {
    URL.revokeObjectURL = (url) => { revoked.push(url); revoke(url) }
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => link, body: { append: () => { attached = true } } } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout: (callback: () => void, delay: number) => { assert.ok(delay > 0); timers.push(callback) } } })
    const raw = '{Rohtext\r\nübrig}'
    downloadText('roh.txt', raw, 'text/plain')
    assert.equal(revoked.length, 0)
    assert.equal(link.download, 'roh.txt')
    const text = await completion!
    assert.equal(new TextDecoder().decode(text.bytes), raw)
    assert.equal(text.type, 'text/plain')
    timers.shift()!()
    assert.equal(attached, false)
    assert.deepEqual(revoked, [currentUrl])

    const source = new Uint8Array([42, 255, 0, 13, 10, 254, 42])
    downloadBytes('original.bin', source.subarray(1, 6))
    source.fill(0) // The download must own the original selected bytes.
    const bytes = await completion!
    assert.deepEqual([...bytes.bytes], [255, 0, 13, 10, 254])
    assert.equal(bytes.type, 'application/octet-stream')
    timers.shift()!()
    assert.equal(revoked.length, 2)
    assert.equal(attached, false)

    failClick = true
    assert.throws(() => downloadText('fehler.json', '{}'), /Downloadinitiierung/)
    assert.equal(revoked.length, 3)
    assert.equal(attached, false)
    assert.equal(timers.length, 0)
  } finally {
    URL.revokeObjectURL = revoke
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

