import { defineHandler } from "void"

export const loader = defineHandler((context) => {
  context.header("X-Robots-Tag", "noindex")
  return { authorizationId: context.req.query("authorize") ?? null }
})
