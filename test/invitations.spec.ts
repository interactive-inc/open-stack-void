import { test, expect } from "@playwright/test"
import { setDeliveryFixture } from "./invitation-delivery-fixture"
import {
  origin,
  headers,
  ownerSession,
  guestSession,
  mailbox,
  issueInvitation,
  expireInvitation,
} from "./invitation-fixture"

test("uncertain invitation responses preserve drafts and deduplicate retry, cancellation and resend", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const outsider = await guestSession(browser)
  try {
    const email = `retry-${crypto.randomUUID()}@example.com`
    const before = await mailbox(owner.page.request)
    const attempts: string[] = []
    await owner.page.getByRole("button", { name: "メンバー", exact: true }).first().click()
    await owner.page.route("**/api/invitations", async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      attempts.push(route.request().postDataJSON().id)
      if (attempts.length === 1) {
        const response = await route.fetch()
        expect(response.status()).toBe(201)
        return route.abort("failed")
      }
      return route.continue()
    })
    await owner.page.getByLabel("メールで招待", { exact: true }).fill(email)
    await owner.page.getByRole("button", { name: "招待", exact: true }).click()
    await expect(owner.page.getByRole("alert")).toContainText("送信結果を確認できません")
    await expect(owner.page.getByLabel("メールで招待", { exact: true })).toHaveValue(email)
    await owner.page.getByRole("button", { name: "招待", exact: true }).click()
    await expect(owner.page.getByLabel("メールで招待", { exact: true })).toHaveValue("")
    expect(attempts).toHaveLength(2)
    expect(attempts[0] === attempts[1]).toBe(true)
    const firstMail = await mailbox(owner.page.request)
    expect(firstMail.count - before.count).toBe(1)
    expect(
      (
        await owner.page.request.post(`${origin}/api/invitations`, {
          headers,
          data: { email: ` ${email.toUpperCase()} `, id: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(409)
    await owner.page
      .getByRole("group", { name: `招待 ${email}`, exact: true })
      .getByRole("button", { name: "取消", exact: true })
      .click()
    await expect(
      owner.page.getByRole("group", { name: `招待 ${email}`, exact: true }),
    ).toContainText("取消済み")
    expect(
      (
        await owner.page.request.post(`${origin}/api/invitations`, {
          headers,
          data: { email, id: attempts[0] },
        })
      ).status(),
    ).toBe(409)
    expect((await mailbox(owner.page.request)).count).toBe(firstMail.count)
    expect(
      (
        await outsider.page.request.post(`${origin}/api/auth/register/options`, {
          headers,
          data: { name: "Cancelled", invitation: firstMail.invitation, bootstrap: null },
        })
      ).status(),
    ).toBe(403)
    await owner.page
      .getByRole("group", { name: `招待 ${email}`, exact: true })
      .getByRole("button", { name: "再招待", exact: true })
      .click()
    await expect(owner.page.getByLabel("メールで招待", { exact: true })).toHaveValue(email)
    await owner.page.getByRole("button", { name: "招待", exact: true }).click()
    await expect(owner.page.getByText(`${email} · 招待中`, { exact: true })).toBeVisible()
    const resentMail = await mailbox(owner.page.request)
    expect(resentMail.invitation !== firstMail.invitation).toBe(true)
    expect(resentMail.count - firstMail.count).toBe(1)
    expect(
      (
        await outsider.page.request.post(`${origin}/api/auth/register/options`, {
          headers,
          data: {
            name: "Resent",
            invitation: resentMail.invitation,
            bootstrap: null,
            role: "owner",
          },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await outsider.page.request.post(`${origin}/api/invitations`, {
          headers,
          data: { email: "unauthorized@example.com" },
        })
      ).status(),
    ).toBe(401)
    const parallelEmail = `parallel-${crypto.randomUUID()}@example.com`
    const parallel = await Promise.all(
      [1, 2].map(() =>
        owner.page.request.post(`${origin}/api/invitations`, {
          headers,
          data: { email: parallelEmail, id: crypto.randomUUID() },
        }),
      ),
    )
    expect(parallel.map((response) => response.status()).sort()).toEqual([201, 409])
    const id = (await parallel.find((response) => response.status() === 201)!.json()).id
    for (const attempt of [1, 2]) {
      void attempt
      expect(
        (await owner.page.request.delete(`${origin}/api/invitations/${id}`, { headers })).status(),
      ).toBe(200)
    }
  } finally {
    await outsider.context.close()
    await owner.close()
  }
})

test("invitation acceptance rechecks expiry, revocation and current inviter authority after the challenge", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const administratorInvitation = await issueInvitation(owner)
  const administrator = await guestSession(browser, administratorInvitation.token)
  try {
    await administrator.page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
    await expect(administrator.page.getByRole("heading", { name: "# general" })).toBeVisible()
    const administratorMember = await (
      await administrator.page.request.get(`${origin}/api/me`)
    ).json()
    expect((await administrator.page.request.get(`${origin}/api/invitations`)).status()).toBe(403)
    expect(
      (
        await administrator.page.request.post(`${origin}/api/invitations`, {
          headers,
          data: { email: "member-denied@example.com" },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await owner.page.request.patch(`${origin}/api/members/${administratorMember.id}`, {
          headers,
          data: { role: "admin" },
        })
      ).status(),
    ).toBe(200)
    const ownerMember = await (await owner.page.request.get(`${origin}/api/me`)).json()
    await administrator.page.reload()
    await expect(administrator.page.getByRole("heading", { name: "# general" })).toBeVisible()
    expect(
      (
        await administrator.page.request.delete(`${origin}/api/members/${ownerMember.id}`, {
          headers,
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await administrator.page.request.patch(`${origin}/api/members/${administratorMember.id}`, {
          headers,
          data: { role: "admin" },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await owner.page.request.patch(`${origin}/api/members/${administratorMember.id}`, {
          headers,
          data: { role: "admin", status: "disabled" },
        })
      ).status(),
    ).toBe(400)
    const issuer = { ...owner, page: administrator.page }
    for (const scenario of ["cancel", "expire", "demote", "disable"]) {
      const invitation = await issueInvitation(issuer)
      if (scenario === "demote") {
        await administrator.page
          .getByRole("button", { name: "メンバー", exact: true })
          .first()
          .click()
        await expect(
          administrator.page.getByRole("group", { name: `招待 ${invitation.email}`, exact: true }),
        ).toBeVisible()
      }
      const guest = await guestSession(browser, invitation.token)
      const responses: number[] = []
      await guest.page.route("**/api/auth/register/verify", async (route) => {
        if (scenario === "cancel")
          expect(
            (
              await owner.page.request.delete(`${origin}/api/invitations/${invitation.id}`, {
                headers,
              })
            ).status(),
          ).toBe(200)
        if (scenario === "expire") expireInvitation(invitation.id)
        if (scenario === "demote") {
          expect(
            (
              await owner.page.request.patch(`${origin}/api/members/${administratorMember.id}`, {
                headers,
                data: { role: "member" },
              })
            ).status(),
          ).toBe(200)
        }
        if (scenario === "disable")
          expect(
            (
              await owner.page.request.delete(`${origin}/api/members/${administratorMember.id}`, {
                headers,
              })
            ).status(),
          ).toBe(200)
        await route.continue()
      })
      guest.page.on("response", (response) => {
        if (response.url().endsWith("/api/auth/register/verify")) responses.push(response.status())
      })
      try {
        await guest.page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
        await expect.poll(() => responses.length).toBe(1)
        expect(responses).toEqual([409])
        expect((await guest.page.request.get(`${origin}/api/me`)).status()).toBe(401)
        const members = await (await owner.page.request.get(`${origin}/api/members`)).json()
        expect(members.some((member: { email: string }) => member.email === invitation.email)).toBe(
          false,
        )
        {
          const invitations = await (
            await owner.page.request.get(`${origin}/api/invitations`)
          ).json()
          expect(
            invitations.find((entry: { id: string }) => entry.id === invitation.id).status,
          ).toBe(
            scenario === "cancel" ? "revoked" : scenario === "expire" ? "expired" : "unavailable",
          )
        }
        expect(
          (
            await guest.page.request.post(`${origin}/api/auth/register/options`, {
              headers,
              data: { name: "Replay", invitation: invitation.token, bootstrap: null },
            })
          ).status(),
        ).toBe(403)
        if (scenario === "demote") {
          await administrator.page
            .getByLabel("メールで招待", { exact: true })
            .fill(`denied-${crypto.randomUUID()}@example.com`)
          await administrator.page.getByRole("button", { name: "招待", exact: true }).click()
          await expect(administrator.page.getByRole("alert")).toBeVisible()
          await administrator.page.getByRole("button", { name: "再読み込み", exact: true }).click()
          await expect(administrator.page.getByLabel("メールで招待", { exact: true })).toHaveCount(
            0,
          )
          await expect(administrator.page.getByRole("group", { name: /^招待 / })).toHaveCount(0)
          expect(
            (
              await owner.page.request.patch(`${origin}/api/members/${administratorMember.id}`, {
                headers,
                data: { role: "admin" },
              })
            ).status(),
          ).toBe(200)
        }
        if (scenario === "disable") {
          expect(
            (
              await owner.page.request.post(
                `${origin}/api/members/${administratorMember.id}/restore`,
                { headers },
              )
            ).status(),
          ).toBe(200)
          expect(
            (
              await administrator.page.request.post(`${origin}/api/invitations`, {
                headers,
                data: { email: "revoked-session@example.com" },
              })
            ).status(),
          ).toBe(401)
        }
      } finally {
        await guest.context.close()
      }
    }
    await owner.page.getByRole("button", { name: "メンバー", exact: true }).first().click()
    await expect(owner.page.getByText(/· 期限切れ/)).toBeVisible()
  } finally {
    await administrator.context.close()
    await owner.close()
  }
})

test("two simultaneous passkey acceptances commit exactly one ordinary member", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const invitation = await issueInvitation(owner)
  const guests = await Promise.all([
    guestSession(browser, invitation.token),
    guestSession(browser, invitation.token),
  ])
  const barrier = Promise.withResolvers<void>()
  const arrivals = { count: 0 }
  const responses: number[] = []
  try {
    for (const guest of guests) {
      await guest.page.route("**/api/auth/register/verify", async (route) => {
        arrivals.count += 1
        if (arrivals.count === 2) barrier.resolve()
        await barrier.promise
        await route.continue()
      })
      guest.page.on("response", (response) => {
        if (response.url().endsWith("/api/auth/register/verify")) responses.push(response.status())
      })
    }
    await Promise.all(
      guests.map((guest) =>
        guest.page.getByRole("button", { name: "パスキーを登録", exact: true }).click(),
      ),
    )
    await expect.poll(() => responses.length, { timeout: 15_000 }).toBe(2)
    expect(responses.sort()).toEqual([200, 409])
    const sessions = await Promise.all(
      guests.map((guest) => guest.page.request.get(`${origin}/api/me`)),
    )
    expect(sessions.filter((response) => response.status() === 200)).toHaveLength(1)
    const members = await (await owner.page.request.get(`${origin}/api/members`)).json()
    expect(
      members.filter((member: { email: string }) => member.email === invitation.email),
    ).toHaveLength(1)
    expect(
      members.find((member: { email: string }) => member.email === invitation.email).role,
    ).toBe("member")
    const history = await (await owner.page.request.get(`${origin}/api/invitations`)).json()
    expect(history.find((entry: { id: string }) => entry.id === invitation.id).status).toBe(
      "accepted",
    )
    const loser = guests[sessions.findIndex((response) => response.status() !== 200)]!
    expect(
      (
        await loser.page.request.post(`${origin}/api/auth/register/options`, {
          headers,
          data: { name: "Replay", invitation: invitation.token, bootstrap: null },
        })
      ).status(),
    ).toBe(403)
  } finally {
    barrier.resolve()
    await Promise.all(guests.map((guest) => guest.context.close()))
    await owner.close()
  }
})

test("unknown delivery recovery requires confirmation, invalidates the old link and respects cancellation", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const outsider = await guestSession(browser)
  try {
    const invite = await issueInvitation(owner)
    const before = await mailbox(owner.page.request)
    setDeliveryFixture(invite.id, "sending", 1)
    const retry = (attempts: number, acknowledgeUnknown = false) =>
      owner.page.request.post(`${origin}/api/invitations/${invite.id}/retry`, {
        headers,
        data: { attempts, acknowledgeUnknown },
      })
    expect((await retry(1)).status()).toBe(409)
    expect(
      (
        await outsider.page.request.post(`${origin}/api/invitations/${invite.id}/retry`, {
          headers,
          data: { attempts: 1, acknowledgeUnknown: true },
        })
      ).status(),
    ).toBe(401)
    await owner.page.getByRole("button", { name: "メンバー", exact: true }).first().click()
    const members = owner.page.getByRole("dialog", { name: "メンバー", exact: true })
    const row = members.getByRole("group", { name: `招待 ${invite.email}`, exact: true })
    await expect(row).toContainText("送信結果不明")
    await row.getByRole("button", { name: "再試行", exact: true }).click()
    const confirmation = owner.page.getByRole("alertdialog")
    await expect(confirmation).toContainText("メールが重複")
    await owner.page.setViewportSize({ width: 390, height: 844 })
    expect(
      await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    expect(
      await owner.page
        .getByRole("dialog", { includeHidden: true })
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await owner.page.screenshot({
      path: ".local/outbox-recovery-mobile.png",
      animations: "disabled",
    })
    await confirmation.getByRole("button", { name: "戻る", exact: true }).click()
    await owner.page.setViewportSize({ width: 1440, height: 900 })
    expect((await mailbox(owner.page.request)).count).toBe(before.count)
    await row.getByRole("button", { name: "再試行", exact: true }).click()
    await owner.page.route(
      "**/api/invitations/*/retry",
      async (route) => {
        const response = await route.fetch()
        expect(response.status()).toBe(200)
        await route.abort("failed")
      },
      { times: 1 },
    )
    await confirmation
      .getByRole("button", { name: "旧リンクを無効にして再送", exact: true })
      .click()
    await expect(row).toContainText("送信受付済み · 2/3")
    await expect(members.getByRole("alert")).toContainText("操作結果を確認できません")
    const recovered = await mailbox(owner.page.request)
    expect(recovered.count - before.count).toBe(1)
    expect(recovered.invitation === invite.token).toBe(false)
    expect(
      (
        await outsider.page.request.post(`${origin}/api/auth/register/options`, {
          headers,
          data: { name: "Old Link", invitation: invite.token, bootstrap: null },
        })
      ).status(),
    ).toBe(403)
    expect((await retry(1, true)).status()).toBe(409)
    setDeliveryFixture(invite.id, "failed", 2)
    const concurrent = await Promise.all([retry(2), retry(2)])
    expect(concurrent.map((response) => response.status()).sort()).toEqual([200, 409])
    expect((await retry(3, true)).status()).toBe(409)
    await members.getByRole("button", { name: "再読み込み", exact: true }).click()
    await expect(row).toContainText("送信受付済み · 3/3")
    const last = await mailbox(owner.page.request)
    expect(last.count - recovered.count).toBe(1)
    await row.getByRole("button", { name: "取消", exact: true }).click()
    await expect(row).toContainText("取消済み")
    await expect(row.getByRole("button", { name: "再試行", exact: true })).toHaveCount(0)
    expect((await retry(2, true)).status()).toBe(409)
    expect(
      (
        await outsider.page.request.post(`${origin}/api/auth/register/options`, {
          headers,
          data: { name: "Cancelled Link", invitation: last.invitation, bootstrap: null },
        })
      ).status(),
    ).toBe(403)
    expect((await mailbox(owner.page.request)).count).toBe(last.count)
  } finally {
    await outsider.context.close()
    await owner.close()
  }
})
