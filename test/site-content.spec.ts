import { packageBin } from "../scripts/package-bin.mjs"
import { test, expect } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { writeFileSync, readFileSync } from "node:fs"

const sample = JSON.parse(readFileSync("apps/site/seed/seed.json", "utf8"))
const contentCount = Object.values(sample.content).reduce<number>(
  (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
  0,
)

const site = "http://localhost:4322"
const api = "http://127.0.0.1:4322"
const executable = packageBin("apps/site", "emdash")

function cms(...args: string[]) {
  return JSON.parse(
    execFileSync(process.execPath, [executable, "content", ...args, "--url", api], {
      cwd: resolve("apps/site"),
      encoding: "utf8",
      timeout: 20000,
      stdio: "pipe",
    }),
  )
}

function seed() {
  const output = execFileSync(
    process.execPath,
    [resolve("node_modules/vite-plus/bin/vp"), "run", "seed:site"],
    {
      encoding: "utf8",
      env: { ...process.env, VOID_SITE_SEED_URL: api },
      stdio: "pipe",
    },
  )
  const summary = output.split(/\r?\n/).find((line) => line.startsWith('{"content":'))
  if (!summary) throw new Error("Seed did not return its result")
  return JSON.parse(summary)
}

test.describe.configure({ mode: "serial" })

test("EmDash seed preserves edits and public content follows the publishing lifecycle", async ({
  page,
  browser,
}) => {
  expect(
    (
      await page.request.post(`${api}/_emdash/api/setup/local-seed`, {
        headers: { Origin: "http://untrusted.localhost" },
      })
    ).status(),
  ).toBe(403)
  expect((await page.goto(`${site}/about`))?.status()).toBe(404)
  expect(seed().content).toMatchObject({ created: contentCount, updated: 0 })
  expect(seed().content).toMatchObject({ created: 0, skipped: contentCount, updated: 0 })
  await page.goto(site)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex")
  await expect(
    page.getByRole("heading", { name: "仕事の連絡を、ひとつの会話に。", exact: true }),
  ).toBeVisible()
  const screenshot = page.getByRole("img", {
    name: "Void Chatの会話画面。仕事の連絡に返信元を添えて返事を送る。",
    exact: true,
  })
  await screenshot.scrollIntoViewIfNeeded()
  await expect
    .poll(() => screenshot.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({
    path: "/tmp/product-test/void-chat-site-desktop.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot.scrollIntoViewIfNeeded()
  await expect
    .poll(() => screenshot.evaluate((image) => (image as HTMLImageElement).currentSrc))
    .toContain("chat-workspace-mobile.png")
  await expect
    .poll(() => screenshot.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({
    path: "/tmp/product-test/void-chat-site-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  expect((await page.goto(`${site}/about`))?.status()).toBe(200)
  await expect(page.getByRole("heading", { name: "Void Chat について" })).toBeVisible()
  await expect(page.getByText(/仕事の連絡や相談/)).toBeVisible()
  const before = cms("get", "pages", "about", "--raw")
  cms(
    "update",
    "pages",
    "about",
    "--rev",
    before._rev,
    "--data",
    JSON.stringify({ title: "CMS で編集した概要" }),
  )
  expect(seed().content).toMatchObject({ created: 0, updated: 0, skipped: contentCount })
  await page.reload()
  await expect(page.getByRole("heading", { name: "CMS で編集した概要" })).toBeVisible()
  const home = cms("get", "pages", "home", "--raw")
  cms(
    "update",
    "pages",
    "home",
    "--rev",
    home._rev,
    "--data",
    JSON.stringify({ title: "CMS から更新したトップ" }),
  )
  await page.goto(site)
  await expect(page.getByRole("heading", { name: "CMS から更新したトップ" })).toBeVisible()
  const draft = cms(
    "create",
    "posts",
    "--slug",
    "publishing-lifecycle",
    "--draft",
    "--data",
    JSON.stringify({ title: "下書き検証記事", content: "下書き本文" }),
  )
  expect(draft.status).toBe("draft")
  expect((await page.goto(`${site}/posts/publishing-lifecycle`))?.status()).toBe(404)
  await page.goto(`${site}/posts`)
  await expect(page.getByRole("link", { name: "下書き検証記事" })).toHaveCount(0)
  cms("publish", "posts", draft.id)
  await page.reload()
  await page.getByRole("link", { name: "下書き検証記事" }).click()
  await expect(page.getByRole("heading", { name: "下書き検証記事" })).toBeVisible()
  await expect(page.getByText("下書き本文", { exact: true })).toBeVisible()
  const published = cms("get", "posts", draft.id, "--raw")
  cms(
    "update",
    "posts",
    draft.id,
    "--rev",
    published._rev,
    "--data",
    JSON.stringify({ title: "公開記事の更新", content: "更新後の本文" }),
  )
  await page.reload()
  await expect(page.getByRole("heading", { name: "公開記事の更新" })).toBeVisible()
  await expect(page.getByText("更新後の本文", { exact: true })).toBeVisible()
  await page.goto(site)
  await expect(page.getByRole("link", { name: "公開記事の更新" })).toBeVisible()
  cms("unpublish", "posts", draft.id)
  expect((await page.goto(`${site}/posts/publishing-lifecycle`))?.status()).toBe(404)
  for (const path of ["/", "/posts"]) {
    await page.goto(site + path)
    await expect(page.getByRole("link", { name: "公開記事の更新" })).toHaveCount(0)
  }
  cms("unpublish", "posts", "welcome")
  expect(seed().content.updated).toBe(0)
  expect((await page.goto(`${site}/posts/welcome`))?.status()).toBe(404)
  cms("publish", "posts", "welcome")
  const editing = await browser.newPage()
  await editing.goto(`${api}/_emdash/api/setup/dev-bypass?content=0&redirect=/_emdash/admin`)
  await editing.getByText("はじめる", { exact: true }).click()
  await editing.goto(`${api}/_emdash/admin/content/posts`)
  await expect(editing.getByText("構成と拡張方法", { exact: true }).first()).toBeVisible()
  await editing.getByText("構成と拡張方法", { exact: true }).first().click()
  await expect(editing.locator("input").filter({ visible: true }).first()).toBeVisible()
  await editing.getByRole("textbox", { name: "Title", exact: true }).fill("管理画面で更新した記事")
  await editing.getByRole("textbox", { name: "Title", exact: true }).blur()
  await expect
    .poll(() => cms("get", "posts", "architecture", "--raw").data.title)
    .toBe("管理画面で更新した記事")
  await page.goto(`${site}/posts/architecture`)
  await expect(page.getByRole("heading", { name: "構成と拡張方法" })).toBeVisible()
  await editing.getByRole("button", { name: "Publish changes", exact: true }).click()
  const publishing = editing.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/publish") &&
      response.request().method() === "POST",
  )
  await editing.getByRole("button", { name: "Publish changes", exact: true }).last().click()
  expect((await publishing).status()).toBe(200)
  await editing.screenshot({ path: ".local/cms-article-editor.png" })
  await editing.close()
  await page.goto(`${site}/posts/architecture`)
  await expect(page.getByRole("heading", { name: "管理画面で更新した記事" })).toBeVisible()
})

test("all public navigation and guide links resolve after CMS publication", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const visited = new Set<string>()
  const pending = [site + "/"]
  const report: Array<{ source: string; target: string; status: number }> = []
  while (pending.length) {
    const source = pending.shift()!
    if (visited.has(source)) continue
    visited.add(source)
    expect((await page.goto(source))?.status()).toBe(200)
    expect((await page.reload())?.status()).toBe(200)
    await expect(page.locator("main")).not.toBeEmpty()
    const links = await page
      .locator("a[href]")
      .evaluateAll((elements) =>
        elements.map((element) => ({ href: element.href, text: element.textContent?.trim() })),
      )
    for (const link of links) {
      expect(link.href).not.toMatch(/localhost:(5173|4321)/)
      if (link.href.startsWith("https://github.com/")) {
        expect(link.href).toMatch(
          /^https:\/\/github\.com\/interactive-inc\/open-stack-void(?:\/|$)/,
        )
        continue
      }
      if (!link.href.startsWith(site + "/") && link.href !== "http://localhost:5184/")
        throw new Error(`Unexpected link: ${link.href}`)
      await page.goto(source)
      const anchor = page.getByRole("link", { name: link.text, exact: true }).first()
      const navigation = page.waitForEvent("response", (response) =>
        response.request().isNavigationRequest(),
      )
      await anchor.click()
      const response = await navigation
      expect(response.status()).toBe(200)
      await expect(page).toHaveURL(link.href)
      report.push({ source, target: link.href, status: response.status() })
      if (link.href.startsWith(site + "/") && !visited.has(link.href)) pending.push(link.href)
    }
  }
  for (const guide of [
    "guide",
    "getting-started",
    "using-chat",
    "channels",
    "inviting-members",
    "account-security",
    "troubleshooting",
    "command-line",
    "assistant-connection",
  ])
    expect(visited).toContain(`${site}/${guide}`)
  expect(visited).toContain(site + "/posts")
  expect(visited).toContain(site + "/about")
  expect(visited).toContain(site + "/posts/welcome")
  expect(visited).toContain(site + "/category/general")
  expect(visited).toContain(site + "/tag/example")
  expect((await page.goto(`${site}/missing-page`))?.status()).toBe(404)
  expect((await page.goto(`${site}/posts/missing-post`))?.status()).toBe(404)
  writeFileSync(".local/site-link-audit.json", JSON.stringify(report, null, 2))
})
