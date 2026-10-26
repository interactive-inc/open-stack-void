import { DatabaseSync } from "node:sqlite"
import { readdirSync } from "node:fs"
import { resolve, join, sep, basename, dirname } from "node:path"

/** Fault injection is confined to an isolated suite database and one synthetic ID. */
export function setDeliveryFixture(
  id: string,
  state: "queued" | "failed" | "unknown" | "sending",
  attempts: number,
) {
  const configured = process.env.VOID_CHAT_ROOM_FIXTURE_ROOT
  if (
    !configured ||
    !/^[a-f0-9-]{36}$/.test(id) ||
    !Number.isInteger(attempts) ||
    attempts < 0 ||
    attempts > 3
  )
    throw new Error("Invalid isolated delivery fixture")
  const root = resolve(configured)
  if (
    !root.startsWith(resolve(".local") + sep) ||
    basename(root) !== "app" ||
    !/^app-suite-\d+$/.test(basename(dirname(root)))
  )
    throw new Error("Refusing non-test invitation state")
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(directory, entry.name))
        : entry.name.endsWith(".sqlite")
          ? [join(directory, entry.name)]
          : [],
    )
  const candidates = walk(root).filter((path) => {
    const database = new DatabaseSync(path, { readOnly: true })
    try {
      return (
        Boolean(
          database
            .prepare(
              "SELECT name FROM sqlite_master WHERE name = 'chat_invitations' AND type = 'table'",
            )
            .get(),
        ) && Boolean(database.prepare("SELECT id FROM chat_invitations WHERE id = ?").get(id))
      )
    } finally {
      database.close()
    }
  })
  if (candidates.length !== 1 || !candidates[0]?.startsWith(root + sep))
    throw new Error("Ambiguous isolated invitation fixture")
  const database = new DatabaseSync(candidates[0])
  try {
    database.exec("PRAGMA busy_timeout = 3000")
    database
      .prepare(
        "UPDATE chat_invitations SET delivery_state = ?, delivery_attempts = ?, delivery_lease = NULL, delivery_lease_until = 0 WHERE id = ? AND state = 'pending'",
      )
      .run(state, attempts, id)
  } finally {
    database.close()
  }
}
