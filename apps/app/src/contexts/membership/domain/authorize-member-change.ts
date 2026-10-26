import type { Member } from "@/contexts/membership/domain/member"
import { MemberChangeFailed } from "@/contexts/membership/domain/member-change-failed"

export function authorizeMemberChange(actor: Member, target: Member, role: string | null) {
  if (actor.status !== "active" || target.role === "owner" || actor.id === target.id) {
    return new MemberChangeFailed("forbidden")
  }

  if (actor.role === "owner") return null

  if (actor.role === "admin" && target.role === "member" && role === null) return null

  return new MemberChangeFailed("forbidden")
}
