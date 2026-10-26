import { test, expect } from "@playwright/test"
import { nodeFetch } from "../packages/sdk/src/node-fetch"
import { VoidChatClient } from "../packages/sdk/src/void-chat-client"
import { createCli } from "../apps/cli/src/create-cli"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { portlessStateDiagnostics } from "../scripts/portless-diagnostics.mjs"

test("named local origins preserve passkeys, cookies, sockets and client authorization", async ({
  page,
  context,
}) => {
  const app = "http://app.void.stack.localhost"
  const site = "http://void.stack.localhost"
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
  const navigation = await page.goto(app)
  const browserState = await page.evaluate(async () => {
    async function probe(path: string) {
      const response = await fetch(path)
      const body = await response.json().catch(() => null)
      return {
        status: response.status,
        service: body?.service === "void-chat",
        canBootstrap: body?.canBootstrap === true,
      }
    }
    return { health: await probe("/api/health"), registration: await probe("/api/auth/status") }
  })
  const direct = await nodeFetch(`${app}/api/auth/status`, {}).then(async (response) => ({
    status: response.status,
    canBootstrap: (await response.json().catch(() => null))?.canBootstrap === true,
  }))
  const backend = await nodeFetch("http://127.0.0.1:5173/api/auth/status", {
    headers: { Host: "app.void.stack.localhost" },
  }).then(async (response) => ({
    status: response.status,
    canBootstrap: (await response.json().catch(() => null))?.canBootstrap === true,
  }))
  const isolatedState = portlessStateDiagnostics()
  console.log(
    JSON.stringify({
      kind: "portless-test-preconditions",
      navigationStatus: navigation?.status(),
      browserState,
      direct,
      backend,
      pageTitle: await page.title(),
      loginVisible: await page
        .getByRole("button", { name: "パスキーでログイン", exact: true })
        .isVisible(),
      isolatedState,
    }),
  )
  expect(browserState.health).toMatchObject({ status: 200, service: true })
  expect(browserState.registration).toMatchObject({ status: 200, canBootstrap: true })
  expect(direct).toEqual({ status: 200, canBootstrap: true })
  expect(backend).toEqual({ status: 200, canBootstrap: true })
  expect(isolatedState.databases).toContainEqual({ members: 0, bootstrapClaims: 0 })
  expect(await page.evaluate(() => isSecureContext)).toBe(true)
  const socket = page.waitForEvent("websocket")
  await page.getByLabel("名前", { exact: true }).fill("Portless Owner")
  await page.getByLabel("初期化キー", { exact: true }).fill("portless-e2e-only-key")
  await page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible()
  const connection = await socket
  expect(connection.url()).toContain("ws://app.void.stack.localhost/api/channels/")
  const credentials = await protocol.send("WebAuthn.getCredentials", {
    authenticatorId: authenticator.authenticatorId,
  })
  expect(credentials.credentials[0].rpId).toBe("app.void.stack.localhost")
  const cookies = await context.cookies(app)
  expect(cookies.find((cookie) => cookie.name === "void_chat_session")).toMatchObject({
    domain: "app.void.stack.localhost",
    httpOnly: true,
    sameSite: "Strict",
    secure: false,
  })
  expect((await context.cookies(site)).some((cookie) => cookie.name === "void_chat_session")).toBe(
    false,
  )
  await page.getByRole("button", { name: "アカウント設定", exact: true }).click()
  await page.getByLabel("CLI / MCP トークン · 30日間").fill("portless-test")
  await page.getByRole("button", { name: "発行", exact: true }).click()
  const token = await page.getByLabel("一度だけ表示されます").inputValue()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  const client = new VoidChatClient({ baseUrl: app, token, request: nodeFetch })
  const channels = await client.channels()
  const incoming = connection.waitForEvent("framereceived")
  await client.sendMessage(channels[0]!.id, "portless-live-message")
  await incoming
  await expect(page.getByText("portless-live-message", { exact: true })).toBeVisible()
  const file = await client.uploadAttachment(
    channels[0]!.id,
    "named.txt",
    new Blob(["named-loopback-file"], { type: "text/plain" }),
  )
  expect(await (await client.downloadAttachment(channels[0]!.id, file.id)).text()).toBe(
    "named-loopback-file",
  )
  expect((await client.search(channels[0]!.id, "named.txt")).results).toMatchObject([
    { id: file.messageId },
  ])
  await expect(
    page.getByRole("button", { name: "named.txt をダウンロード", exact: true }),
  ).toBeVisible()
  const output: unknown[] = []
  await createCli({
    readClipboard: async () => token,
    print: (value) => output.push(value),
    openBrowser: () => {},
  }).parseAsync(["node", "void-chat", "--clipboard", "me"])
  expect(output[0]).toMatchObject({ name: "Portless Owner" })
  const rejected = await nodeFetch(`${app}/api/auth/login/options`, {
    method: "POST",
    headers: { Origin: site, "Content-Type": "application/json" },
    body: "{}",
  })
  expect(rejected.status).toBe(403)
  expect(rejected.headers.get("access-control-allow-origin")).toBeNull()
  const cookie = cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ")
  expect(
    (
      await nodeFetch(`${app}/api/channels/${channels[0]!.id}/socket`, {
        headers: { Cookie: cookie, Origin: site },
      })
    ).status,
  ).toBe(403)
  const mcp = new Client({ name: "portless-test", version: "1" })
  await mcp.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["apps/mcp/dist/server.mjs"],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && entry[0] !== "VOID_CHAT_URL",
        ),
      ),
    }),
  )
  try {
    const authorization = await mcp.callTool({ name: "begin_login", arguments: {} })
    const details = JSON.parse(authorization.content[0].text)
    expect(new URL(details.authorizationUrl).origin).toBe(app)
    await page.goto(details.authorizationUrl)
    await page.getByLabel("確認コード").fill(details.confirmationCode)
    await page.getByRole("button", { name: "パスキーで承認", exact: true }).click()
    await expect(page.getByRole("heading", { name: "完了", exact: true })).toBeVisible()
    expect((await mcp.callTool({ name: "complete_login", arguments: {} })).isError).not.toBe(true)
    expect((await mcp.callTool({ name: "whoami", arguments: {} })).isError).not.toBe(true)
    expect(
      (await mcp.callTool({ name: "list_attachments", arguments: { channel: channels[0]!.id } }))
        .isError,
    ).not.toBe(true)
    const attachment = await mcp.callTool({
      name: "upload_attachment",
      arguments: {
        channel: channels[0]!.id,
        name: "named-mcp.txt",
        mediaType: "text/plain",
        data: Buffer.from("named MCP bytes").toString("base64"),
        requestId: crypto.randomUUID(),
      },
    })
    expect(attachment.isError).not.toBe(true)
  } finally {
    await mcp.close()
  }
  await page.goto(app)
  const logout = await page.evaluate(
    async () => (await fetch("/api/auth/logout", { method: "POST" })).status,
  )
  expect(logout).toBe(200)
  await page.reload()
  await page.getByRole("button", { name: "パスキーでログイン" }).click()
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible()
  expect((await page.goto(site))?.status()).toBe(200)
  await expect(page.locator(`a[href="${app}"]`).first()).toBeVisible()
  expect((await page.goto(`${site}/_emdash/admin`))?.status()).toBe(200)
  expect(page.url()).toBe(`${site}/_emdash/admin/setup`)
})
