import { index, integer, sqliteTable, text } from "void/schema-d1"
import { members } from "@/contexts/membership/infrastructure/schema/membership"

export const credentials = sqliteTable(
  "chat_credentials",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("chat_credentials_member_idx").on(table.memberId)],
)

export const sessions = sqliteTable(
  "chat_sessions",
  {
    hash: text("hash").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("chat_sessions_member_idx").on(table.memberId),
    index("chat_sessions_expiry_idx").on(table.expiresAt),
  ],
)

export const challenges = sqliteTable(
  "chat_challenges",
  {
    id: text("id").primaryKey(),
    challenge: text("challenge").notNull(),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("chat_challenges_expiry_idx").on(table.expiresAt)],
)

export const bootstrapClaims = sqliteTable("chat_bootstrap_claims", {
  id: integer("id").primaryKey(),
})
