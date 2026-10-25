import type { Member } from "@/contexts/membership/domain/member"

export function authorizeMemberChange(actor: Member, target: Member, role: string | null) {
  if (actor.status !== "active" || target.role === "owner" || actor.id === target.id) {
    return new Error("このメンバーは変更できません")
  }

  if (actor.role === "owner") return null

  if (actor.role === "admin" && target.role === "member" && role === null) return null

  return new Error("権限がありません")
}
