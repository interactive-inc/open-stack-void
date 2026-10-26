import { test, expect } from "@playwright/test"
import { ownerSession, guestSession, issueInvitation, origin, headers } from "./invitation-fixture"
import type { APIRequestContext } from "@playwright/test"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { packageBin } from "../scripts/package-bin.mjs"

async function send(
  request: APIRequestContext,
  channel: string,
  text: string,
  id = crypto.randomUUID(),
) {
  return request.post(`${origin}/api/channels/${channel}/messages`, { headers, data: { id, text } })
}

test("public channels retain history through rename, archive, restore and concurrent retries", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const invitation = await issueInvitation(owner)
  const member = await guestSession(browser, invitation.token)
  const outsider = await guestSession(browser)
  try {
    await member.page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
    await expect(member.page.getByRole("heading", { name: "# general" })).toBeVisible()
    const memberId = (await (await member.page.request.get(`${origin}/api/me`)).json()).id
    const id = crypto.randomUUID()
    const created = await owner.page.request.post(`${origin}/api/channels`, {
      headers,
      data: { id, name: `room-${id.slice(0, 8)}` },
    })
    expect(created.status()).toBe(201)
    const initial = await created.json()
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels`, {
          headers,
          data: { id, name: initial.name },
        })
      ).status(),
    ).toBe(201)
    for (const request of [member.page.request, outsider.page.request]) {
      const status = request === member.page.request ? 403 : 401
      expect(
        (
          await request.post(`${origin}/api/channels`, { headers, data: { name: "denied" } })
        ).status(),
      ).toBe(status)
      expect(
        (
          await request.patch(`${origin}/api/channels/${id}`, { headers, data: { name: "denied" } })
        ).status(),
      ).toBe(status)
      for (const archived of [true, false])
        expect(
          (
            await request.patch(`${origin}/api/channels/${id}/archive`, {
              headers,
              data: { archived },
            })
          ).status(),
        ).toBe(status)
    }
    const messageId = crypto.randomUUID()
    const duplicates = await Promise.all(
      Array.from({ length: 8 }, () => send(member.page.request, id, "one message", messageId)),
    )
    expect(duplicates.every((response) => response.status() === 201)).toBe(true)
    const stored = await duplicates[0].json()
    for (const response of duplicates) expect(await response.json()).toEqual(stored)
    expect((await send(member.page.request, id, "conflicting text", messageId)).status()).toBe(409)
    expect((await send(owner.page.request, id, "one message", messageId)).status()).toBe(409)
    expect(
      (
        await owner.page.request.patch(`${origin}/api/members/${memberId}`, {
          headers,
          data: { role: "admin" },
        })
      ).status(),
    ).toBe(200)
    const renamed = `renamed-${id.slice(0, 8)}`
    expect(
      (
        await member.page.request.patch(`${origin}/api/channels/${id}`, {
          headers,
          data: { name: renamed },
        })
      ).status(),
    ).toBe(200)
    const race = await Promise.all([
      send(member.page.request, id, "archive race"),
      member.page.request.patch(`${origin}/api/channels/${id}/archive`, {
        headers,
        data: { archived: true },
      }),
    ])
    expect([201, 409]).toContain(race[0].status())
    expect(race[1].status()).toBe(200)
    expect((await send(member.page.request, id, "after archive")).status()).toBe(409)
    expect(await (await send(member.page.request, id, "one message", messageId)).json()).toEqual(
      stored,
    )
    const archivedHistory = await (
      await member.page.request.get(`${origin}/api/channels/${id}/messages`)
    ).json()
    expect(
      archivedHistory.filter((message: { id: string }) => message.id === messageId),
    ).toHaveLength(1)
    expect(archivedHistory.length).toBe(race[0].status() === 201 ? 2 : 1)
    expect(
      (
        await member.page.request.patch(`${origin}/api/channels/${id}/archive`, {
          headers,
          data: { archived: false },
        })
      ).status(),
    ).toBe(200)
    expect((await send(member.page.request, id, "restored")).status()).toBe(201)
    const channel = (await (await owner.page.request.get(`${origin}/api/channels`)).json()).find(
      (channel: { id: string }) => channel.id === id,
    )
    expect(channel).toEqual({ id, name: renamed, archived: false })
    expect(
      (
        await owner.page.request.patch(`${origin}/api/channels/${id}`, {
          headers,
          data: { name: "general" },
        })
      ).status(),
    ).toBe(409)
    await owner.page.getByRole("button", { name: "アカウント設定", exact: true }).click()
    await owner.page.getByLabel("CLI / MCP トークン · 30日間").fill("Synthetic expiry")
    await owner.page.getByRole("button", { name: "発行", exact: true }).click()
    const token = { token: await owner.page.getByLabel("一度だけ表示されます").inputValue() }
    expect(token.token).toHaveLength(64)
    await owner.page.getByRole("button", { name: "Close", exact: true }).click()
    const tokenHeaders = { Authorization: `Bearer ${token.token}` }
    expect(
      (
        await owner.page.request.get(`${origin}/api/channels/${id}/messages`, {
          headers: tokenHeaders,
        })
      ).status(),
    ).toBe(200)
    const hash = createHash("sha256").update(token.token).digest("hex")
    execFileSync(
      process.execPath,
      [
        packageBin("apps/app", "void"),
        "db",
        "execute",
        `UPDATE chat_sessions SET expires_at = 0 WHERE hash = '${hash}'`,
      ],
      { cwd: resolve("apps/app"), stdio: "pipe" },
    )
    expect(
      (
        await owner.page.request.get(`${origin}/api/channels/${id}/messages`, {
          headers: tokenHeaders,
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await owner.page.request.get(`${origin}/api/channels/${id}/socket`, {
          headers: tokenHeaders,
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels/${id}/messages`, {
          headers: tokenHeaders,
          data: { id: crypto.randomUUID(), text: "expired" },
        })
      ).status(),
    ).toBe(401)

    const socketEvent = member.page.waitForEvent("websocket", (socket) =>
      socket.url().includes(`/channels/${id}/socket`),
    )
    const closed = member.page.evaluate(
      (path) =>
        new Promise<{ code: number; events: string[] }>((resolve) => {
          const socket = new WebSocket(path)
          const events: string[] = []
          socket.onopen = () => socket.send("ping")
          socket.onmessage = (event) => events.push(event.data)
          socket.onclose = (event) => resolve({ code: event.code, events })
        }),
      `${origin.replace("http", "ws")}/api/channels/${id}/socket`,
    )
    const socket = await socketEvent
    await socket.waitForEvent("framereceived")
    expect(
      (await owner.page.request.delete(`${origin}/api/members/${memberId}`, { headers })).status(),
    ).toBe(200)
    expect((await send(owner.page.request, id, "after disable")).status()).toBe(201)
    expect(await closed).toEqual({ code: 1008, events: ["pong"] })
    for (const path of [`/api/channels/${id}/messages`, `/api/channels/${id}/socket`])
      expect([401, 403]).toContain(
        (await member.page.request.get(`${origin}${path}`, { headers })).status(),
      )
    expect([401, 403]).toContain((await send(member.page.request, id, "disabled")).status())
  } finally {
    await member.context.close()
    await outsider.context.close()
    await owner.close()
  }
})

