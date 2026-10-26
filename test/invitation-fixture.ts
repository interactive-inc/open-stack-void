import { expect } from "@playwright/test"
import type { Browser } from "@playwright/test"
import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { packageBin } from "../scripts/package-bin.mjs"

export const origin = "http://localhost:5183"
export const headers = { Origin: origin }

export async function guestSession(browser: Browser, invitation: string | null = null) {
  const context = await browser.newContext()
  await context.setExtraHTTPHeaders({
    "CF-Connecting-IP": `2001:db8:${crypto.randomUUID().slice(0, 4)}::5`,
  })
  const page = await context.newPage()
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
  if (invitation) {
    await page.goto(`${origin}/#invite=${invitation}`)
    await page.getByLabel("名前", { exact: true }).fill("Invitation Member")
  }
  return { context, page, protocol, authenticator }
}

export async function ownerSession(browser: Browser) {
  const owner = await guestSession(browser)
  for (const credential of JSON.parse(readFileSync(".local/e2e-owner-credentials.json", "utf8")))
    await owner.protocol.send("WebAuthn.addCredential", {
      authenticatorId: owner.authenticator.authenticatorId,
      credential,
    })
  await owner.page.goto(origin)
  await owner.page.getByRole("button", { name: "パスキーでログイン", exact: true }).click()
  await expect(owner.page.getByRole("heading", { name: "# general" })).toBeVisible()
  return {
    ...owner,
    close: async () => {
      const credentials = await owner.protocol.send("WebAuthn.getCredentials", {
        authenticatorId: owner.authenticator.authenticatorId,
      })
      writeFileSync(".local/e2e-owner-credentials.json", JSON.stringify(credentials.credentials))
      await owner.context.close()
    },
  }
}

export async function mailbox(
  request: Awaited<ReturnType<typeof ownerSession>>["page"]["request"],
) {
  const token = readFileSync("apps/app/.void/dev-trigger-token", "utf8").trim()
  const inbox = await (await request.get(`${origin}/__void/inbox?token=${token}`)).text()
  const links = [...inbox.matchAll(/href="([^"]*\/__void\/inbox\/[^"]+)"/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((link) => /^\/__void\/inbox\/[^/]+$/.test(new URL(link, origin).pathname))
  const mail = links[0] ? await (await request.get(new URL(links[0], origin).href)).text() : ""
  return { count: links.length, invitation: mail.match(/#invite=([a-f0-9]{64})/)?.[1] ?? "" }
}

export async function issueInvitation(
  owner: Awaited<ReturnType<typeof ownerSession>>,
  email = `invite-${crypto.randomUUID()}@example.com`,
) {
  const response = await owner.page.request.post(`${origin}/api/invitations`, {
    headers,
    data: { email, id: crypto.randomUUID() },
  })
  expect(response.status()).toBe(201)
  const invitation = await response.json()
  const mail = await mailbox(owner.page.request)
  expect(Boolean(mail.invitation)).toBe(true)
  return { id: invitation.id, email, token: mail.invitation }
}

export function expireInvitation(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid synthetic invitation ID")
  execFileSync(
    process.execPath,
    [
      packageBin("apps/app", "void"),
      "db",
      "execute",
      `UPDATE chat_invitations SET expires_at = 0 WHERE id = '${id}'`,
    ],
    { cwd: resolve("apps/app"), stdio: "pipe" },
  )
}
