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

it("preserves legacy invitation validity and marks unobserved delivery unknown without a database rebuild", () => {
  const directory = new URL("../../../../db/migrations/", import.meta.url)
  const migration = "20261026231107_superb_boomer.sql"
  const database = new DatabaseSync(":memory:")
  try {
    database.exec("PRAGMA foreign_keys = ON")
    for (const file of readdirSync(directory)
      .filter((file) => file.endsWith(".sql") && file < migration)
      .sort())
      database.exec(readFileSync(new URL(file, directory), "utf8"))
    database.exec(
      "INSERT INTO chat_members (id,email,name,role,status,created_at) VALUES ('legacy-owner','legacy@example.com','Legacy','owner','active',0)",
    )
    database.exec(
      "INSERT INTO chat_invitations (id,hash,email,invited_by,expires_at,created_at) VALUES ('legacy-invite','synthetic-legacy-hash','guest@example.com','legacy-owner',99999999999999,0)",
    )
    const before = database
      .prepare("SELECT id,hash,email,state,expires_at FROM chat_invitations")
      .get()
    const sql = readFileSync(new URL(migration, directory), "utf8")
    expect(sql).not.toMatch(/DROP|DELETE|CREATE TABLE/i)
    database.exec(sql)
    expect(
      database.prepare("SELECT id,hash,email,state,expires_at FROM chat_invitations").get(),
    ).toEqual(before)
    expect(
      database
        .prepare("SELECT delivery_state,delivery_attempts,delivery_lease FROM chat_invitations")
        .get(),
    ).toMatchObject({ delivery_state: "unknown", delivery_attempts: 0, delivery_lease: null })
  } finally {
    database.close()
  }
})
