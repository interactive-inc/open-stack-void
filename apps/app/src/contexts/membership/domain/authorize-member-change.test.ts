import { describe, expect, it } from "vite-plus/test"
import { authorizeMemberChange } from "@/contexts/membership/domain/authorize-member-change"
import type { Member } from "@/contexts/membership/domain/member"

const owner: Member = {
  id: "owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  status: "active",
  createdAt: 0,
}
const administrator: Member = { ...owner, id: "administrator", role: "admin" }
const member: Member = { ...owner, id: "member", role: "member" }

describe("member authority", () => {
  it("protects the owner and self from mutation", () => {
    expect(authorizeMemberChange(administrator, owner, null)).toBeInstanceOf(Error)
    expect(authorizeMemberChange(owner, owner, "member")).toBeInstanceOf(Error)
    expect(authorizeMemberChange(administrator, administrator, null)).toBeInstanceOf(Error)
  })
  it("lets owners assign roles and admins only disable ordinary members", () => {
    expect(authorizeMemberChange(owner, member, "admin")).toBeNull()
    expect(authorizeMemberChange(administrator, member, null)).toBeNull()
    expect(authorizeMemberChange(administrator, member, "admin")).toBeInstanceOf(Error)
    expect(authorizeMemberChange(member, administrator, null)).toBeInstanceOf(Error)
    expect(authorizeMemberChange({ ...owner, status: "disabled" }, member, null)).toBeInstanceOf(
      Error,
    )
  })
})
