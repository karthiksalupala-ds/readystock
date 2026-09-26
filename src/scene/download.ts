/**
 * Handing a file to the person using the app.
 *
 * The browser only offers a download from a click it can attribute to the user,
 * so this stays synchronous from the handler: build the blob, click a link, and
 * release the object URL. Anything slow — serialising a model, say — must be
 * awaited before calling this, not inside it.
 */
export function downloadFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.rel = 'noopener'
    link.click()
  } finally {
    // Revoking immediately is safe: the click has already taken its own reference.
    URL.revokeObjectURL(url)
  }
}
