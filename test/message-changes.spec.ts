import { test, expect } from "@playwright/test"
import { VoidChatClient } from "@open-stack/sdk"
import { ownerSession, guestSession, issueInvitation, origin, headers } from "./invitation-fixture"

test("message changes preserve ownership, revisions, archive restrictions and revoked access", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const invitation = await issueInvitation(owner)
  const member = await guestSession(browser, invitation.token)
  const outsider = await guestSession(browser)
  try {
    await member.page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
    await expect(member.page.getByRole("heading", { name: "# general" })).toBeVisible()
    const actor = await (await member.page.request.get(`${origin}/api/me`)).json()
    const id = crypto.randomUUID()
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels`, {
          headers,
          data: { id, name: `edit-${id.slice(0, 8)}` },
        })
      ).status(),
    ).toBe(201)
    const client = new VoidChatClient({
      baseUrl: origin,
      token: null,
      request: async (url, options) => {
        const response = await member.page.request.fetch(url, {
          method: options.method,
          headers: { ...Object.fromEntries(new Headers(options.headers)), ...headers },
          data: options.body as string | undefined,
        })
        return new Response(await response.body(), { status: response.status() })
      },
    })
    const original = await client.sendMessage(id, "original")
    const path = `${origin}/api/channels/${id}/messages/${original.id}`
    for (const [request, status] of [
      [owner.page.request, 403],
      [outsider.page.request, 401],
    ] as const) {
      expect(
        (
          await request.patch(path, { headers, data: { revision: 0, text: "unauthorized" } })
        ).status(),
      ).toBe(status)
      expect((await request.delete(path, { headers, data: { revision: 0 } })).status()).toBe(status)
    }
    expect(
      (
        await member.page.request.patch(`${origin}/api/channels/general/messages/${original.id}`, {
          headers,
          data: { revision: 0, text: "wrong room" },
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await member.page.request.patch(path, { headers, data: { revision: 0, text: "" } })
      ).status(),
    ).toBe(400)
    const races = await Promise.all(
      ["first", "second"].map((text) =>
        member.page.request.patch(path, { headers, data: { revision: 0, text } }),
      ),
    )
    expect(races.map((response) => response.status()).sort()).toEqual([200, 409])
    const updated = await client.editMessage(id, original.id, "updated", 1)
    expect(updated).toMatchObject({ text: "updated", revision: 2 })
    expect((await client.search(id, "original")).results).toEqual([])
    expect((await client.search(id, "updated")).results.map((result) => result.id)).toEqual([
      original.id,
    ])
    await owner.page.request.patch(`${origin}/api/channels/${id}/archive`, {
      headers,
      data: { archived: true },
    })
    expect(
      (
        await member.page.request.patch(path, { headers, data: { revision: 2, text: "archived" } })
      ).status(),
    ).toBe(409)
    expect(
      (await member.page.request.delete(path, { headers, data: { revision: 2 } })).status(),
    ).toBe(409)
    expect(await client.message(id, original.id)).toMatchObject({ text: "updated", revision: 2 })
    await owner.page.request.patch(`${origin}/api/channels/${id}/archive`, {
      headers,
      data: { archived: false },
    })
    const deleted = await client.deleteMessage(id, original.id, 2)
    expect(deleted).toMatchObject({ text: "", revision: 3 })
    expect(deleted.deletedAt).not.toBeNull()
    expect((await client.search(id, "updated")).results).toEqual([])
    expect(
      (
        await member.page.request.post(`${origin}/api/channels/${id}/messages`, {
          headers,
          data: { id: original.id, text: "original" },
        })
      ).status(),
    ).toBe(409)
    const second = await client.sendMessage(id, "survives revocation")
    expect(
      (await owner.page.request.delete(`${origin}/api/members/${actor.id}`, { headers })).status(),
    ).toBe(200)
    for (const method of ["PATCH", "DELETE"]) {
      expect(
        (
          await member.page.request.fetch(`${origin}/api/channels/${id}/messages/${second.id}`, {
            method,
            headers,
            data: { revision: 0, ...(method === "PATCH" ? { text: "disabled" } : {}) },
          })
        ).status(),
      ).toBe(401)
    }
    expect(
      (await owner.page.request.get(`${origin}/api/channels/${id}/messages/${second.id}`)).status(),
    ).toBe(200)
    expect(
      await (
        await owner.page.request.get(`${origin}/api/channels/${id}/messages/${second.id}`)
      ).json(),
    ).toMatchObject({ text: "survives revocation", revision: 0 })
  } finally {
    await member.context.close()
    await outsider.context.close()
    await owner.close()
  }
})
