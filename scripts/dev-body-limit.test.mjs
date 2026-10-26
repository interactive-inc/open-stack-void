import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer, request } from "node:http"
import { devBodyLimit } from "./dev-body-limit.ts"

test(
  "development ingress bounds declared and chunked input without consuming accepted bytes",
  { timeout: 10000 },
  async () => {
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
              response.on("error", reject)
              if (size > 1024) {
                response.pause()
                setTimeout(() => response.resume(), 300)
              }
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
  },
)

test(
  "rejected ingress stops discarding at its byte budget and closes incomplete input",
  { timeout: 10000 },
  async () => {
    const guard = devBodyLimit(() => 1024)
    let received = 0
    const server = createServer((incoming, response) => {
      incoming.prependListener("data", (chunk) => {
        received += chunk.length
      })
      guard(incoming, response, () => {})
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      assert(address && typeof address !== "string")
      const closed = new Promise((resolve) =>
        server.once("connection", (socket) => socket.once("close", resolve)),
      )
      const result = await new Promise((resolve, reject) => {
        const outgoing = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/api/test",
            method: "POST",
            headers: { "Content-Length": String(8 * 1024 * 1024) },
          },
          (response) => {
            response.on("error", reject)
            response.resume()
            response.on("end", () => resolve(response.statusCode))
          },
        )
        outgoing.on("error", reject)
        outgoing.end(Buffer.alloc(8 * 1024 * 1024, 120))
      })
      assert.equal(result, 413)
      await closed
      assert(received <= 4 * 1024 * 1024 + 128 * 1024)
    } finally {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
)

test(
  "slow chunked rejection delivers 413 and releases the connection within its deadline",
  { timeout: 10000 },
  async () => {
    const guard = devBodyLimit(() => 1024)
    let received = 0
    const server = createServer((incoming, response) => {
      incoming.prependListener("data", (chunk) => {
        received += chunk.length
      })
      guard(incoming, response, () => incoming.on("data", () => {}))
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    let trickle
    try {
      const address = server.address()
      assert(address && typeof address !== "string")
      const closed = new Promise((resolve) =>
        server.once("connection", (socket) => socket.once("close", resolve)),
      )
      const status = await new Promise((resolve, reject) => {
        const outgoing = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/api/test",
            method: "POST",
            headers: { "Transfer-Encoding": "chunked" },
          },
          (response) => {
            response.on("error", reject)
            response.resume()
            response.on("end", () => resolve(response.statusCode))
          },
        )
        outgoing.on("error", reject)
        outgoing.write(Buffer.alloc(1025, 120))
        trickle = setInterval(() => outgoing.write("x"), 250)
      })
      assert.equal(status, 413)
      await closed
      assert(received < 2048)
    } finally {
      clearInterval(trickle)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
)
