import { packageBin } from "../scripts/package-bin.mjs"
import { test, expect } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createCli } from "../apps/cli/src/create-cli"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { execFileSync } from "node:child_process"
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process"
import { resolve } from "node:path"

test("initialization state failures are explicit and recover without a reload", async ({
  page,
}) => {
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ status: 503, json: { error: "Synthetic initialization failure" } }),
  )
  await page.goto("/")
  await expect(page.getByRole("alert")).toContainText("ログイン状態を確認できません")
  await expect(page.getByRole("button", { name: "パスキーでログイン", exact: true })).toBeDisabled()
  await page.unroute("**/api/auth/status")
  await page.getByRole("button", { name: "再試行", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(page.getByLabel("初期化キー", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "パスキーを登録", exact: true })).toBeEnabled()
})

test("passkeys, membership, durable chat, CLI and MCP share authorization", async ({
  page,
  context,
  browser,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const protocol = await context.newCDPSession(page)
  await protocol.send("WebAuthn.enable")
  const authenticator = await protocol.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const credentialFile = ".local/e2e-owner-credentials.json"
  const bootstrapStatus = await (await context.request.get("/api/auth/status")).json()
  const saved =
    !bootstrapStatus.canBootstrap && existsSync(credentialFile)
      ? JSON.parse(readFileSync(credentialFile, "utf8"))
      : []
  for (const credential of saved)
    await protocol.send("WebAuthn.addCredential", {
      authenticatorId: authenticator.authenticatorId,
      credential,
    })
  const bootstrap = "e2e-only-initialization-key"
  await page.goto("/")

  if (saved.length) {
    await page.getByRole("button", { name: "パスキーでログイン" }).click()
  } else {
    await page.getByLabel("名前", { exact: true }).fill("Owner")
    await page.getByLabel("初期化キー", { exact: true }).fill(bootstrap ?? "")
    await page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
  }

  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible({ timeout: 30_000 })
  mkdirSync(".local", { recursive: true })
  writeFileSync(
    credentialFile,
    JSON.stringify(
      (
        await protocol.send("WebAuthn.getCredentials", {
          authenticatorId: authenticator.authenticatorId,
        })
      ).credentials,
    ),
  )

  const suffix = Date.now().toString(36)
  const message = `message-${suffix}`
  await page.getByRole("textbox", { name: "#general にメッセージ" }).fill(message)
  await page.getByRole("button", { name: "送信", exact: true }).click()
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "#general にメッセージ" })).toHaveValue("")
  await page.screenshot({ path: ".local/void-chat-desktop.png" })

  await page.getByRole("button", { name: "アカウント設定", exact: true }).click()
  await page.getByLabel("表示名", { exact: true }).fill("Owner Renamed")
  await page.route("**/api/me", async (route) => {
    if (route.request().method() === "PATCH") await route.abort("failed")
    else await route.continue()
  })
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(page.getByLabel("表示名", { exact: true })).toHaveValue("Owner Renamed")
  await page.unroute("**/api/me")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("保存しました")
  expect(await (await page.request.get("/api/me")).json()).toMatchObject({
    name: "Owner Renamed",
    role: "owner",
  })
  await page.getByLabel("CLI / MCP トークン · 30日間").fill(`test-${suffix}`)
  await page.getByRole("button", { name: "発行", exact: true }).click()
  const token = await page.getByLabel("一度だけ表示されます").inputValue()
  expect(token).toHaveLength(64)
  await page.getByRole("button", { name: "Close", exact: true }).click()

  const authorization = { Authorization: `Bearer ${token}` }
  const identity = await page.request.get("/api/me", { headers: authorization })
  expect(identity.status()).toBe(200)
  const owner = await identity.json()
  const beforeProfile = await identity.json()
  for (const data of [
    { name: " " },
    { name: "x".repeat(81) },
    { name: "Injected", role: "admin" },
    { name: "Injected", id: "other" },
    { name: "Injected", email: "other@example.com" },
  ])
    expect((await page.request.patch("/api/me", { headers: authorization, data })).status()).toBe(
      400,
    )
  expect(await (await page.request.get("/api/me", { headers: authorization })).json()).toEqual(
    beforeProfile,
  )
  const anonymous = await browser.newContext()
  expect(
    (
      await anonymous.request.patch("http://localhost:5183/api/me", {
        headers: { Origin: "http://localhost:5183" },
        data: { name: "Anonymous" },
      })
    ).status(),
  ).toBe(401)
  await anonymous.close()
  expect(
    (await page.request.delete(`/api/members/${owner.id}`, { headers: authorization })).status(),
  ).toBe(403)
  expect(
    (
      await page.request.post("/api/tokens", {
        headers: authorization,
        data: { name: "forbidden" },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await page.request.post("/api/channels", {
        headers: { Origin: "https://invalid.example" },
        data: { name: "invalid" },
      })
    ).status(),
  ).toBe(403)

  await page.getByRole("button", { name: "チャンネルを作成", exact: true }).first().click()
  await page.getByLabel("チャンネル名", { exact: true }).fill(`test-${suffix}`)
  await page.getByRole("button", { name: "作成", exact: true }).click()
  await expect(page.getByRole("heading", { name: `# test-${suffix}`, exact: true })).toBeVisible()
  const channels = await (
    await page.request.get("/api/channels", { headers: authorization })
  ).json()
  const channel = channels.find((entry: { name: string }) => entry.name === `test-${suffix}`)
  const id = crypto.randomUUID()
  const firstSend = await page.request.post(`/api/channels/${channel.id}/messages`, {
    headers: authorization,
    data: { id, text: "from-api" },
  })
  expect(firstSend.status()).toBe(201)
  expect(
    (
      await page.request.post(`/api/channels/${channel.id}/messages`, {
        headers: authorization,
        data: { id, text: "from-api" },
      })
    ).status(),
  ).toBe(201)
  expect(
    (
      await page.request.post(`/api/channels/${channel.id}/messages`, {
        headers: authorization,
        data: { id, text: "different" },
      })
    ).status(),
  ).toBe(409)
  await expect(page.getByText("from-api", { exact: true })).toBeVisible({ timeout: 5000 })

  const printed: unknown[] = []
  await createCli({
    readClipboard: async () => token,
    print: (value) => {
      printed.push(value)
    },
    openBrowser: () => {},
  }).parseAsync(["node", "void-chat", "--server", "http://localhost:5183", "--clipboard", "me"])
  expect(printed[0]).toMatchObject({ id: owner.id })
  await createCli({
    readClipboard: async () => token,
    print: (value) => printed.push(value),
    openBrowser: () => {},
  }).parseAsync([
    "node",
    "void-chat",
    "--server",
    "http://localhost:5183",
    "--clipboard",
    "profile-name",
    "CLI Owner",
  ])
  expect(printed.at(-1)).toMatchObject({
    id: owner.id,
    name: "CLI Owner",
    role: "owner",
    email: owner.email,
  })
  const cliInvitation = crypto.randomUUID()
  for (const retry of [1, 2]) {
    void retry
    await createCli({
      readClipboard: async () => token,
      print: (value) => printed.push(value),
      openBrowser: () => {},
    }).parseAsync([
      "node",
      "void-chat",
      "--server",
      "http://localhost:5183",
      "--clipboard",
      "invitations",
      "create",
      `cli-invite-${suffix}@example.com`,
      "--request-id",
      cliInvitation,
    ])
    expect(printed.at(-1)).toMatchObject({ id: cliInvitation, status: "pending" })
  }
  const mcp = new Client({ name: "local-test", version: "1.0.0" })
  const mcpEnvironment = Object.fromEntries(
    Object.entries({ ...process.env, VOID_CHAT_URL: "http://localhost:5183" }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
  await mcp.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["apps/mcp/dist/server.mjs"],
      env: mcpEnvironment,
    }),
  )
  expect((await mcp.listTools()).tools.map((tool) => tool.name)).toContain("send_message")
  expect((await mcp.callTool({ name: "whoami", arguments: {} })).isError).toBe(true)
  expect(
    (await mcp.callTool({ name: "rename_profile", arguments: { name: "Anonymous" } })).isError,
  ).toBe(true)
  const loginRequest = await mcp.callTool({ name: "begin_login", arguments: {} })
  const requestContent = loginRequest.content
  expect(Array.isArray(requestContent)).toBe(true)
  const requestDetails = JSON.parse(requestContent[0].text)
  expect(JSON.stringify(requestDetails)).not.toContain("verifier")
  expect((await mcp.callTool({ name: "complete_login", arguments: {} })).isError).not.toBe(true)
  await page.goto(requestDetails.authorizationUrl)
  await page.getByLabel("確認コード").fill(requestDetails.confirmationCode)
  await page.getByRole("button", { name: "パスキーで承認", exact: true }).click()
  await expect(page.getByRole("heading", { name: "完了", exact: true })).toBeVisible()
  writeFileSync(
    credentialFile,
    JSON.stringify(
      (
        await protocol.send("WebAuthn.getCredentials", {
          authenticatorId: authenticator.authenticatorId,
        })
      ).credentials,
    ),
  )
  const completedLogin = await mcp.callTool({ name: "complete_login", arguments: {} })
  expect(completedLogin.isError).not.toBe(true)
  expect(JSON.stringify(completedLogin)).not.toContain('"token"')
  expect((await mcp.callTool({ name: "whoami", arguments: {} })).isError).not.toBe(true)
  expect(
    (await mcp.callTool({ name: "rename_profile", arguments: { name: "MCP Owner" } })).isError,
  ).not.toBe(true)
  expect(
    await (await page.request.get("/api/me", { headers: authorization })).json(),
  ).toMatchObject({ id: owner.id, name: "MCP Owner", role: "owner", email: owner.email })
  const mcpInvitation = crypto.randomUUID()
  const transportChannel = crypto.randomUUID()
  const cli = async (...args: string[]) =>
    createCli({
      readClipboard: async () => token,
      print: (value) => printed.push(value),
      openBrowser: () => {},
    }).parseAsync([
      "node",
      "void-chat",
      "--server",
      "http://localhost:5183",
      "--clipboard",
      ...args,
    ])
  await cli("channels", "create", `transports-${suffix}`, "--request-id", transportChannel)
  expect(printed.at(-1)).toMatchObject({ id: transportChannel, archived: false })
  await cli("channels", "rename", transportChannel, `renamed-${suffix}`)
  expect(printed.at(-1)).toMatchObject({ id: transportChannel, name: `renamed-${suffix}` })
  expect(
    (
      await mcp.callTool({
        name: "rename_channel",
        arguments: { channel: transportChannel, name: `mcp-${suffix}` },
      })
    ).isError,
  ).not.toBe(true)
  await cli("messages", "send", transportChannel, "transport-history")
  expect(
    (
      await mcp.callTool({
        name: "set_channel_archived",
        arguments: { channel: transportChannel, archived: true },
      })
    ).isError,
  ).not.toBe(true)
  await expect(cli("messages", "send", transportChannel, "blocked")).rejects.toThrow("アーカイブ")
  await cli("channels", "restore", transportChannel)
  expect(printed.at(-1)).toMatchObject({ id: transportChannel, archived: false })
  await cli("channels", "archive", transportChannel)
  expect(
    (
      await mcp.callTool({
        name: "set_channel_archived",
        arguments: { channel: transportChannel, archived: false },
      })
    ).isError,
  ).not.toBe(true)
  await cli("messages", "list", transportChannel, "--after", "0", "--until", "1")
  expect(printed.at(-1)).toMatchObject([{ text: "transport-history", sequence: 1 }])
  expect(
    (
      await mcp.callTool({
        name: "list_messages_after",
        arguments: { channel: transportChannel, after: 0, until: 1 },
      })
    ).isError,
  ).not.toBe(true)
  const contentFile = `.local/transport-${suffix}.txt`
  const outputFile = `.local/transport-${suffix}-download.txt`
  writeFileSync(contentFile, "synthetic transport attachment")
  const contentId = crypto.randomUUID()
  await cli("attachments", "upload", transportChannel, contentFile, "--request-id", contentId)
  expect(printed.at(-1)).toMatchObject({
    id: contentId,
    channelId: transportChannel,
    mediaType: "text/plain",
  })
  await cli("attachments", "list", transportChannel)
  expect(printed.at(-1)).toMatchObject({ items: [{ id: contentId }], usage: { files: 1 } })
  await cli("attachments", "download", transportChannel, contentId, "--output", outputFile)
  expect(readFileSync(outputFile, "utf8")).toBe("synthetic transport attachment")
  await cli("messages", "search", transportChannel, `transport-${suffix}`)
  expect(printed.at(-1)).toMatchObject({ complete: true, results: [{ id: contentId }] })
  const mcpContentId = crypto.randomUUID()
  const uploaded = await mcp.callTool({
    name: "upload_attachment",
    arguments: {
      channel: transportChannel,
      name: "mcp.txt",
      mediaType: "text/plain",
      data: Buffer.from("synthetic MCP attachment").toString("base64"),
      requestId: mcpContentId,
    },
  })
  expect(uploaded.isError).not.toBe(true)
  for (const data of ["A".repeat(1024 * 1024), "not-base64!", "Zg="])
    expect(
      (
        await mcp.callTool({
          name: "upload_attachment",
          arguments: {
            channel: transportChannel,
            name: "rejected.txt",
            mediaType: "text/plain",
            data,
            requestId: crypto.randomUUID(),
          },
        })
      ).isError,
    ).toBe(true)
  const listed = await mcp.callTool({
    name: "list_attachments",
    arguments: { channel: transportChannel },
  })
  expect(listed.isError).not.toBe(true)
  expect(JSON.stringify(listed)).not.toContain('"digest"')
  const downloaded = await mcp.callTool({
    name: "download_attachment",
    arguments: { channel: transportChannel, id: mcpContentId },
  })
  expect(downloaded.isError).not.toBe(true)
  expect(JSON.stringify(downloaded)).toContain(
    Buffer.from("synthetic MCP attachment").toString("base64"),
  )
  expect(
    (
      await mcp.callTool({
        name: "search_messages",
        arguments: { channel: transportChannel, q: "mcp.txt" },
      })
    ).isError,
  ).not.toBe(true)
  expect(
    (
      await mcp.callTool({
        name: "read_message",
        arguments: { channel: transportChannel, id: mcpContentId },
      })
    ).isError,
  ).not.toBe(true)
  for (const retry of [1, 2]) {
    void retry
    const invited = await mcp.callTool({
      name: "invite_member",
      arguments: { email: `mcp-invite-${suffix}@example.com`, requestId: mcpInvitation },
    })
    expect(invited.isError).not.toBe(true)
  }
  expect(
    (await (await page.request.get("/api/invitations", { headers: authorization })).json()).filter(
      (invitation: { id: string }) => invitation.id === mcpInvitation,
    ),
  ).toHaveLength(1)
  await mcp.close()
  await page.goto("/")

  await page.getByRole("button", { name: "メンバー", exact: true }).first().click()
  const invitedEmail = `member-${suffix}@example.com`
  await page.getByLabel("メールで招待", { exact: true }).fill(invitedEmail)
  await page.getByRole("button", { name: "招待", exact: true }).click()
  await expect(page.getByText(`${invitedEmail} · 招待中`)).toBeVisible()
  const inboxToken = readFileSync("apps/app/.void/dev-trigger-token", "utf8").trim()
  const inbox = await (await page.request.get(`/__void/inbox?token=${inboxToken}`)).text()
  const inboxLink =
    inbox.match(/href="([^"]+\/__void\/inbox\/[^"]+)"/)?.[1] ??
    inbox.match(/href="(\/__void\/inbox\/[^"]+)"/)?.[1]
  expect(inboxLink).toBeTruthy()
  const mail = await (await page.request.get(inboxLink!.replaceAll("&amp;", "&"))).text()
  const invitationToken = mail.match(/#invite=([a-f0-9]{64})/)?.[1]
  expect(invitationToken).toBeTruthy()

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  const guestProtocol = await guest.newCDPSession(guestPage)
  await guestProtocol.send("WebAuthn.enable")
  await guestProtocol.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  await guestPage.goto(`http://localhost:5183/#invite=${invitationToken}`)
  await guestPage.getByLabel("名前", { exact: true }).fill("Member")
  await guestPage.getByRole("button", { name: "パスキーを登録", exact: true }).click()
  await expect(guestPage.getByRole("heading", { name: "# general" })).toBeVisible()
  expect((await guestPage.request.get("/api/invitations")).status()).toBe(403)
  const guestMe = await (await guestPage.request.get("/api/me")).json()
  expect(
    (
      await guestPage.request.patch("/api/me", {
        headers: { Origin: "http://localhost:5183" },
        data: { name: "Member Renamed" },
      })
    ).status(),
  ).toBe(200)
  expect(await (await guestPage.request.get("/api/me")).json()).toMatchObject({
    id: guestMe.id,
    name: "Member Renamed",
    role: "member",
    email: guestMe.email,
  })
  expect(
    (
      await guestPage.request.post("/api/channels", {
        headers: { Origin: "http://localhost:5183" },
        data: { name: "forbidden" },
      })
    ).status(),
  ).toBe(403)
  expect(
    (await page.request.delete(`/api/members/${guestMe.id}`, { headers: authorization })).status(),
  ).toBe(200)
  expect((await guestPage.request.get("/api/channels")).status()).toBe(401)
  expect(
    (
      await guestPage.request.patch("/api/me", {
        headers: { Origin: "http://localhost:5183" },
        data: { name: "Disabled" },
      })
    ).status(),
  ).toBe(401)
  expect(
    (
      await page.request.post("/api/auth/register/options", {
        headers: { Origin: "http://localhost:5183" },
        data: { name: "Replay", invitation: invitationToken, bootstrap: null },
      })
    ).status(),
  ).not.toBe(201)
  await guest.close()

  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("combobox", { name: "チャンネル" })).toBeVisible()
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("*")]
      .map((element) => ({
        tag: element.tagName,
        id: element.id,
        right: element.getBoundingClientRect().right,
        position: getComputedStyle(element).position,
      }))
      .filter((element) => element.right > innerWidth),
  }))
  if (overflow.scrollWidth > overflow.width)
    writeFileSync(".local/content-overflow.json", JSON.stringify(overflow))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole("button", { name: "アカウント設定", exact: true }).click()
  await page.getByRole("button", { name: "ログアウト", exact: true }).click()
  await expect(page.getByRole("button", { name: "パスキーでログイン", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "パスキーでログイン", exact: true }).click()
  await expect(page.getByRole("combobox", { name: "チャンネル" })).toBeVisible()
  writeFileSync(
    credentialFile,
    JSON.stringify(
      (
        await protocol.send("WebAuthn.getCredentials", {
          authenticatorId: authenticator.authenticatorId,
        })
      ).credentials,
    ),
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: ".local/void-chat-mobile.png" })
})

