import { integer, sqliteTable, text } from "void/schema-d1"

export const members = sqliteTable("chat_members", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
})

export const invitations = sqliteTable("chat_invitations", {
  id: text("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  email: text("email").notNull(),
  state: text("state").notNull().default("pending"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => members.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
})
