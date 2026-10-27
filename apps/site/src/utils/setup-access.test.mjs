import { test } from "node:test"
import assert from "node:assert/strict"
import { setupAccess } from "./setup-access.ts"

const origin = "https://site.example"
const key = "synthetic-setup-key"
const setup = "/_emdash/admin/setup"
const api = "/_emdash/api/setup/admin"

function check(path, options = {}, configuredKey = key) {
  return setupAccess({ request: new Request(`${origin}${path}`, options), key: configuredKey })
}

test("setup APIs fail closed while public pages remain accessible", async () => {
  assert.equal(await check("/guide"), null)
  assert.equal((await check(api)).status, 403)
  assert.equal(
    (
      await setupAccess({
        request: new Request(`${origin}${api}`, { headers: { "x-emdash-setup-key": key } }),
        key: undefined,
      })
    ).status,
    403,
  )
  const page = await check(setup)
  assert.equal(page.headers.get("Cache-Control"), "no-store")
  assert.ok((await page.text()).includes('type="password"'))
})

test("unlock requires the matching key and exact request origin", async () => {
  for (const [requestOrigin, value] of [
    ["https://foreign.example", key],
    [origin, "wrong"],
  ]) {
    const response = await check(`${setup}/unlock`, {
      method: "POST",
      headers: { Origin: requestOrigin },
      body: new URLSearchParams({ key: value }),
    })
    assert.equal(response.status, 403)
    assert.equal(response.headers.get("Set-Cookie"), null)
  }
  const response = await check(`${setup}/unlock`, {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({ key }),
  })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get("Location"), setup)
  const cookie = response.headers.get("Set-Cookie")
  for (const flag of ["Secure", "HttpOnly", "SameSite=Strict", "Max-Age=1800", "Path=/_emdash"])
    assert.ok(cookie.includes(flag))
  assert.equal(await check(api, { headers: { Cookie: cookie.split(";")[0] } }), null)
})

test("explicit setup header authorizes the native wizard without URLs containing a key", async () => {
  assert.equal(await check(api, { headers: { "x-emdash-setup-key": key } }), null)
  assert.equal((await check(api, { headers: { "x-emdash-setup-key": "wrong" } })).status, 403)
  assert.equal(
    (await check(api, { headers: { Cookie: "__Secure-open-stack-setup=wrong" } })).status,
    403,
  )
})
