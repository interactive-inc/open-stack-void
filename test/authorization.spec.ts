import { packageBin } from "../scripts/package-bin.mjs"
import { test, expect } from "@playwright/test"
import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

test("browser approvals are bound, single-use, cancellable, and expiring", async ({
  page,
  context,
}) => {
  const ip = `2001:db8:${crypto.randomUUID().slice(0, 4)}::1`
  await context.setExtraHTTPHeaders({ "CF-Connecting-IP": ip })
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
  for (const credential of JSON.parse(readFileSync(credentialFile, "utf8")))
    await protocol.send("WebAuthn.addCredential", {
      authenticatorId: authenticator.authenticatorId,
      credential,
    })
  await page.goto("/")
  await page.getByRole("button", { name: "パスキーでログイン", exact: true }).click()
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible()
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

  const headers = { Origin: "http://localhost:5183" }
  const first = await (
    await page.request.post("/api/device", { headers, data: { name: "Security test" } })
  ).json()
  const second = await (
    await page.request.post("/api/device", { headers, data: { name: "Different request" } })
  ).json()
  expect(first.authorizationUrl).not.toContain(first.verifier)
  expect(
    JSON.stringify(await (await page.request.get(`/api/device/${first.id}`)).json()),
  ).not.toContain("verifier")
  expect(
    (
      await page.request.post(`/api/device/${first.id}/approve`, {
        headers,
        data: { code: first.userCode, approve: true },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await page.request.post(`/api/device/${first.id}/poll`, {
        headers,
        data: { verifier: "0".repeat(64) },
      })
    ).status(),
  ).toBe(410)
  expect(
    (await page.request.post("/api/tokens", { headers, data: { name: "unconfirmed" } })).status(),
  ).toBe(403)

  await page.route(`**/api/device/${first.id}/approve`, async (route) => {
    expect(
      (
        await page.request.post(`/api/device/${second.id}/approve`, {
          headers,
          data: { code: second.userCode, approve: true },
        })
      ).status(),
    ).toBe(403)
    await route.continue()
  })
  await page.goto(first.authorizationUrl)
  await page.getByLabel("確認コード").fill(first.userCode === "000000" ? "111111" : "000000")
  await page.getByRole("button", { name: "パスキーで承認", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("コードが異なります")
  await page.getByLabel("確認コード").fill(first.userCode)
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
  await page.unroute(`**/api/device/${first.id}/approve`)
  const approved = await page.request.post(`/api/device/${first.id}/poll`, {
    headers,
    data: { verifier: first.verifier },
  })
  expect(approved.status()).toBe(200)
  expect((await approved.json()).token).toHaveLength(64)
  expect(
    (
      await page.request.post(`/api/device/${first.id}/poll`, {
        headers,
        data: { verifier: first.verifier },
      })
    ).status(),
  ).toBe(410)

  expect(
    (
      await page.request.post(`/api/device/${second.id}/cancel`, {
        headers,
        data: { verifier: "0".repeat(64) },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await (
        await page.request.post(`/api/device/${second.id}/poll`, {
          headers,
          data: { verifier: second.verifier },
        })
      ).json()
    ).status,
  ).toBe("pending")
  await page.request.post(`/api/device/${second.id}/cancel`, {
    headers,
    data: { verifier: second.verifier },
  })
  expect(
    (
      await page.request.post(`/api/device/${second.id}/poll`, {
        headers,
        data: { verifier: second.verifier },
      })
    ).status(),
  ).toBe(410)

  const denied = await (
    await page.request.post("/api/device", { headers, data: { name: "Denied request" } })
  ).json()
  await page.goto(denied.authorizationUrl)
  await page.getByLabel("確認コード").fill(denied.userCode)
  await page.getByRole("button", { name: "拒否", exact: true }).click()
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
  expect(
    (
      await page.request.post(`/api/device/${denied.id}/poll`, {
        headers,
        data: { verifier: denied.verifier },
      })
    ).status(),
  ).toBe(403)
})

test("device authorizations expire in the local database", async ({ request }) => {
  const headers = { "CF-Connecting-IP": `2001:db8:${crypto.randomUUID().slice(0, 4)}::3` }
  const expired = await (
    await request.post("/api/device", { headers, data: { name: "Expiry test" } })
  ).json()
  expect(expired.id).toMatch(/^[a-f0-9-]{36}$/)
  execFileSync(
    process.execPath,
    [
      packageBin("apps/app", "void"),
      "db",
      "execute",
      `UPDATE chat_authorization_requests SET expires_at = 0 WHERE id = '${expired.id}'`,
    ],
    { cwd: resolve("apps/app"), encoding: "utf8", stdio: "pipe" },
  )
  expect((await request.get(`/api/device/${expired.id}`, { headers })).status()).toBe(404)
  expect(
    (
      await request.post(`/api/device/${expired.id}/poll`, {
        headers,
        data: { verifier: expired.verifier },
      })
    ).status(),
  ).toBe(410)
})

test("authentication attempts are bounded per caller", async ({ request }) => {
  // The existing gate uses calendar-minute windows; keep the burst within one window.
  const remaining = 60_000 - (Date.now() % 60_000)
  if (remaining < 5000) await new Promise((resolve) => setTimeout(resolve, remaining + 100))
  const headers = { "CF-Connecting-IP": `2001:db8:${crypto.randomUUID().slice(0, 4)}::2` }
  const responses = []
  for (const attempt of Array.from({ length: 31 }, (_, index) => index))
    responses.push(await request.get(`/api/auth/status?attempt=${attempt}`, { headers }))
  expect(responses.slice(0, 30).every((response) => response.status() === 200)).toBe(true)
  expect(responses[30]?.status()).toBe(429)
})
