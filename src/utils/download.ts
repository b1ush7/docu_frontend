/** Names follow the selected version's extension, even after converting the file. */
export function versionFileName(displayName: string, versionNo: number, extension: string): string {
  const stem = displayName.replace(/\.[^.]+$/, '') || 'document'
  return `${stem}-v${versionNo}.${extension.toLowerCase()}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
}
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Allow the browser to start consuming the URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
