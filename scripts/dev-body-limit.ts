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
    const reject = () => {
      if (response.headersSent) return
      response.writeHead(413, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Connection: "close",
      })
      response.end(JSON.stringify({ error: "リクエストが大きすぎます" }))
    }
    if (
      !request.headers["transfer-encoding"] &&
      Number(request.headers["content-length"]) > maximum
    ) {
      reject()
      return
    }
    let size = 0
    const count = (chunk: Buffer | string) => {
      size += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength
      if (size > maximum) reject()
    }
    // Observe before the bridge, without putting the request into flowing mode ourselves.
    request.prependListener("data", count)
    response.once("close", () => request.off("data", count))
    next()
  }
}
