import { z } from "zod"

export const searchInputSchema = z
  .object({
    q: z.string().trim().min(1).max(100),
    before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    until: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict()

export function searchSnippet(text: string, query: string) {
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, index - 60)
  return `${start ? "…" : ""}${text.slice(start, start + 240)}${start + 240 < text.length ? "…" : ""}`
}
