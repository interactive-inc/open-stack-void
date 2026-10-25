import { defineHandler } from "void"

export const loader = defineHandler((context) => ({
  authorizationId: context.req.query("authorize") ?? null,
}))