test("exclusive history cursors and reconnect recover more than two pages with live arrivals", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  try {
    const id = crypto.randomUUID()
    const name = `paging-${id.slice(0, 8)}`
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels`, { headers, data: { id, name } })
      ).status(),
    ).toBe(201)
    expect((await send(owner.page.request, id, "before-disconnect")).status()).toBe(201)
    await owner.page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket
      window.WebSocket = class extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols)
          if (!String(url).includes("/api/channels/")) return
          this.addEventListener("open", () => {
            document.documentElement.dataset.chatSocket = "open"
          })
          this.addEventListener("close", () => {
            document.documentElement.dataset.chatSocket = "closed"
          })
          window.addEventListener("chat-test-disconnect", () => this.close(), { once: true })
        }
      }
    })
    let disconnected = false
    await owner.page.routeWebSocket("**/api/channels/**/socket", (socket) => {
      if (disconnected) socket.close({ code: 1013, reason: "Synthetic partition" })
      else socket.connectToServer()
    })
    await owner.page.route("**/api/channels/**/messages*", (route) =>
      disconnected ? route.abort("internetdisconnected") : route.continue(),
    )
    await owner.page.reload()
    await owner.page.getByRole("button", { name: `# ${name}`, exact: true }).click()
    await expect(owner.page.getByText("before-disconnect", { exact: true })).toBeVisible()
    disconnected = true
    await owner.page.evaluate(() => window.dispatchEvent(new Event("chat-test-disconnect")))
    await expect(owner.page.locator("html")).toHaveAttribute("data-chat-socket", "closed")
    const request = await browser.newContext({ storageState: await owner.context.storageState() })
    try {
      for (let batch = 0; batch < 23; batch++) {
        const responses = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            send(request.request, id, `gap-${batch * 10 + index}`),
          ),
        )
        expect(responses.every((response) => response.status() === 201)).toBe(true)
      }
      const latest = await (
        await request.request.get(`${origin}/api/channels/${id}/messages`)
      ).json()
      expect(latest).toHaveLength(100)
      const upper = latest.at(-1).sequence
      const older = await (
        await request.request.get(
          `${origin}/api/channels/${id}/messages?before=${latest[0].sequence}`,
        )
      ).json()
      expect(older).toHaveLength(100)
      expect(older.at(-1).sequence).toBeLessThan(latest[0].sequence)
      const recovered: { id: string; sequence: number; text: string }[] = []
      let after = 0
      do {
        const page = await (
          await request.request.get(
            `${origin}/api/channels/${id}/messages?after=${after}&until=${upper}`,
          )
        ).json()
        recovered.push(...page)
        after = page.at(-1)?.sequence ?? upper
      } while (after < upper)
      expect(recovered).toHaveLength(231)
      expect(new Set(recovered.map((message) => message.id)).size).toBe(231)
      expect(recovered.map((message) => message.sequence)).toEqual(
        Array.from({ length: 231 }, (_, index) => index + 1),
      )
      expect(
        (
          await request.request.get(`${origin}/api/channels/${id}/messages?after=0&before=10`)
        ).status(),
      ).toBe(400)
      let recoveryStarted = false
      const recoveryCursors: { after: number; until: number }[] = []
      let releaseRecovery: () => void = () => undefined
      const recoveryGate = new Promise<void>((resolve) => {
        releaseRecovery = resolve
      })
      await owner.page.route(`**/api/channels/${id}/messages?after=**`, async (route) => {
        if (disconnected) return route.abort("internetdisconnected")
        const query = new URL(route.request().url()).searchParams
        recoveryCursors.push({
          after: Number(query.get("after")),
          until: Number(query.get("until")),
        })
        const response = await route.fetch()
        if (!recoveryStarted) {
          recoveryStarted = true
          await recoveryGate
        }
        await route.fulfill({ response })
      })
      disconnected = false
      await owner.page.evaluate(() => window.dispatchEvent(new Event("online")))
      await expect(owner.page.locator("html")).toHaveAttribute("data-chat-socket", "open")
      await expect.poll(() => recoveryStarted).toBe(true)
      expect((await send(request.request, id, "arrived-during-recovery")).status()).toBe(201)
      releaseRecovery()
      await expect(owner.page.getByText("arrived-during-recovery", { exact: true })).toBeVisible()
      await expect(owner.page.getByRole("log").locator('[data-slot="message"]')).toHaveCount(232)
      expect(recoveryCursors).toEqual(
        expect.arrayContaining([
          { after: 1, until: 231 },
          { after: 101, until: 231 },
          { after: 201, until: 231 },
          { after: 231, until: 232 },
        ]),
      )
      expect(
        await owner.page.getByRole("log").locator('[data-slot="bubble-content"]').allTextContents(),
      ).toEqual([...recovered.map((message) => message.text), "arrived-during-recovery"])
      await expect(owner.page.getByText("gap-0", { exact: true })).toHaveCount(1)
      await expect(owner.page.getByText("gap-229", { exact: true })).toHaveCount(1)
      expect(
        await (
          await request.request.get(
            `${origin}/api/channels/${id}/messages?after=${upper}&until=${upper}`,
          )
        ).json(),
      ).toEqual([])
    } finally {
      await request.close()
    }
  } finally {
    await owner.close()
  }
})

