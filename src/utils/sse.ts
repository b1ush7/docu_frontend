/** Incremental SSE framing, including CRLF split across network chunks. */
export function createSseParser(onEvent: (name: string, data: string) => void) {
  let buffer = ''
  let name = 'message'
  let data: string[] = []
  function line(value: string): void {
    if (!value) {
      if (data.length) onEvent(name, data.join('\n'))
      name = 'message'; data = []
      return
    }
    if (value.startsWith(':')) return
    const colon = value.indexOf(':')
    const field = colon < 0 ? value : value.slice(0, colon)
    const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') name = content
    else if (field === 'data') data.push(content)
  }
  function push(text: string): void {
    buffer += text
    let index: number
    while ((index = buffer.search(/[\r\n]/)) >= 0) {
      if (buffer[index] === '\r' && index === buffer.length - 1) break
      const length = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1
      line(buffer.slice(0, index))
      buffer = buffer.slice(index + length)
    }
  }
  function finish(): void {
    if (buffer.endsWith('\r')) buffer = buffer.slice(0, -1)
    if (buffer) line(buffer)
    buffer = ''
    line('')
  }
  return { push, finish }
}
