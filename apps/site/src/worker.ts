import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker"
import { setupAccess } from "@/utils/setup-access"

export { PluginBridge }

export default {
  ...handler,
  async fetch(request, env, context) {
    const protectedResponse =
      !import.meta.env.DEV && env.EMDASH_SETUP_LOCKED === "true"
        ? await setupAccess({ request, key: env.EMDASH_SETUP_KEY })
        : null
    const response = protectedResponse ?? (await handler.fetch(request, env, context))
    if (response.status === 101) return response
    const headers = new Headers(response.headers)
    headers.set("X-Robots-Tag", "noindex")
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<{ EMDASH_SETUP_LOCKED?: string; EMDASH_SETUP_KEY?: string }>
