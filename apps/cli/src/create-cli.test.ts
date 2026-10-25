import { describe, expect, it } from "vite-plus/test"
import { createCli } from "./create-cli"

describe("explicit clipboard authentication", () => {
  it("never reads the clipboard without an explicit flag", async () => {
    const reads: string[] = []
    const command = createCli({
      readClipboard: async () => {
        reads.push("read")
        return "secret"
      },
      print: () => {},
      openBrowser: () => {},
    })

    await expect(command.parseAsync(["node", "void-chat", "me"])).rejects.toThrow("--clipboard")
    expect(reads).toEqual([])
  })

  it("does not include a rejected clipboard value in errors", async () => {
    const secret = "sensitive-value-not-a-token"
    const command = createCli({
      readClipboard: async () => secret,
      print: () => {},
      openBrowser: () => {},
    })

    await expect(command.parseAsync(["node", "void-chat", "--clipboard", "me"])).rejects.toThrow(
      "有効なトークンがありません",
    )
  })

  it("opens initialization in the browser without reading or printing the key", async () => {
    const reads: string[] = []
    const urls: string[] = []
    const output: unknown[] = []
    const command = createCli({
      readClipboard: async () => {
        reads.push("read")
        return "secret"
      },
      print: (value) => {
        output.push(value)
      },
      openBrowser: (url) => {
        urls.push(url)
      },
    })

    await command.parseAsync(["node", "void-chat", "initialize"])
    expect(reads).toEqual([])
    expect(urls).toEqual(["http://app.void.stack.localhost"])
    expect(JSON.stringify(output)).not.toContain("secret")
  })
})