test("uncertain rename and archive responses retain inputs and allow recovery without losing drafts", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  try {
    const id = crypto.randomUUID()
    const name = `ui-${id.slice(0, 8)}`
    await owner.page.request.post(`${origin}/api/channels`, { headers, data: { id, name } })
    await owner.page.reload()
    await owner.page.getByRole("button", { name: `# ${name}`, exact: true }).click()
    await owner.page.getByRole("textbox", { name: `#${name} にメッセージ` }).fill("retained draft")
    await owner.page.getByRole("button", { name: "チャンネル設定" }).click()
    const renamed = `changed-${id.slice(0, 8)}`
    await owner.page.getByLabel("チャンネル名", { exact: true }).fill(renamed)
    let renameAttempts = 0
    await owner.page.route(`**/api/channels/${id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue()
      if (++renameAttempts === 1) {
        await route.fetch()
        return route.abort("failed")
      }
      return route.continue()
    })
    await owner.page.getByRole("button", { name: "保存", exact: true }).click()
    await expect(owner.page.getByRole("alert")).toBeVisible()
    await expect(owner.page.getByLabel("チャンネル名", { exact: true })).toHaveValue(renamed)
    await owner.page.getByRole("button", { name: "保存", exact: true }).click()
    await expect(owner.page.getByRole("alert")).toHaveCount(0)
    let archiveAttempts = 0
    await owner.page.route(`**/api/channels/${id}/archive`, async (route) => {
      if (++archiveAttempts === 1) {
        await route.fetch()
        return route.abort("failed")
      }
      return route.continue()
    })
    await owner.page.getByRole("button", { name: "アーカイブ", exact: true }).click()
    await owner.page.getByRole("button", { name: "アーカイブする", exact: true }).click()
    await expect(owner.page.getByRole("alertdialog")).toContainText("Failed")
    await owner.page.getByRole("button", { name: "アーカイブする", exact: true }).click()
    await expect(owner.page.getByRole("alertdialog")).toHaveCount(0)
    await owner.page.getByRole("button", { name: "チャンネルを復帰", exact: true }).click()
    await expect(owner.page.getByRole("button", { name: "アーカイブ", exact: true })).toBeVisible()
    await owner.page.keyboard.press("Escape")
    await expect(owner.page.getByRole("textbox", { name: `#${renamed} にメッセージ` })).toHaveValue(
      "retained draft",
    )
    await owner.page.screenshot({ path: ".local/channel-desktop.png", animations: "disabled" })
    await owner.page.setViewportSize({ width: 390, height: 844 })
    expect(
      await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await owner.page.screenshot({ path: ".local/channel-mobile.png", animations: "disabled" })
    const attempts: string[] = []
    await owner.page.route(`**/api/channels/${id}/messages`, async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      attempts.push(route.request().postDataJSON().id)
      if (attempts.length === 1) {
        await route.fetch()
        return route.abort("failed")
      }
      return route.continue()
    })
    await owner.page.getByRole("button", { name: "送信", exact: true }).click()
    await expect(owner.page.getByRole("alert")).toBeVisible()
    await expect(owner.page.getByRole("textbox", { name: `#${renamed} にメッセージ` })).toHaveValue(
      "retained draft",
    )
    await owner.page.getByRole("button", { name: "送信", exact: true }).click()
    await expect(owner.page.getByRole("textbox", { name: `#${renamed} にメッセージ` })).toHaveValue(
      "",
    )
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toBe(attempts[1])
    await expect(owner.page.getByText("retained draft", { exact: true })).toBeVisible()
    expect(
      await (await owner.page.request.get(`${origin}/api/channels/${id}/messages`)).json(),
    ).toHaveLength(1)
  } finally {
    await owner.close()
  }
})
