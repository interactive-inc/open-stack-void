import { integer, sqliteTable, text } from "void/schema-d1"
import { members } from "@/contexts/membership/infrastructure/schema/membership"

export const channels = sqliteTable("chat_channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => members.id),
  createdAt: integer("created_at").notNull(),
})
