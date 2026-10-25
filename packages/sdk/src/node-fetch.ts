import { request } from "node:http"

/** Resolve the named local app on loopback without changing system DNS. */
export function nodeFetch(input: string, options: RequestInit = {}): Promise<Response> {
  const url = new URL(input)
  if (url.protocol !== "http:" || url.hostname !== "app.void.stack.localhost")
    return fetch(input, options)
  if (options.body !== undefined && typeof options.body !== "string")
    return Promise.reject(new Error("Local requests require a string body"))
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
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk))
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
