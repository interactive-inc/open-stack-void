import type { Connect } from "vite"

export function devBodyLimit(
  limit: (method: string, path: string) => number,
): Connect.NextHandleFunction {
  return (request, response, next) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/"
    if (
      !(path === "/api" || path.startsWith("/api/")) ||
      ["GET", "HEAD"].includes(request.method ?? "GET")
    )
      return next()
    const maximum = limit(request.method ?? "GET", path)
    const discardMaximum = 4 * 1024 * 1024
    let size = 0
    let rejected = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    const reject = () => {
      if (rejected || response.headersSent) return
      rejected = true
      deadline = setTimeout(() => request.destroy(), 2000)
      deadline.unref()
      response.writeHead(413, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Connection: "keep-alive",
      })
      response.end(JSON.stringify({ error: "リクエストが大きすぎます" }))
    }
    const count = (chunk: Buffer | string) => {
      size += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength
      if (size > maximum) reject()
      if (rejected && size > discardMaximum) request.pause()
    }
    // Observe before the bridge, without putting the request into flowing mode ourselves.
    request.prependListener("data", count)
    const cleanup = () => {
      if (deadline) clearTimeout(deadline)
      request.off("data", count)
    }
    request.once("end", cleanup)
    request.once("aborted", cleanup)
    request.once("error", cleanup)
    if (
      !request.headers["transfer-encoding"] &&
      Number(request.headers["content-length"]) > maximum
    ) {
      reject()
      request.resume()
      return
    }
    next()
  }
}
