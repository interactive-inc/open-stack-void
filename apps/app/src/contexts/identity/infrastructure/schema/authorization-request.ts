import { integer, sqliteTable, text } from "void/schema-d1"

export const authorizationRequests = sqliteTable("chat_authorization_requests", {
  id: text("id").primaryKey(),
  verifierHash: text("verifier_hash").notNull(),
  userCode: text("user_code").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  memberId: text("member_id"),
  expiresAt: integer("expires_at").notNull(),
})
