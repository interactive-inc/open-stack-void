import { test, expect } from "@playwright/test"
import type { APIRequestContext } from "@playwright/test"
import { ownerSession, guestSession, issueInvitation, origin, headers } from "./invitation-fixture"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { packageBin } from "../scripts/package-bin.mjs"
import { withRoomFixture } from "./room-fixture"
import { request as httpRequest } from "node:http"

async function room(request: APIRequestContext, prefix: string) {
  const id = crypto.randomUUID()
  const name = `${prefix}-${id.slice(0, 8)}`
  expect(
    (await request.post(`${origin}/api/channels`, { headers, data: { id, name } })).status(),
  ).toBe(201)
  return { id, name }
}
async function upload(
  request: APIRequestContext,
  channel: string,
  text: string | Buffer,
  id = crypto.randomUUID(),
  name = "note.txt",
  mimeType = "text/plain",
  extraHeaders: Record<string, string> = {},
) {
  return request.post(`${origin}/api/channels/${channel}/attachments`, {
    headers: { ...headers, ...extraHeaders },
    multipart: {
      id,
      file: { name, mimeType, buffer: Buffer.isBuffer(text) ? text : Buffer.from(text) },
    },
  })
}
async function search(
  request: APIRequestContext,
  channel: string,
  q: string,
  cursor: { before?: number; until?: number } = {},
  extraHeaders: Record<string, string> = {},
) {
  return request.post(`${origin}/api/channels/${channel}/search`, {
    headers: { ...headers, ...extraHeaders },
    data: { q, ...cursor },
  })
}

test("literal search is bounded, paginated, snapshot-stable and rendered as inert text", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  try {
    const channel = await room(owner.page.request, "search")
    const malicious = `<img src=x onerror="document.title='INJECTED'"> needle %_日本語`
    const messages: { id: string; sequence: number }[] = []
    for (let batch = 0; batch < 13; batch++) {
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          owner.page.request.post(`${origin}/api/channels/${channel.id}/messages`, {
            headers,
            data: {
              id: crypto.randomUUID(),
              text: batch === 0 && index === 0 ? malicious : `needle-${batch * 10 + index}`,
            },
          }),
        ),
      )
      expect(responses.every((response) => response.status() === 201)).toBe(true)
      for (const response of responses) messages.push(await response.json())
    }
    const first = await (await search(owner.page.request, channel.id, "needle")).json()
    expect(first.results).toHaveLength(50)
    expect(first.until).toBe(130)
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels/${channel.id}/messages`, {
          headers,
          data: { id: crypto.randomUUID(), text: "needle-live" },
        })
      ).status(),
    ).toBe(201)
    const found: { id: string; sequence: number; snippet: string }[] = [...first.results]
    let cursor = first.nextBefore
    while (cursor !== null) {
      const page = await (
        await search(owner.page.request, channel.id, "needle", {
          before: cursor,
          until: first.until,
        })
      ).json()
      expect(page.until).toBe(130)
      expect(page.results.length).toBeLessThanOrEqual(50)
      found.push(...page.results)
      cursor = page.nextBefore
    }
    expect(found).toHaveLength(130)
    expect(new Set(found.map((result) => result.id)).size).toBe(130)
    expect(found.map((result) => result.sequence)).toEqual(
      Array.from({ length: 130 }, (_, index) => 130 - index),
    )
    expect(found.every((result) => result.snippet.length <= 242)).toBe(true)
    expect(
      (await (await search(owner.page.request, channel.id, "%_日本語")).json()).results,
    ).toHaveLength(1)
    expect(
      (await (await search(owner.page.request, channel.id, "%' OR 1=1 --")).json()).results,
    ).toEqual([])
    for (const data of [
      { q: " " },
      { q: "x".repeat(101) },
      { q: "needle", workspace: "foreign" },
      { q: "needle", before: 0 },
    ])
      expect(
        (
          await owner.page.request.post(`${origin}/api/channels/${channel.id}/search`, {
            headers,
            data,
          })
        ).status(),
      ).toBe(400)
    await owner.page.reload()
    await owner.page.getByRole("button", { name: `# ${channel.name}`, exact: true }).click()
    await owner.page.getByRole("button", { name: "メッセージ検索", exact: true }).click()
    const dialog = owner.page.getByRole("dialog")
    await dialog.getByLabel("メッセージを検索", { exact: true }).fill("%_日本語")
    const request = owner.page.waitForRequest((request) => request.url().endsWith("/search"))
    await dialog.getByRole("button", { name: "検索", exact: true }).click()
    expect(new URL((await request).url()).search).toBe("")
    await dialog.locator('[aria-label="検索結果"]').getByRole("button").click()
    await expect(dialog.getByText(malicious, { exact: true })).toBeVisible()
    await expect(owner.page).toHaveTitle("Void Chat")
    expect(await dialog.locator("img").count()).toBe(0)
  } finally {
    await owner.close()
  }
})

