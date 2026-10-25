import { test } from "node:test"
import assert from "node:assert/strict"
import { assertReleaseAge } from "./release-policy.mjs"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"

const now = Date.parse("2026-10-26T00:00:00Z")
test("accepts a publication at least 24 hours old", () => {
  assert.doesNotThrow(() => assertReleaseAge("sample", "1.0.0", "2026-10-25T00:00:00Z", now))
})
test("rejects releases inside the 24-hour window", () => {
  assert.throws(() => assertReleaseAge("sample", "1.0.0", "2026-10-25T00:00:01Z", now))
})
test("rejects absent or invalid publication metadata", () => {
  for (const timestamp of [undefined, null, "", "invalid", 0])
    assert.throws(() => assertReleaseAge("sample", "1.0.0", timestamp, now))
})
test("rejects future publications", () => {
  assert.throws(() => assertReleaseAge("sample", "1.0.0", "2026-10-27T00:00:00Z", now))
})

for (const publication of [new Date(Date.now() + 86_400_000).toISOString(), undefined]) {
  test(`rejects ${publication ? "ineligible" : "unknown-date"} dependencies before npm or dependency scripts execute`, () => {
    mkdirSync(".local", { recursive: true })
    const fixture = mkdtempSync(resolve(".local/policy-fixture-"))
    mkdirSync(`${fixture}/scripts`)
    for (const file of [
      "prepare-local.mjs",
      "check-lock-age.mjs",
      "release-policy.mjs",
      "package-bin.mjs",
    ])
      copyFileSync(new URL(file, import.meta.url), `${fixture}/scripts/${file}`)
    writeFileSync(
      `${fixture}/package-lock.json`,
      JSON.stringify({
        packages: {
          "node_modules/policy-fixture": {
            version: "1.0.0",
            resolved: "https://registry.npmjs.org/policy-fixture/-/policy-fixture-1.0.0.tgz",
            integrity: "sha512-fixture",
          },
        },
      }),
    )
    writeFileSync(
      `${fixture}/metadata.mjs`,
      `globalThis.fetch = async () => Response.json(${JSON.stringify({ time: publication ? { "1.0.0": publication } : {} })})`,
    )
    const marker = `${fixture}/dependency-script-executed`
    mkdirSync(`${fixture}/node_modules/vite-plus/bin`, { recursive: true })
    writeFileSync(`${fixture}/node_modules/vite-plus/package.json`, '{"type":"module"}')
    writeFileSync(
      `${fixture}/node_modules/vite-plus/bin/vp`,
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed')`,
    )
    const result = spawnSync(process.execPath, [`${fixture}/scripts/prepare-local.mjs`], {
      encoding: "utf8",
      env: {
        ...process.env,
        npm_execpath: `${fixture}/npm-cli.mjs`,
        NODE_OPTIONS: `--import=${pathToFileURL(`${fixture}/metadata.mjs`).href}`,
      },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Release-age policy rejected policy-fixture@1.0.0/)
    assert.equal(existsSync(marker), false)
  })
}
