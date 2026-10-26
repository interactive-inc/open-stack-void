import { beforeEach, expect, it, vi } from "vite-plus/test"
import { sendEmail } from "void/email"
import { InvitationMailAdapter } from "@/contexts/membership/infrastructure/adapters/invitation-mail.adapter"

vi.mock("void/email", () => ({ sendEmail: vi.fn() }))
const send = vi.mocked(sendEmail)
beforeEach(() => send.mockReset())

it("does not send unsupported idempotency keys to the native binding", async () => {
  send.mockResolvedValue({ ok: true, ids: [] })
  expect(
    await new InvitationMailAdapter().send(
      "guest@example.com",
      "fake-private-link",
      "stable-attempt-key",
    ),
  ).toBe("sent")
  expect(send.mock.calls[0]?.[0].idempotencyKey).toBeUndefined()
})

it("passes the stable per-attempt key only with verified provider support", async () => {
  send.mockResolvedValue({ ok: true, ids: [] })
  const adapter = new InvitationMailAdapter(true)
  await adapter.send("guest@example.com", "fake-private-link", "stable-attempt-key")
  expect(send.mock.calls[0]?.[0].idempotencyKey).toBe("stable-attempt-key")
})

it("distinguishes explicit refusal from an unknown request result without logging provider data", async () => {
  const warning = vi.spyOn(console, "warn")
  try {
    send.mockResolvedValue({
      ok: false,
      error: { code: "UNVERIFIED_DESTINATION", message: "private" },
    })
    expect(
      await new InvitationMailAdapter().send("guest@example.com", "fake-private-link", "key"),
    ).toBe("failed")
    send.mockResolvedValue({ ok: false, error: { code: "OUTCOME_UNKNOWN", message: "private" } })
    expect(
      await new InvitationMailAdapter().send("guest@example.com", "fake-private-link", "key"),
    ).toBe("unknown")
    expect(warning).not.toHaveBeenCalled()
  } finally {
    warning.mockRestore()
  }
})