test("attachments bind bytes to a room, enforce type and size, and retain history through archive", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const invitation = await issueInvitation(owner)
  const member = await guestSession(browser, invitation.token)
  try {
    await member.page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
    await expect(member.page.getByRole("heading", { name: "# general" })).toBeVisible()
    const actor = await (await member.page.request.get(`${origin}/api/me`)).json()
    const first = await room(owner.page.request, "files")
    const second = await room(owner.page.request, "other")
    const id = crypto.randomUUID()
    const body = "<script>document.title='INJECTED'</script>\n日本語"
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => upload(member.page.request, first.id, body, id, "page.html")),
    )
    expect(responses.every((response) => response.status() === 201)).toBe(true)
    const attachment = await responses[0].json()
    expect(attachment).toMatchObject({
      id,
      channelId: first.id,
      name: "page.txt",
      memberId: actor.id,
      size: Buffer.byteLength(body),
    })
    for (const response of responses) expect(await response.json()).toEqual(attachment)
    expect(Object.keys(attachment).sort()).toEqual(
      [
        "channelId",
        "createdAt",
        "id",
        "mediaType",
        "memberId",
        "messageId",
        "name",
        "sequence",
        "size",
      ].sort(),
    )
    expect(
      (await upload(member.page.request, first.id, "different", id, "page.html")).status(),
    ).toBe(409)
    expect((await upload(owner.page.request, first.id, body, id, "page.html")).status()).toBe(409)
    const download = await owner.page.request.get(
      `${origin}/api/channels/${first.id}/attachments/${id}`,
    )
    expect(download.status()).toBe(200)
    expect(download.headers()["content-type"]).toBe("application/octet-stream")
    expect(download.headers()["content-disposition"]).toContain("attachment;")
    expect(download.headers()["content-disposition"]).toContain("page.txt")
    expect(download.headers()["content-security-policy"]).toContain("sandbox")
    expect(download.headers()["x-content-type-options"]).toBe("nosniff")
    expect(download.headers()["cache-control"]).toBe("no-store")
    expect(download.headers()["cross-origin-resource-policy"]).toBe("same-origin")
    expect((await download.body()).toString()).toBe(body)
    expect(
      (
        await owner.page.request.get(`${origin}/api/channels/${second.id}/attachments/${id}`)
      ).status(),
    ).toBe(404)
    expect(
      (
        await owner.page.request.get(
          `${origin}/api/channels/${second.id}/messages/${attachment.messageId}`,
        )
      ).status(),
    ).toBe(404)
    expect((await upload(member.page.request, second.id, "separate bytes", id)).status()).toBe(201)
    expect(
      (
        await (
          await owner.page.request.get(`${origin}/api/channels/${second.id}/attachments/${id}`)
        ).body()
      ).toString(),
    ).toBe("separate bytes")
    expect(
      (
        await (
          await owner.page.request.get(`${origin}/api/channels/${first.id}/attachments/${id}`)
        ).body()
      ).toString(),
    ).toBe(body)
    expect(
      (
        await owner.page.request.get(
          `${origin}/api/channels/${first.id}/attachments/${id}?workspace=foreign`,
        )
      ).status(),
    ).toBe(400)
    expect(
      (
        await owner.page.request.get(
          `${origin}/api/channels/${first.id}/attachments?workspace=foreign`,
        )
      ).status(),
    ).toBe(400)
    expect((await upload(member.page.request, first.id, body, "../escape")).status()).toBe(400)
    for (const [buffer, name, type] of [
      [Buffer.from(body), "evil.html", "text/html"],
      [Buffer.from("<svg></svg>"), "evil.svg", "image/svg+xml"],
      [Buffer.from(body), "fake.png", "image/png"],
      [Buffer.from([0xff, 0xfe]), "invalid.txt", "text/plain"],
      [Buffer.from([0]), "null.txt", "text/plain"],
      [Buffer.alloc(0), "empty.txt", "text/plain"],
    ] as const)
      expect(
        (
          await upload(member.page.request, first.id, buffer, crypto.randomUUID(), name, type)
        ).status(),
      ).toBe(400)
    expect(
      (await upload(member.page.request, first.id, Buffer.alloc(512 * 1024 + 1, 120))).status(),
    ).toBe(413)
    expect(
      (await upload(member.page.request, first.id, Buffer.alloc(600 * 1024, 120))).status(),
    ).toBe(413)
    expect(
      (await upload(member.page.request, first.id, Buffer.alloc(2 * 1024 * 1024, 120))).status(),
    ).toBe(413)
    const chunked = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: "127.0.0.1",
          port: 5183,
          path: `/api/channels/${first.id}/attachments`,
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/octet-stream",
            "Transfer-Encoding": "chunked",
          },
        },
        (response) => {
          response.resume()
          response.on("end", () => resolve(response.statusCode ?? 0))
        },
      )
      request.on("error", reject)
      request.setTimeout(10_000, () => request.destroy(new Error("Synthetic upload timeout")))
      for (let index = 0; index < 10; index++) request.write(Buffer.alloc(64 * 1024, 120))
      request.end()
    })
    expect(chunked).toBe(413)
    expect(
      (
        await (
          await owner.page.request.get(`${origin}/api/channels/${first.id}/attachments`)
        ).json()
      ).items,
    ).toHaveLength(1)
    expect(
      await (await owner.page.request.get(`${origin}/api/channels/${first.id}/messages`)).json(),
    ).toHaveLength(1)
    expect(
      (
        await upload(
          owner.page.request,
          first.id,
          Buffer.alloc(512 * 1024, 120),
          crypto.randomUUID(),
          "limit.txt",
        )
      ).status(),
    ).toBe(201)
    expect(
      (
        await owner.page.request.patch(`${origin}/api/members/${actor.id}`, {
          headers,
          data: { role: "admin" },
        })
      ).status(),
    ).toBe(200)
    expect((await upload(member.page.request, first.id, "admin file")).status()).toBe(201)
    expect(
      (
        await owner.page.request.patch(`${origin}/api/channels/${first.id}/archive`, {
          headers,
          data: { archived: true },
        })
      ).status(),
    ).toBe(200)
    expect((await upload(member.page.request, first.id, body, id, "page.html")).status()).toBe(201)
    expect((await upload(member.page.request, first.id, "archived new")).status()).toBe(409)
    expect((await search(member.page.request, first.id, "page")).status()).toBe(200)
    expect(
      (
        await member.page.request.get(`${origin}/api/channels/${first.id}/attachments/${id}`)
      ).status(),
    ).toBe(200)
    expect(
      (
        await owner.page.request.patch(`${origin}/api/channels/${first.id}/archive`, {
          headers,
          data: { archived: false },
        })
      ).status(),
    ).toBe(200)
    const race = await Promise.all([
      upload(member.page.request, first.id, "race file"),
      owner.page.request.patch(`${origin}/api/channels/${first.id}/archive`, {
        headers,
        data: { archived: true },
      }),
    ])
    expect([201, 409]).toContain(race[0].status())
    expect(race[1].status()).toBe(200)
    expect((await upload(member.page.request, first.id, "after archive")).status()).toBe(409)
    expect(
      (
        await (
          await owner.page.request.get(`${origin}/api/channels/${first.id}/attachments`)
        ).json()
      ).items,
    ).toHaveLength(race[0].status() === 201 ? 4 : 3)
  } finally {
    await member.context.close()
    await owner.close()
  }
})

