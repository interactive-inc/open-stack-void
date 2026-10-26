import { request } from "node:http"

/** Resolve the named local app on loopback without changing system DNS. */
export function nodeFetch(input: string, options: RequestInit = {}): Promise<Response> {
  const url = new URL(input)
  if (url.protocol !== "http:" || url.hostname !== "app.void.stack.localhost")
    return fetch(input, options)
  if (options.body instanceof FormData) {
    let size = 0
    let fields = 0
    for (const [name, value] of options.body) {
      if (
        ++fields > 4 ||
        name.length > 120 ||
        (typeof value === "string"
          ? value.length > 16_384
          : value.name.length > 120 || value.type.length > 80)
      )
        return Promise.reject(new Error("Local multipart payload limit exceeded"))
      size += typeof value === "string" ? Buffer.byteLength(value) : value.size
      if (size > 512 * 1024 + 16_384)
        return Promise.reject(new Error("Local multipart payload limit exceeded"))
    }
    const serialized = new Request(input, {
      method: options.method ?? "POST",
      headers: options.headers,
      body: options.body,
    })
    return serialized
      .arrayBuffer()
      .then((body) =>
        nodeFetch(input, { ...options, headers: serialized.headers, body: new Uint8Array(body) }),
      )
  }
  if (
    options.body !== undefined &&
    typeof options.body !== "string" &&
    !(options.body instanceof Uint8Array)
  )
    return Promise.reject(new Error("Local requests require a string or binary body"))
  return new Promise((resolve, reject) => {
    const headers = new Headers(options.headers)
    headers.set("Host", url.host)
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? "GET",
        headers: Object.fromEntries(headers),
        signal: options.signal ?? undefined,
      },
      (incoming) => {
        const chunks: Buffer[] = []
        let size = 0
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > 2 * 1024 * 1024) {
            incoming.destroy(new Error("Local response size limit exceeded"))
            return
          }
          chunks.push(chunk)
        })
        incoming.on("error", reject)
        incoming.on("end", () => {
          const responseHeaders = new Headers()
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value)) for (const entry of value) responseHeaders.append(name, entry)
            else if (value !== undefined) responseHeaders.set(name, value)
          }
          const status = incoming.statusCode ?? 500
          resolve(
            new Response(
              [204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks)),
              { status, headers: responseHeaders },
            ),
          )
        })
      },
    )
    outgoing.on("error", reject)
    outgoing.end(options.body)
  })
}
