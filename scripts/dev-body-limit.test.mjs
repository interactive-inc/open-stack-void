import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer, request } from "node:http"
import { devBodyLimit } from "./dev-body-limit.ts"

test("development ingress bounds declared and chunked input without consuming accepted bytes", async () => {
  const guard = devBodyLimit(() => 1024)
  const server = createServer((incoming, response) =>
    guard(incoming, response, () => {
      const chunks = []
      incoming.on("data", (chunk) => chunks.push(chunk))
      incoming.on("end", () => {
        if (!response.writableEnded) response.end(Buffer.concat(chunks))
      })
    }),
  )
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    assert(address && typeof address !== "string")
    const send = (size, chunked) =>
      new Promise((resolve, reject) => {
        const outgoing = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/api/test",
            method: "POST",
            headers: chunked
              ? { "Transfer-Encoding": "chunked" }
              : { "Content-Length": String(size) },
          },
          (response) => {
            const chunks = []
            response.on("data", (chunk) => chunks.push(chunk))
            response.on("end", () =>
              resolve({ status: response.statusCode, body: Buffer.concat(chunks) }),
            )
          },
        )
        outgoing.on("error", reject)
        outgoing.setTimeout(5000, () => outgoing.destroy(new Error("Test ingress timeout")))
        if (chunked) {
          for (let offset = 0; offset < size; offset += 256)
            outgoing.write(Buffer.alloc(Math.min(256, size - offset), 120))
          outgoing.end()
        } else outgoing.end(Buffer.alloc(size, 120))
      })
    for (const chunked of [false, true]) {
      assert.equal((await send(2 * 1024 * 1024, chunked)).status, 413)
      const accepted = await send(1024, chunked)
      assert.equal(accepted.status, 200)
      assert.equal(accepted.body.toString(), "x".repeat(1024))
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