test("expired, disabled and outsider actors cannot search, enumerate or retrieve cached attachment identities", async ({
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
    const channel = await room(owner.page.request, "access")
    const attachment = await (
      await upload(owner.page.request, channel.id, "restricted sample")
    ).json()
    expect(
      (
        await member.page.request.get(
          `${origin}/api/channels/${channel.id}/attachments/${attachment.id}`,
        )
      ).status(),
    ).toBe(200)
    const event = member.page.waitForEvent("websocket", (socket) =>
      socket.url().includes(`/channels/${channel.id}/socket`),
    )
    const closed = member.page.evaluate(
      (path) =>
        new Promise<{ code: number; events: string[] }>((resolve) => {
          const socket = new WebSocket(path),
            events: string[] = []
          socket.onopen = () => socket.send("ping")
          socket.onmessage = (event) => events.push(event.data)
          socket.onclose = (event) => resolve({ code: event.code, events })
        }),
      `${origin.replace("http", "ws")}/api/channels/${channel.id}/socket`,
    )
    const socket = await event
    await socket.waitForEvent("framereceived")
    expect(
      (await owner.page.request.delete(`${origin}/api/members/${actor.id}`, { headers })).status(),
    ).toBe(200)
    expect((await upload(owner.page.request, channel.id, "after revocation")).status()).toBe(201)
    expect(await closed).toEqual({ code: 1008, events: ["pong"] })
    await owner.page.getByRole("button", { name: "アカウント設定", exact: true }).click()
    await owner.page.getByLabel("CLI / MCP トークン · 30日間").fill("Content expiry")
    await owner.page.getByRole("button", { name: "発行", exact: true }).click()
    const token = await owner.page.getByLabel("一度だけ表示されます").inputValue()
    expect(token).toHaveLength(64)
    await owner.page.getByRole("button", { name: "Close", exact: true }).click()
    const hash = createHash("sha256").update(token).digest("hex")
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
    for (const [request, extraHeaders] of [
      [member.page.request, {}],
      [outsider.page.request, {}],
      [owner.page.request, { Authorization: `Bearer ${token}` }],
      [owner.page.request, { Authorization: `Bearer ${"f".repeat(64)}` }],
    ] as const) {
      expect((await search(request, channel.id, "restricted", {}, extraHeaders)).status()).toBe(401)
      for (const path of [
        "attachments",
        `attachments/${attachment.id}`,
        `messages/${attachment.messageId}`,
      ]) {
        const response = await request.get(`${origin}/api/channels/${channel.id}/${path}`, {
          headers: extraHeaders,
        })
        expect(response.status()).toBe(401)
        expect(await response.text()).not.toContain("restricted sample")
      }
      expect(
        (
          await upload(
            request,
            channel.id,
            "denied",
            crypto.randomUUID(),
            "denied.txt",
            "text/plain",
            extraHeaders,
          )
        ).status(),
      ).toBe(401)
    }
    expect(
      (
        await (
          await owner.page.request.get(`${origin}/api/channels/${channel.id}/attachments`)
        ).json()
      ).items,
    ).toHaveLength(2)
  } finally {
    await member.context.close()
    await outsider.context.close()
    await owner.close()
  }
})

