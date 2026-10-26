import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  writeFileSync,
  rmSync,
  copyFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"

const scanner =
  process.env.GITLEAKS_BIN ??
  resolve(".local/tools/gitleaks", process.platform === "win32" ? "gitleaks.exe" : "gitleaks")
mkdirSync(".local", { recursive: true })
const temporary = mkdtempSync(resolve(".local/secret-check-"))
try {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
  for (const path of files) {
    if (!existsSync(path)) continue
    if (lstatSync(path).isSymbolicLink())
      throw new Error(`Review tracked symbolic link before publication: ${path}`)
    if (
      /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(path) &&
      !path.endsWith(".env.example")
    )
      throw new Error(`Private environment file is tracked: ${path}`)
    const target = join(temporary, "tree", path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(path, target)
  }
  writeFileSync(
    join(temporary, "messages.txt"),
    execFileSync("git", ["log", "--all", "--format=%B"]),
  )
  for (const args of [
    ["git", ".", "--log-opts=--all"],
    ["dir", temporary],
  ]) {
    const scan = spawnSync(scanner, [...args, "--redact=100", "--no-banner"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    })
    if (scan.error || scan.status !== 0)
      throw new Error(
        "Secret scan failed or scanner unavailable; publication blocked. Review locally with redaction enabled.",
      )
  }
  writeFileSync(
    ".local/secret-receipt.json",
    JSON.stringify({
      sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      scannedAt: new Date().toISOString(),
    }),
  )
  console.log(`Secret scan passed (reachable history, messages, ${files.length} tracked paths)`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
