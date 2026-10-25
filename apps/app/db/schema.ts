import { sql } from "void/db"
import { integer, sqliteTable, text } from "void/schema-d1"
import {
  credentials,
  sessions,
  challenges,
  bootstrapClaims,
} from "@/contexts/identity/infrastructure/schema/identity"
import { members, invitations } from "@/contexts/membership/infrastructure/schema/membership"
import { channels } from "@/contexts/chat/infrastructure/schema/chat"
import { authorizationRequests } from "@/contexts/identity/infrastructure/schema/authorization-request"

export {
  credentials,
  sessions,
  challenges,
  bootstrapClaims,
  members,
  invitations,
  channels,
  authorizationRequests,
}

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
})
