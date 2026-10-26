import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { resolve, sep } from "node:path"

test("a fresh checkout keeps LF even with Windows autocrlf enabled", () => {
  const local = resolve(".local")
  mkdirSync(local, { recursive: true })
  const temporary = mkdtempSync(resolve(local, "line-endings-"))
  if (!resolve(temporary).startsWith(`${local}${sep}`))
    throw new Error("Refusing fixture outside .local")
  const source = resolve(temporary, "source")
  const checkout = resolve(temporary, "checkout")
  mkdirSync(source)
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "core.autocrlf=true", "-c", "core.hooksPath=disabled-hooks", ...args],
      { cwd: source, stdio: "pipe" },
    )
  try {
    git("init", "-q")
    writeFileSync(resolve(source, ".gitattributes"), readFileSync(".gitattributes"))
    writeFileSync(resolve(source, "example.ts"), 'export const name = "fixture"\n')
    git("add", ".")
    git(
      "-c",
      "user.name=Harness fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-qm",
      "test: line ending fixture",
    )
    git("clone", "--quiet", source, checkout)
    assert.equal(
      readFileSync(resolve(checkout, "example.ts"), "utf8"),
      'export const name = "fixture"\n',
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
