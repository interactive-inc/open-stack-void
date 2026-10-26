import { it, expect } from "vite-plus/test"
import { Hono } from "hono"
import { limitBody } from "@/api/limit-body"

it("bounds both declared and streamed bodies and cancels without invoking the handler", async () => {
  let called = 0,
    cancelled = 0
  const app = new Hono().use("*", limitBody(4)).post("/", async (context) => {
    called++
    return context.text(await context.req.text())
  })
  const stream = () =>
    new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([120, 120, 120]))
      },
      cancel() {
        cancelled++
      },
    })
  for (const length of [null, "6"]) {
    const headers = new Headers()
    if (length) headers.set("Content-Length", length)
    const init = { method: "POST", headers, body: stream(), duplex: "half" }
    expect((await app.request(new Request("http://localhost/", init))).status).toBe(413)
  }
  expect(called).toBe(0)
  expect(cancelled).toBe(2)
  const accepted = await app.request("/", { method: "POST", body: "1234" })
  expect(accepted.status).toBe(200)
  expect(await accepted.text()).toBe("1234")
  expect(called).toBe(1)
})
