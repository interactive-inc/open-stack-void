import { it, expect } from "vite-plus/test"
import { DatabaseSync } from "node:sqlite"
import { readdirSync, readFileSync } from "node:fs"

it("adds reversible archive state without moving channel identities or deleting legacy rows", () => {
  const directory = new URL("../../../../db/migrations/", import.meta.url)
  const migration = "20261026210429_puzzling_master_chief.sql"
  const database = new DatabaseSync(":memory:")
  try {
    database.exec("PRAGMA foreign_keys = ON")
    for (const path of readdirSync(directory)
      .filter((path) => path.endsWith(".sql") && path < migration)
      .sort())
      database.exec(readFileSync(new URL(path, directory), "utf8"))
    database.exec(
      "INSERT INTO chat_members VALUES ('archive-owner', 'owner@example.com', 'Owner', 'owner', 'active', 0)",
    )
    database.exec(
      "INSERT INTO chat_channels (id,name,created_by,created_at) VALUES ('stable-id','legacy','archive-owner',0)",
    )
    database.exec(readFileSync(new URL(migration, directory), "utf8"))
    expect(
      database.prepare("SELECT id, name, archived FROM chat_channels WHERE id = 'stable-id'").get(),
    ).toMatchObject({ id: "stable-id", name: "legacy", archived: 0 })
    database.exec("UPDATE chat_channels SET archived = 1 WHERE id = 'stable-id'")
    expect(
      database.prepare("SELECT id FROM chat_channels WHERE id = 'stable-id'").get(),
    ).toMatchObject({ id: "stable-id" })
    database.exec("UPDATE chat_channels SET archived = 0 WHERE id = 'stable-id'")
    expect(
      database.prepare("SELECT archived FROM chat_channels WHERE id = 'stable-id'").get(),
    ).toMatchObject({ archived: 0 })
  } finally {
    database.close()
  }
})
