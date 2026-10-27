import { describe, expect, it } from "vite-plus/test"
import { authenticationError } from "@/client/authentication-error"

describe("device authentication guidance", () => {
  it("replaces cancellation and timeout details with an actionable explanation", () => {
    const error = new Error("The operation either timed out or was not allowed")
    error.name = "NotAllowedError"
    expect(authenticationError(error).message).toContain("登録済みの端末")
    expect(authenticationError(error).message).not.toContain("timed out")
  })
  it("preserves server validation errors without replacing their reason", () => {
    const error = new Error("招待の期限が切れています")
    expect(authenticationError(error)).toBe(error)
  })
})
