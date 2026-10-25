import { packageBin } from "../scripts/package-bin.mjs"
import { test, expect } from "@playwright/test"
import { spawn } from "node:child_process"
import { resolve } from "node:path"

test("concurrent first-owner registration commits exactly one owner", async ({ browser }) => {
  const origin = "http://localhost:5184"
  const statePath = `../../.local/bootstrap-race-${crypto.randomUUID()}`
  const server = spawn(
    process.execPath,
    [packageBin("apps/app", "vite"), "--host", "127.0.0.1", "--port", "5184", "--strictPort"],
    {
      cwd: resolve("apps/app"),
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        VOID_CHAT_TEST_STATE: statePath,
        APP_ORIGIN: origin,
        BOOTSTRAP_TOKEN: "e2e-only-initialization-key",
        ADMIN_EMAIL: "owner@example.com",
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      },
    },
  )
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const barrier = Promise.withResolvers<void>()
  const arrivals = { count: 0 }
  const verificationStatuses: number[] = []

  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${origin}/api/health`)).status
          } catch {
            return 0
          }
        },
        { timeout: 45_000 },
      )
      .toBe(200)
    const pages = await Promise.all(contexts.map((context) => context.newPage()))

    for (const page of pages) {
      const protocol = await page.context().newCDPSession(page)
      await protocol.send("WebAuthn.enable")
      await protocol.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      })
      await page.route("**/api/auth/register/verify", async (route) => {
        arrivals.count += 1
        if (arrivals.count === 2) barrier.resolve()
        await barrier.promise
        await route.continue()
      })
      page.on("response", (response) => {
        if (response.url().endsWith("/api/auth/register/verify"))
          verificationStatuses.push(response.status())
      })
      await page.goto(origin)
      await page.getByLabel("名前", { exact: true }).fill("Owner")
      await page.getByLabel("初期化キー", { exact: true }).fill("e2e-only-initialization-key")
    }

    await Promise.all(
      pages.map((page) =>
        page.getByRole("button", { name: "パスキーを登録", exact: true }).click(),
      ),
    )
    await expect.poll(() => verificationStatuses.length, { timeout: 15_000 }).toBe(2)
    expect(verificationStatuses.sort()).toEqual([200, 409])
    const sessions = await Promise.all(
      contexts.map((context) => context.request.get(`${origin}/api/me`)),
    )
    expect(sessions.filter((session) => session.status() === 200)).toHaveLength(1)
    const winner = contexts[sessions.findIndex((session) => session.status() === 200)]!
    const members = await (await winner.request.get(`${origin}/api/members`)).json()
    expect(members.filter((member: { role: string }) => member.role === "owner")).toHaveLength(1)
    expect(
      (await (await winner.request.get(`${origin}/api/auth/status`)).json()).canBootstrap,
    ).toBe(false)
    const anonymous = await browser.newContext()
    try {
      expect(
        (
          await anonymous.request.post(`${origin}/api/auth/register/options`, {
            headers: { Origin: origin },
            data: { name: "Replay", bootstrap: "e2e-only-initialization-key", invitation: null },
          })
        ).status(),
      ).toBe(403)
    } finally {
      await anonymous.close()
    }
  } finally {
    barrier.resolve()
    await Promise.all(contexts.map((context) => context.close()))
    server.kill()
  }
})
