import { it, expect } from "vite-plus/test"
import { VoidChatClient } from "@open-stack/sdk"
import { nodeFetch } from "@open-stack/sdk/node-fetch"
import { createServer } from "node:http"

it("does not serialize an oversized upload and cancels an oversized download stream", async () => {
  let requests = 0
  let cancelled = false
  const client = new VoidChatClient({
    baseUrl: "http://localhost:5183",
    token: null,
    request: async () => {
      requests++
      return new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(64 * 1024))
          },
          cancel() {
            cancelled = true
          },
        }),
      )
    },
  })
  await expect(
    client.uploadAttachment(
      "general",
      "large.txt",
      new Blob([new Uint8Array(512 * 1024 + 1)], { type: "text/plain" }),
    ),
  ).rejects.toMatchObject({ status: 413 })
  expect(requests).toBe(0)
  await expect(client.downloadAttachment("general", crypto.randomUUID())).rejects.toMatchObject({
    status: 413,
  })
  expect(cancelled).toBe(true)
})

it("bounds loopback multipart serialization and response buffering", async () => {
  const form = new FormData()
  form.set("file", new Blob([new Uint8Array(512 * 1024 + 16_384 + 1)]), "large.bin")
  await expect(
    nodeFetch("http://app.void.stack.localhost:1/api/attachments", { method: "POST", body: form }),
  ).rejects.toThrow("payload limit")
  const server = createServer((_, response) => {
    response.writeHead(200)
    response.end(Buffer.alloc(2 * 1024 * 1024 + 1, 120))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing test listener")
    await expect(
      nodeFetch(`http://app.void.stack.localhost:${address.port}/large`),
    ).rejects.toThrow("response size limit")
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
