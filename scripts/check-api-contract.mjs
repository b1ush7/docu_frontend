import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import ts from 'typescript'

// Usage: node scripts/check-api-contract.mjs <backend repository>
const backend = process.argv[2]
assert(backend, 'Provide the backend repository path')
const controllerDir = path.join(backend, 'src/main/java/com/documenter/controller')
const canonical = value => value.replace(/\$\{[^}]*\}|\{[^}]*\}|__param__/g, '{}')
const routes = new Set(['POST /user/logout']) // Spring Security LogoutFilter.
for (const file of fs.readdirSync(controllerDir).filter(name => name.endsWith('.java'))) {
  const text = fs.readFileSync(path.join(controllerDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const base = text.match(/@RequestMapping\("([^"]+)"\)/)?.[1] ?? ''
  for (const match of text.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping\b(?:\(([^)]*)\))?/g)) {
    const suffix = match[2]?.match(/"([^"]*)"/)?.[1] ?? ''
    routes.add(`${match[1].toUpperCase()} ${canonical(base + suffix)}`)
  }
}
const endpointText = fs.readFileSync('src/api/endpoints.ts', 'utf8')
const js = ts.transpileModule(endpointText, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { API_ENDPOINTS } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const calls = []
const unresolved = []
// getBlobWithHeaders 与 getBlob 同为二进制 GET，只是额外把响应头返回给调用方
const methodNames = { getData: 'GET', getBlob: 'GET', getBlobWithHeaders: 'GET', postData: 'POST', putData: 'PUT', deleteData: 'DELETE' }
for (const file of fs.readdirSync('src/api').filter(name => /\.[jt]s$/.test(name) && !['mock.ts', 'http.ts', 'endpoints.ts', 'types.ts'].includes(name))) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join('src/api', file), 'utf8'), ts.ScriptTarget.Latest, true)
  const variables = new Map()
  function visit(node, fn) { fn(node); ts.forEachChild(node, child => visit(child, fn)) }
  visit(source, node => { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables.set(node.name.text, node.initializer) })
  function resolve(node, depth = 0) {
    if (!node || depth > 12) return null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isIdentifier(node)) return resolve(variables.get(node.text), depth + 1)
    if (ts.isConditionalExpression(node)) return resolve(node.whenTrue, depth + 1)
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text
      for (const span of node.templateSpans) value += (resolve(span.expression, depth + 1) ?? '{}') + span.literal.text
      return value
    }
    const text = node.getText(source)
    if (text.startsWith('API_ENDPOINTS.')) {
      const member = (ts.isCallExpression(node) ? node.expression : node).getText(source).split('.').slice(1)
      let value = API_ENDPOINTS
      for (const key of member) value = value?.[key]
      if (typeof value === 'function') value = value(...node.arguments.map(() => '__param__'))
      return typeof value === 'string' ? value : null
    }
    return null
  }
  visit(source, node => {
    if (!ts.isCallExpression(node)) return
    let method = methodNames[node.expression.getText(source)]
    if (ts.isPropertyAccessExpression(node.expression) && ['request', 'http'].includes(node.expression.expression.getText(source))) {
      method = ({ get: 'GET', post: 'POST', put: 'PUT', delete: 'DELETE' })[node.expression.name.text]
    }
    if (!method) return
    const endpoint = resolve(node.arguments[0])?.split('?')[0]
    const line = source.getLineAndCharacterOfPosition(node.pos).line + 1
    if (!endpoint?.startsWith('/')) { unresolved.push(`${file}:${line} ${node.getText(source)}`); return }
    calls.push({ file, line, method, path: canonical(endpoint) })
  })
}
const mismatches = calls.filter(call => !routes.has(`${call.method} ${call.path}`))
const distinct = new Set(calls.map(call => `${call.method} ${call.path}`))
console.log(JSON.stringify({ wrappers: calls.length, uniqueRoutes: distinct.size, backendRoutes: routes.size,
  matched: calls.length - mismatches.length, mismatches, unresolved, routes: [...distinct].sort(),
  unwrappedRoutes: [...routes].filter(route => !distinct.has(route)).sort() }, null, 2))
assert.equal(unresolved.length, 0, 'Some API wrappers could not be resolved')
assert.equal(mismatches.length, 0, 'Frontend methods/paths differ from backend controllers')
