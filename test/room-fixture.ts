import { DatabaseSync } from "node:sqlite"
import { readdirSync } from "node:fs"
import { resolve, join, sep, basename, dirname } from "node:path"

export function withRoomFixture(channelId: string, action: (database: DatabaseSync) => void) {
  const configured = process.env.VOID_CHAT_ROOM_FIXTURE_ROOT
  if (!configured || !/^[a-f0-9-]{36}$/.test(channelId))
    throw new Error("Missing isolated room fixture")
  const root = resolve(configured)
  if (
    !root.startsWith(resolve(".local") + sep) ||
    basename(root) !== "app" ||
    !/^app-suite-\d+$/.test(basename(dirname(root)))
  )
    throw new Error("Refusing non-test room state")
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(directory, entry.name))
        : entry.name.endsWith(".sqlite")
          ? [join(directory, entry.name)]
          : [],
    )
  const matches = walk(root).filter((path) => {
    const database = new DatabaseSync(path, { readOnly: true })
    try {
      if (
        !database
          .prepare("SELECT name FROM sqlite_master WHERE name = 'messages' AND type = 'table'")
          .get()
      )
        return false
      const columns = database.prepare("PRAGMA table_info(messages)").all()
      if (!columns.some((column) => column.name === "channelId")) return false
      return (
        database.prepare("SELECT id FROM messages WHERE channelId = ? LIMIT 1").get(channelId) !==
        undefined
      )
    } finally {
      database.close()
    }
  })
  if (matches.length !== 1 || !matches[0]?.startsWith(root + sep))
    throw new Error("Ambiguous isolated room fixture")
  const database = new DatabaseSync(matches[0])
  try {
    database.exec("PRAGMA busy_timeout = 3000")
    action(database)
  } finally {
    database.close()
  }
}
