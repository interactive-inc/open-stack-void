import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"

const environmentFile = fileURLToPath(new URL("../apps/app/.env", import.meta.url))
const existing = existsSync(environmentFile) ? readFileSync(environmentFile, "utf8") : ""
const existingToken = existing.match(/^BOOTSTRAP_TOKEN=(.+)$/m)?.[1]
const token = existingToken ?? randomBytes(32).toString("hex")

if (!existingToken)
  writeFileSync(
    environmentFile,
    `${existing}\nAPP_ORIGIN=http://app.void.stack.localhost\nADMIN_EMAIL=owner@example.com\nBOOTSTRAP_TOKEN=${token}\n`,
    { mode: 0o600 },
  )

console.log(
  "Owner setup: http://app.void.stack.localhost/ — enter BOOTSTRAP_TOKEN from apps/app/.env in the browser.",
)
console.log("Site: http://void.stack.localhost/_emdash/admin")
