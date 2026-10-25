#!/usr/bin/env node
import { createCli } from "./create-cli"
import { readClipboard } from "./read-clipboard"
import { openBrowser } from "./open-browser"

createCli({
  readClipboard,
  openBrowser,
  print: (value) => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  },
})
  .parseAsync()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Command failed")
    process.exitCode = 1
  })
