import { request } from "node:http"

/** Never let Portless mistake an unrelated listener for its own proxy. */
export function assertProxyPort(port) {
  return new Promise((resolve, reject) => {
    const probe = request(
      { hostname: "127.0.0.1", port, path: "/", method: "HEAD", timeout: 1500 },
      (response) => {
        response.resume()
        if (response.headers["x-portless"] === "1") resolve()
        else
          reject(
            new Error(
              `Loopback port ${port} belongs to another service; it is not a Portless proxy. No service was stopped or replaced.`,
            ),
          )
      },
    )
    probe.on("error", (error) => {
      if (error.code === "ECONNREFUSED") resolve()
      else reject(error)
    })
    probe.on("timeout", () =>
      probe.destroy(new Error(`Cannot identify the listener on loopback port ${port}`)),
    )
    probe.end()
  })
}
