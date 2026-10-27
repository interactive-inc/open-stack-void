import { test, expect } from "@playwright/test"
import { ownerSession, guestSession, issueInvitation, origin, headers } from "./invitation-fixture"

test("daily chat keeps personal unread positions, replies and uncertain sends across channel switches", async ({
  browser,
}) => {
  const owner = await ownerSession(browser)
  const invitation = await issueInvitation(owner)
  const member = await guestSession(browser, invitation.token)
  const outsider = await guestSession(browser)
  try {
    await member.page.getByRole("button", { name: "パスキーを登録", exact: true }).click()
    await expect(member.page.getByRole("heading", { name: "# general" })).toBeVisible()
    await owner.page.request.patch(`${origin}/api/me`, { headers, data: { name: "佐藤" } })
    await member.page.request.patch(`${origin}/api/me`, { headers, data: { name: "高橋" } })
    const actor = await (await member.page.request.get(`${origin}/api/me`)).json()
    const channel = crypto.randomUUID()
    const name = `daily-${channel.slice(0, 6)}`
    expect(
      (
        await owner.page.request.post(`${origin}/api/channels`, {
          headers,
          data: { id: channel, name },
        })
      ).status(),
    ).toBe(201)
    const first = await (
      await owner.page.request.post(`${origin}/api/channels/${channel}/messages`, {
        headers,
        data: { id: crypto.randomUUID(), text: "来週の定例は火曜日です。" },
      })
    ).json()
    const activity = async (request = member.page.request) => {
      const response = await request.post(`${origin}/api/channel-activity`, {
        headers,
        data: { channelIds: [channel] },
      })
      expect(response.status()).toBe(200)
      return (await response.json())[0]
    }
    const mark = async (sequence: number) =>
      member.page.request.post(`${origin}/api/channels/${channel}/read`, {
        headers,
        data: { sequence },
      })
    expect(await activity()).toMatchObject({ unreadCount: 1, readSequence: 0 })
    expect(await activity(owner.page.request)).toMatchObject({ unreadCount: 0, readSequence: 0 })
    expect(
      (
        await outsider.page.request.post(`${origin}/api/channel-activity`, {
          headers,
          data: { channelIds: [channel] },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await outsider.page.request.post(`${origin}/api/channels/${channel}/read`, {
          headers,
          data: { sequence: first.sequence },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await member.page.request.post(`${origin}/api/channels/${channel}/read`, {
          headers,
          data: { sequence: 1, memberId: "other" },
        })
      ).status(),
    ).toBe(400)
    expect((await mark(Number.MAX_SAFE_INTEGER)).status()).toBe(200)
    expect(await activity()).toMatchObject({ readSequence: first.sequence, unreadCount: 0 })
    await mark(0)
    expect(await activity()).toMatchObject({ readSequence: first.sequence })
    const second = await (
      await owner.page.request.post(`${origin}/api/channels/${channel}/messages`, {
        headers,
        data: { id: crypto.randomUUID(), text: "資料は前日までに共有してください。" },
      })
    ).json()
    expect(await activity()).toMatchObject({ unreadCount: 1 })
    await member.page.reload()
    await member.page.bringToFront()
    const select = (value: string) =>
      member.page
        .getByRole("navigation", { name: "チャンネル", exact: true })
        .getByRole("button")
        .filter({ hasText: value })
        .click()
    await expect(
      member.page
        .getByRole("navigation", { name: "チャンネル", exact: true })
        .getByRole("button")
        .filter({ hasText: name }),
    ).toContainText("1")
    await select(name)
    await expect.poll(async () => (await activity()).unreadCount).toBe(0)
    await member.page.getByRole("button", { name: "アカウント設定", exact: true }).click()
    const third = await (
      await owner.page.request.post(`${origin}/api/channels/${channel}/messages`, {
        headers,
        data: { id: crypto.randomUUID(), text: "当日は議事録をお願いします。" },
      })
    ).json()
    await expect.poll(async () => (await activity()).unreadCount).toBe(1)
    await member.page.waitForTimeout(700)
    expect((await activity()).unreadCount).toBe(1)
    await member.page.getByRole("button", { name: "Close", exact: true }).click()
    await expect.poll(async () => (await activity()).unreadCount).toBe(0)
    const otherTab = await member.context.newPage()
    await otherTab.goto("about:blank")
    await member.protocol.send("Emulation.setFocusEmulationEnabled", { enabled: false })
    await otherTab.bringToFront()
    await expect.poll(() => member.page.evaluate(() => document.hasFocus())).toBe(false)
    await owner.page.request.post(`${origin}/api/channels/${channel}/messages`, {
      headers,
      data: { id: crypto.randomUUID(), text: "開始時刻は10時です。" },
    })
    await member.page.waitForTimeout(700)
    expect((await activity()).unreadCount).toBe(1)
    await otherTab.close()
    await member.protocol.send("Emulation.setFocusEmulationEnabled", { enabled: true })
    await member.page.bringToFront()
    await expect.poll(async () => (await activity()).unreadCount).toBe(0)
    const row = member.page
      .locator('[data-slot="message"]')
      .filter({ has: member.page.getByText(first.text, { exact: true }) })
    await row.getByRole("button", { name: "この投稿に返信", exact: true }).click()
    await member.page
      .getByRole("textbox", { name: `#${name} にメッセージ` })
      .fill("承知しました。資料を準備します。")
    let requestId = ""
    await member.page.route(`**/api/channels/${channel}/messages`, async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      requestId = route.request().postDataJSON().id
      await route.fetch()
      await route.abort("connectionreset")
    })
    await member.page.getByRole("button", { name: "送信", exact: true }).click()
    await expect(member.page.getByRole("button", { name: "再送", exact: true })).toBeVisible()
    await member.page.unroute(`**/api/channels/${channel}/messages`)
    await select("general")
    await select(name)
    await expect(member.page.getByRole("textbox", { name: `#${name} にメッセージ` })).toHaveValue(
      "承知しました。資料を準備します。",
    )
    await member.page.getByRole("button", { name: "送信", exact: true }).click()
    await expect(member.page.getByRole("textbox", { name: `#${name} にメッセージ` })).toHaveValue(
      "",
    )
    const messages = await (
      await member.page.request.get(`${origin}/api/channels/${channel}/messages`)
    ).json()
    const replies = messages.filter(
      (message: { text: string }) => message.text === "承知しました。資料を準備します。",
    )
    expect(replies).toHaveLength(1)
    expect(replies[0]).toMatchObject({ id: requestId, replyToId: first.id })
    expect(
      (
        await owner.page.request.patch(`${origin}/api/channels/${channel}`, {
          headers,
          data: { name: "project" },
        })
      ).status(),
    ).toBe(200)
    await expect(member.page.getByRole("heading", { name: "# project", exact: true })).toBeVisible()
    await member.page.locator("main > div").first().screenshot({
      path: "/tmp/product-test/void-chat-workspace.png",
      animations: "disabled",
    })
    await member.page.setViewportSize({ width: 390, height: 844 })
    expect(
      await member.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await member.page.screenshot({
      path: "/tmp/product-test/void-chat-workspace-mobile.png",
      animations: "disabled",
    })
    await member.page.setViewportSize({ width: 1440, height: 900 })

    for (const replyToId of [crypto.randomUUID(), second.id]) {
      const target = replyToId === second.id ? "general" : channel
      expect(
        (
          await member.page.request.post(`${origin}/api/channels/${target}/messages`, {
            headers,
            data: { id: crypto.randomUUID(), text: "invalid reference", replyToId },
          })
        ).status(),
      ).toBe(400)
    }
    expect(
      (
        await owner.page.request.delete(`${origin}/api/channels/${channel}/messages/${first.id}`, {
          headers,
          data: { revision: 0 },
        })
      ).status(),
    ).toBe(200)
    const replyRow = member.page
      .locator('[data-slot="message"]')
      .filter({ has: member.page.getByText("承知しました。資料を準備します。", { exact: true }) })
    await expect(replyRow.getByLabel("返信元")).toContainText("この投稿は削除されました")
    expect(
      (
        await member.page.request.post(`${origin}/api/channels/${channel}/messages`, {
          headers,
          data: { id: crypto.randomUUID(), text: "deleted reference", replyToId: first.id },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await member.page.request.post(`${origin}/api/channels/${channel}/messages`, {
          headers,
          data: { id: requestId, text: replies[0].text, replyToId: third.id },
        })
      ).status(),
    ).toBe(409)
    for (let index = 0; index < 20; index++)
      expect(
        (
          await owner.page.request.post(`${origin}/api/channels/${channel}/messages`, {
            headers,
            data: {
              id: crypto.randomUUID(),
              text: `履歴の確認 ${index} — 連絡を確認してから次の作業に進めます。`,
            },
          })
        ).status(),
      ).toBe(201)
    await expect.poll(async () => (await activity()).unreadCount).toBe(0)
    const history = member.page.getByLabel("メッセージ履歴", { exact: true })
    await history.evaluate((node) => {
      node.scrollTop = 0
    })
    await expect
      .poll(() =>
        history.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop),
      )
      .toBeGreaterThan(100)
    await owner.page.request.post(`${origin}/api/channels/${channel}/messages`, {
      headers,
      data: { id: crypto.randomUUID(), text: "履歴を読んでいる間の新しい連絡" },
    })
    await expect(
      member.page.getByText("履歴を読んでいる間の新しい連絡", { exact: true }),
    ).toBeAttached()
    await member.page.waitForTimeout(700)
    expect((await activity()).unreadCount).toBe(1)
    await member.page.getByRole("button", { name: "Scroll to end", exact: true }).click()
    await expect.poll(async () => (await activity()).unreadCount).toBe(0)
    expect(
      (await owner.page.request.delete(`${origin}/api/members/${actor.id}`, { headers })).status(),
    ).toBe(200)
    expect(
      (
        await member.page.request.post(`${origin}/api/channel-activity`, {
          headers,
          data: { channelIds: [channel] },
        })
      ).status(),
    ).toBe(401)
    expect((await mark(999)).status()).toBe(401)
  } finally {
    await member.context.close()
    await outsider.context.close()
    await owner.close()
  }
})
