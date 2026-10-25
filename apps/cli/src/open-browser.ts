import { spawn } from "node:child_process"

export function openBrowser(url: string) {
  const platform = process.platform
  const command =
    platform === "win32" ? "rundll32.exe" : platform === "darwin" ? "open" : "xdg-open"
  const argumentsList = platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url]
  const browser = spawn(command, argumentsList, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })

  browser.on("error", () => {
    console.error("ブラウザを開けませんでした。サーバーのトップページを開いてください")
  })
  browser.unref()
}
