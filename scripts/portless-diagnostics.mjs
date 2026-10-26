import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

/** Report only aggregate counts from isolated test state, never rows or credentials. */
export function portlessStateDiagnostics() {
  const latest = readdirSync(".local")
    .filter((name) => /^portless-e2e-\d+$/.test(name))
    .sort()
    .at(-1)
  if (!latest) return { stateFound: false, databases: [] }
  const directory = resolve(".local", latest)
  const databases = []
  for (const path of readdirSync(directory, { recursive: true }).filter((path) =>
    path.endsWith(".sqlite"),
  )) {
    const database = new DatabaseSync(resolve(directory, path), { readOnly: true })
    try {
      if (database.prepare("SELECT name FROM sqlite_master WHERE name = 'chat_members'").get())
        databases.push({
          members: database.prepare("SELECT COUNT(*) AS count FROM chat_members").get().count,
          bootstrapClaims: database
            .prepare("SELECT COUNT(*) AS count FROM chat_bootstrap_claims")
            .get().count,
        })
    } finally {
      database.close()
    }
  }
  return { stateFound: true, databases }
}