test("attachment paging and interrupted uploads preserve file selection and message drafts", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  try {
    const channel = await room(owner.page.request, "upload-ui")
    for (let batch = 0; batch < 11; batch++) {
      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          upload(
            owner.page.request,
            channel.id,
            `file ${batch * 5 + index}`,
            crypto.randomUUID(),
            `file-${batch * 5 + index}.txt`,
          ),
        ),
      )
      expect(responses.every((response) => response.status() === 201)).toBe(true)
    }
    const first = await (
      await owner.page.request.get(`${origin}/api/channels/${channel.id}/attachments`)
    ).json()
    expect(first.items).toHaveLength(50)
    const second = await (
      await owner.page.request.get(
        `${origin}/api/channels/${channel.id}/attachments?before=${first.nextBefore}`,
      )
    ).json()
    expect(second.items).toHaveLength(5)
    expect(second.nextBefore).toBe(null)
    expect(new Set([...first.items, ...second.items].map((file) => file.id)).size).toBe(55)
    await owner.page.reload()
    await owner.page.getByRole("button", { name: `# ${channel.name}`, exact: true }).click()
    await owner.page
      .getByRole("textbox", { name: `#${channel.name} にメッセージ` })
      .fill("keep draft")
    const attempts: string[] = []
    await owner.page.route(`**/api/channels/${channel.id}/attachments`, async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      const body = route.request().postDataBuffer()?.toString() ?? ""
      attempts.push(body.match(/name="id"\r\n\r\n([^\r]+)/)?.[1] ?? "")
      if (attempts.length === 1) {
        const response = await route.fetch()
        expect(response.status()).toBe(201)
        return route.abort("failed")
      }
      return route.continue()
    })
    await owner.page.getByLabel("添付ファイル", { exact: true }).setInputFiles({
      name: "retry.html",
      mimeType: "text/plain",
      buffer: Buffer.from("<script>document.title='INJECTED'</script>"),
    })
    await owner.page.getByRole("button", { name: "添付", exact: true }).click()
    await expect(owner.page.getByRole("alert")).toBeVisible()
    await expect(
      owner.page.getByRole("textbox", { name: `#${channel.name} にメッセージ` }),
    ).toHaveValue("keep draft")
    expect(
      await owner.page
        .getByLabel("添付ファイル", { exact: true })
        .evaluate((input: HTMLInputElement) => input.files?.length),
    ).toBe(1)
    await owner.page.getByRole("button", { name: "添付", exact: true }).click()
    await expect(
      owner.page.getByRole("button", { name: "retry.txt をダウンロード", exact: true }),
    ).toBeVisible()
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toMatch(/^[a-f0-9-]{36}$/)
    expect(attempts[0]).toBe(attempts[1])
    const downloaded = owner.page.waitForEvent("download")
    await owner.page.getByRole("button", { name: "retry.txt をダウンロード", exact: true }).click()
    const file = await downloaded
    const path = await file.path()
    expect(path).not.toBe(null)
    expect((await readFile(path!)).toString()).toBe("<script>document.title='INJECTED'</script>")
    expect(file.suggestedFilename()).toBe("retry.txt")
    await expect(owner.page).toHaveTitle("Void Chat")
    await owner.page.getByLabel("添付ファイル", { exact: true }).setInputFiles({
      name: "retained.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("retained"),
    })
    await owner.page.request.patch(`${origin}/api/channels/${channel.id}/archive`, {
      headers,
      data: { archived: true },
    })
    await expect(owner.page.getByRole("button", { name: "添付", exact: true })).toBeDisabled()
    expect(
      await owner.page
        .getByLabel("添付ファイル", { exact: true })
        .evaluate((input: HTMLInputElement) => input.files?.length),
    ).toBe(1)
    await owner.page.request.patch(`${origin}/api/channels/${channel.id}/archive`, {
      headers,
      data: { archived: false },
    })
    await expect(owner.page.getByRole("button", { name: "添付", exact: true })).toBeEnabled()
    await expect(
      owner.page.getByRole("textbox", { name: `#${channel.name} にメッセージ` }),
    ).toHaveValue("keep draft")
    await owner.page.screenshot({ path: ".local/content-desktop.png", animations: "disabled" })
    await owner.page.setViewportSize({ width: 390, height: 844 })
    expect(
      await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await owner.page.screenshot({ path: ".local/content-mobile.png", animations: "disabled" })
  } finally {
    await owner.close()
  }
})

