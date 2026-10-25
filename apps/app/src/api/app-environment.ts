import type { Member } from "@/contexts/membership/domain/member"

export type AppEnvironment = {
  Bindings: { DB: D1Database }
  Variables: { member: Member; sessionHash: string; sessionKind: string }
}
