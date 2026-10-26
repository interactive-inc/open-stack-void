import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { assertProxyPort } from "./assert-proxy-port.mjs"

test("foreign listeners are rejected without stopping them; Portless and free ports are accepted", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200)
    response.end()
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  try {
    await assert.rejects(assertProxyPort(port), /another service/)
    assert.equal(server.listening, true)
    server.removeAllListeners("request")
    server.on("request", (request, response) => {
      response.setHeader("X-Portless", "1")
      response.end()
    })
    await assertProxyPort(port)
  } finally {
    server.close()
    await once(server, "close")
  }
  await assertProxyPort(port)
})
