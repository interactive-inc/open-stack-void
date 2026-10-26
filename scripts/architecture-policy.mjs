import { parse } from "@babel/parser"

export function inspectArchitecture(path, source) {
  const failures = []
  const context = path.match(/^apps\/app\/src\/contexts\/([^/]+)\/([^/]+)\//)
  const client = /^(apps\/(cli|mcp)|packages\/sdk)\/src\//.test(path)
  if (path.startsWith("apps/app/src/contexts/") && !context)
    return ["context file must belong to a layer"]
  if ((!context && !client) || path.endsWith(".test.ts")) return failures
  if (context && !["domain", "application", "infrastructure", "interface"].includes(context[2]))
    failures.push("unknown context layer")
  const tree = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    createImportExpressions: true,
  })
  function visit(node) {
    if (node.type === "ImportExpression") failures.push("dynamic import")
    if (node.type === "TSImportType") failures.push("inline type import")
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) &&
      node.source
    ) {
      const target = node.source.value
      const typeOnly =
        node.importKind === "type" ||
        node.exportKind === "type" ||
        (node.type === "ImportDeclaration" &&
          node.specifiers.length > 0 &&
          node.specifiers.every((item) => item.importKind === "type"))
      if (context && target.startsWith(".")) failures.push("relative context import")
      if (client && /^(?:void(?:\/|$)|cloudflare:|@\/contexts\/|@app\/|drizzle-orm)/.test(target))
        failures.push("client database/server dependency")
      if (
        context?.[2] === "domain" &&
        target !== "zod" &&
        !/^@\/contexts\/[^/]+\/domain\//.test(target)
      )
        failures.push("domain dependency")
      if (
        context?.[2] === "application" &&
        !typeOnly &&
        target !== "zod" &&
        !new RegExp(`^@/contexts/${context[1]}/(?:domain|application)/`).test(target)
      )
        failures.push("application runtime dependency")
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) visit(child)
      } else if (value?.type) visit(value)
    }
  }
  visit(tree)
  return [...new Set(failures)]
}