test("search communicates its 5000-message window and can continue safely into older history", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  try {
    const channel = await room(owner.page.request, "window")
    const actor = await (await owner.page.request.get(`${origin}/api/me`)).json()
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels/${channel.id}/messages`, {
          headers,
          data: { id: crypto.randomUUID(), text: "deep-match" },
        })
      ).status(),
    ).toBe(201)
    withRoomFixture(channel.id, (database) => {
      database.exec("BEGIN")
      try {
        const insert = database.prepare(
          "INSERT INTO messages (id,channelId,memberId,memberName,text,createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        )
        for (let index = 0; index < 5000; index++)
          insert.run(
            crypto.randomUUID(),
            channel.id,
            actor.id,
            "Synthetic fixture",
            `filler-${index}`,
            0,
          )
        database.exec("COMMIT")
      } catch (error) {
        database.exec("ROLLBACK")
        throw error
      }
    })
    const first = await (await search(owner.page.request, channel.id, "deep-match")).json()
    expect(first).toMatchObject({
      results: [],
      complete: false,
      windowSize: 5000,
      nextBefore: 2,
      until: 5001,
    })
    const second = await (
      await search(owner.page.request, channel.id, "deep-match", {
        before: first.nextBefore,
        until: first.until,
      })
    ).json()
    expect(second).toMatchObject({
      complete: true,
      windowSize: 1,
      nextBefore: null,
      results: [{ snippet: "deep-match" }],
    })
    await owner.page.reload()
    await owner.page.getByRole("button", { name: `# ${channel.name}`, exact: true }).click()
    await owner.page.getByRole("button", { name: "メッセージ検索", exact: true }).click()
    const dialog = owner.page.getByRole("dialog")
    await dialog.getByLabel("メッセージを検索", { exact: true }).fill("deep-match")
    await dialog.getByRole("button", { name: "検索", exact: true }).click()
    await expect(dialog.getByRole("status")).toHaveText("続きがあります")
    await expect(dialog.getByText("この範囲にはありません", { exact: true })).toBeVisible()
    await expect(dialog.getByText("見つかりませんでした", { exact: true })).toHaveCount(0)
    await dialog.getByRole("button", { name: "さらに検索", exact: true }).click()
    await expect(dialog.getByRole("status")).toHaveText("検索完了")
    await expect(dialog.locator('[aria-label="検索結果"]').getByRole("button")).toHaveCount(1)
  } finally {
    await owner.close()
  }
})

