import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)

export async function readClipboard(): Promise<string | Error> {
  try {
    if (process.platform === "win32")
      return (
        await execute(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
          { windowsHide: true, timeout: 5000, maxBuffer: 8192, encoding: "utf8" },
        )
      ).stdout.trim()

    if (process.platform === "darwin")
      return (
        await execute("pbpaste", [], { timeout: 5000, maxBuffer: 8192, encoding: "utf8" })
      ).stdout.trim()

    return (
      await execute("wl-paste", ["--no-newline"], {
        timeout: 5000,
        maxBuffer: 8192,
        encoding: "utf8",
      })
    ).stdout.trim()
  } catch {
    return new Error("クリップボードを利用できません。秘密値をターミナルに入力しないでください")
  }
}
