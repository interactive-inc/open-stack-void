import type { APIRoute } from "astro"
import { applySeed, getSiteSettings, setSiteSettings } from "emdash"
import sample from "@seed"
import { isSeedFile } from "@/utils/is-seed-file"

export const POST: APIRoute = async (context) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 })
  if (
    context.url.hostname !== "127.0.0.1" ||
    context.request.headers.get("origin") !== context.url.origin ||
    ![null, "none", "same-origin"].includes(context.request.headers.get("sec-fetch-site"))
  )
    return new Response(null, { status: 403 })
  if (!isSeedFile(sample)) return new Response("Invalid bundled seed", { status: 500 })
  const settings = await getSiteSettings()
  const users = await context.locals.emdash.db.selectFrom("users").select("id").limit(1).execute()
  if (
    users.length === 0 &&
    settings?.title === "Void Chat" &&
    settings?.tagline === "会話から、つくる。"
  )
    await setSiteSettings(sample.settings ?? {}, context.locals.emdash.db)
  const result = await applySeed(
    context.locals.emdash.db,
    {
      version: "1",
      content: sample.content,
      taxonomies: sample.taxonomies,
    },
    { includeContent: true, onConflict: "skip", skipMediaDownload: true },
  )
  return Response.json({ content: result.content }, { headers: { "Cache-Control": "no-store" } })
}
