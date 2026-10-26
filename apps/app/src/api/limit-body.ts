import { createMiddleware } from "hono/factory"

export function limitBody(maximum: number) {
  return createMiddleware(async (context, next) => {
    const body = context.req.raw.body
    if (!body) return next()
    const reject = () => context.json({ error: "リクエストが大きすぎます" }, 413)
    const reader = body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maximum) {
          await reader.cancel().catch(() => undefined)
          return reject()
        }
        chunks.push(new Uint8Array(chunk.value))
      }
    } finally {
      reader.releaseLock()
    }
    context.req.raw = new Request(context.req.raw, {
      method: context.req.method,
      body: new Blob(chunks),
    })
    return next()
  })
}
