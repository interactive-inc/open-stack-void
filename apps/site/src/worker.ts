import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker"
import { setupAccess } from "@/utils/setup-access"

export { PluginBridge }

export default {
  ...handler,
  async fetch(request, env, context) {
    if (!import.meta.env.DEV && env.EMDASH_SETUP_LOCKED === "true") {
      const response = await setupAccess({ request, key: env.EMDASH_SETUP_KEY })

      if (response) return response
    }

    return handler.fetch(request, env, context)
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<{ EMDASH_SETUP_LOCKED?: string; EMDASH_SETUP_KEY?: string }>
