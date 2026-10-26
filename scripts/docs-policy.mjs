export function inspectDocumentation(catalog, documents, files, scripts, changed = null) {
  const failures = []
  if (catalog.version !== 1) failures.push("unsupported catalog version")
  const ids = new Map()
  const paths = new Map()
  for (const record of catalog.records) {
    if (typeof record.source !== "string" || !record.source.trim())
      failures.push(`${record.id}: missing provenance`)
    if (!/^[a-z][a-z0-9-]+$/.test(record.id) || ids.has(record.id))
      failures.push(`invalid/duplicate ID: ${record.id}`)
    ids.set(record.id, record)
    if (paths.has(record.path)) failures.push(`duplicate document: ${record.path}`)
    paths.set(record.path, record)
    if (
      !["proposed", "current", "superseded"].includes(record.status) ||
      !["user", "observed", "inferred"].includes(record.evidence) ||
      !["instruction", "requirement", "decision", "evidence", "index"].includes(record.kind)
    )
      failures.push(`${record.id}: invalid metadata`)
    if (!documents.has(record.path)) failures.push(`${record.id}: missing prose`)
    if (
      !Array.isArray(record.related) ||
      !Array.isArray(record.implementation) ||
      !Array.isArray(record.verification) ||
      !Array.isArray(record.supersedes)
    )
      failures.push(`${record.id}: missing trace arrays`)
  }
  function visit(id, ancestors) {
    if (ancestors.has(id)) {
      failures.push(`${id}: cyclic supersession`)
      return
    }
    const next = new Set([...ancestors, id])
    for (const previous of ids.get(id)?.supersedes ?? []) visit(previous, next)
  }
  for (const id of ids.keys()) visit(id, new Set())
  for (const record of catalog.records) {
    for (const id of [...record.related, ...record.supersedes])
      if (!ids.has(id) || id === record.id) failures.push(`${record.id}: invalid related ID ${id}`)
    if (
      record.status === "superseded" &&
      !catalog.records.some((other) => other.supersedes.includes(record.id))
    )
      failures.push(`${record.id}: missing successor`)
    for (const path of [...record.implementation, ...record.verification])
      if (!files.has(path)) failures.push(`${record.id}: missing evidence path ${path}`)
    const prose = documents.get(record.path) ?? ""
    for (const match of prose.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)) {
      const target = match[1]
      const candidates = catalog.records.filter(
        (item) => item.id === target || item.path.split("/").at(-1) === `${target}.md`,
      )
      if (candidates.length !== 1)
        failures.push(`${record.id}: broken/ambiguous wiki link ${target}`)
    }
    if (record.status === "current")
      for (const match of prose.matchAll(/vp run ([a-z][\w:-]*)/g))
        if (
          !scripts[match[1]] &&
          !catalog.exceptions.some(
            (exception) =>
              exception.id &&
              exception.reason &&
              exception.document === record.id &&
              exception.command === match[1],
          )
        )
          failures.push(`${record.id}: unknown command ${match[1]}`)
  }
  for (const path of documents.keys())
    if (!paths.has(path)) failures.push(`unregistered prose: ${path}`)
  if (changed)
    for (const path of changed) {
      if (
        !/^(apps\/|packages\/|scripts\/|test\/|\.github\/|package(?:-lock)?\.json$|playwright\.)/.test(
          path,
        ) ||
        path.includes("/.docs/") ||
        path.endsWith("AGENTS.md")
      )
        continue
      const related = catalog.records.filter((record) =>
        [...record.implementation, ...record.verification].some(
          (owned) => path === owned || path.startsWith(`${owned}/`),
        ),
      )
      if (!related.some((record) => record.status === "current" && changed.has(record.path)))
        failures.push(`${path}: update a related current rationale record`)
    }
  return failures
}