test("room file and byte budgets serialize concurrent uploads and failed transactions leave no orphan", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  try {
    const countRoom = await room(owner.page.request, "count-limit")
    for (let batch = 0; batch < 19; batch++) {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => upload(owner.page.request, countRoom.id, "x")),
      )
      expect(responses.every((response) => response.status() === 201)).toBe(true)
    }
    for (let index = 0; index < 9; index++)
      expect((await upload(owner.page.request, countRoom.id, "x")).status()).toBe(201)
    const race = await Promise.all(
      Array.from({ length: 5 }, () => upload(owner.page.request, countRoom.id, "x")),
    )
    expect(race.filter((response) => response.status() === 201)).toHaveLength(1)
    expect(race.filter((response) => response.status() === 409)).toHaveLength(4)
    const countPage = await (
      await owner.page.request.get(`${origin}/api/channels/${countRoom.id}/attachments`)
    ).json()
    expect(countPage.usage).toEqual({
      files: 200,
      bytes: 200,
      maxFiles: 200,
      maxBytes: 16 * 1024 * 1024,
    })
    const stored = await race.find((response) => response.status() === 201)!.json()
    expect((await upload(owner.page.request, countRoom.id, "x", stored.id)).status()).toBe(201)
    const bytesRoom = await room(owner.page.request, "byte-limit")
    for (let batch = 0; batch < 6; batch++) {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          upload(owner.page.request, bytesRoom.id, Buffer.alloc(512 * 1024, 120)),
        ),
      )
      expect(responses.every((response) => response.status() === 201)).toBe(true)
    }
    expect(
      (await upload(owner.page.request, bytesRoom.id, Buffer.alloc(512 * 1024, 120))).status(),
    ).toBe(201)
    const byteRace = await Promise.all(
      Array.from({ length: 3 }, () =>
        upload(owner.page.request, bytesRoom.id, Buffer.alloc(512 * 1024, 120)),
      ),
    )
    expect(byteRace.filter((response) => response.status() === 201)).toHaveLength(1)
    expect(byteRace.filter((response) => response.status() === 409)).toHaveLength(2)
    expect(
      (
        await (
          await owner.page.request.get(`${origin}/api/channels/${bytesRoom.id}/attachments`)
        ).json()
      ).usage,
    ).toMatchObject({ files: 32, bytes: 16 * 1024 * 1024 })
    const failedRoom = await room(owner.page.request, "atomic")
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels/${failedRoom.id}/messages`, {
          headers,
          data: { id: crypto.randomUUID(), text: "legacy marker" },
        })
      ).status(),
    ).toBe(201)
    withRoomFixture(failedRoom.id, (database) =>
      database.exec(
        "CREATE TRIGGER fixture_attachment_failure BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic attachment failure'); END",
      ),
    )
    const retryId = crypto.randomUUID()
    try {
      const failed = await upload(owner.page.request, failedRoom.id, "fixture-only-secret", retryId)
      expect(failed.status()).toBe(500)
      expect(await failed.text()).not.toContain("fixture-only-secret")
      expect(
        await (
          await owner.page.request.get(`${origin}/api/channels/${failedRoom.id}/attachments`)
        ).json(),
      ).toMatchObject({ items: [], usage: { files: 0, bytes: 0 } })
      expect(
        await (
          await owner.page.request.get(`${origin}/api/channels/${failedRoom.id}/messages`)
        ).json(),
      ).toMatchObject([{ text: "legacy marker" }])
    } finally {
      withRoomFixture(failedRoom.id, (database) =>
        database.exec("DROP TRIGGER fixture_attachment_failure"),
      )
    }
    expect(
      (await upload(owner.page.request, failedRoom.id, "fixture-only-secret", retryId)).status(),
    ).toBe(201)
    expect(
      (await upload(owner.page.request, failedRoom.id, "fixture-only-secret", retryId)).status(),
    ).toBe(201)
    expect(
      await (
        await owner.page.request.get(`${origin}/api/channels/${failedRoom.id}/attachments`)
      ).json(),
    ).toMatchObject({ usage: { files: 1, bytes: 19 } })
  } finally {
    await owner.close()
  }
})
