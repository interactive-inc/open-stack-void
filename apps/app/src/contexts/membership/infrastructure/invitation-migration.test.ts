import { it, expect } from "vite-plus/test"
import { DatabaseSync } from "node:sqlite"
import { readdirSync, readFileSync } from "node:fs"

it("keeps legacy invitations and blocks closed links for legacy expiry-only readers", () => {
  const directory = new URL("../../../../db/migrations/", import.meta.url)
  const migration = "20261026202411_blue_amazoness.sql"
  const database = new DatabaseSync(":memory:")
  try {
    database.exec("PRAGMA foreign_keys = ON")
    for (const path of readdirSync(directory)
      .filter((path) => path.endsWith(".sql") && path < migration)
      .sort())
      database.exec(readFileSync(new URL(path, directory), "utf8"))
    database.exec(
      "INSERT INTO chat_members (id, email, name, role, status, created_at) VALUES ('migration-owner', 'owner@example.com', 'Owner', 'owner', 'active', 0)",
    )
    database.exec(
      "INSERT INTO chat_invitations (id, hash, email, invited_by, expires_at, created_at) VALUES ('migration-invite', 'synthetic-migration-hash', 'member@example.com', 'migration-owner', 99999999999999, 0)",
    )
    database.exec(readFileSync(new URL(migration, directory), "utf8"))
    expect(database.prepare("SELECT COUNT(*) AS count FROM chat_members").get()).toMatchObject({
      count: 1,
    })
    expect(database.prepare("SELECT email, state FROM chat_invitations").get()).toMatchObject({
      email: "member@example.com",
      state: "pending",
    })
    database.exec("UPDATE chat_invitations SET state = 'revoked', expires_at = 0")
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM chat_invitations WHERE expires_at > ?")
        .get(Date.now()),
    ).toMatchObject({ count: 0 })
    expect(database.prepare("SELECT COUNT(*) AS count FROM chat_invitations").get()).toMatchObject({
      count: 1,
    })
  } finally {
    database.close()
  }
})