test("CMS homepage and administration are available locally", async ({ page }) => {
  await page.goto("http://localhost:4322/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin")
  await page.goto("http://localhost:4322")
  await expect(page.locator("h1")).not.toBeEmpty()
  await page.screenshot({ path: ".local/void-chat-site.png" })
  await page.locator('header a[href="/"]').click()
  await expect(page.locator("h1")).not.toBeEmpty()
  const executable = packageBin("apps/site", "emdash")
  const options: ExecFileSyncOptionsWithStringEncoding = {
    cwd: resolve("apps/site"),
    encoding: "utf8",
    stdio: "pipe",
  }
  const original = JSON.parse(
    execFileSync(
      process.execPath,
      [executable, "content", "get", "pages", "home", "--url", "http://localhost:4322", "--raw"],
      options,
    ),
  )
  const updatedTitle = `公開確認 ${Date.now()}`
  try {
    execFileSync(
      process.execPath,
      [
        executable,
        "content",
        "update",
        "pages",
        "home",
        "--url",
        "http://localhost:4322",
        "--rev",
        original._rev,
        "--data",
        JSON.stringify({ title: updatedTitle }),
      ],
      options,
    )
    await page.reload()
    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible()
    expect(() =>
      execFileSync(
        process.execPath,
        [
          executable,
          "content",
          "update",
          "pages",
          "home",
          "--url",
          "http://localhost:4322",
          "--rev",
          original._rev,
          "--data",
          JSON.stringify({ title: "stale edit" }),
        ],
        options,
      ),
    ).toThrow()
  } finally {
    const current = JSON.parse(
      execFileSync(
        process.execPath,
        [executable, "content", "get", "pages", "home", "--url", "http://localhost:4322", "--raw"],
        options,
      ),
    )
    execFileSync(
      process.execPath,
      [
        executable,
        "content",
        "update",
        "pages",
        "home",
        "--url",
        "http://localhost:4322",
        "--rev",
        current._rev,
        "--data",
        JSON.stringify(original.data),
      ],
      options,
    )
  }
  await page.goto("http://localhost:4322/_emdash/admin")
  await expect(page.locator("body")).not.toBeEmpty()
  expect(page.url()).toContain("_emdash")
})
