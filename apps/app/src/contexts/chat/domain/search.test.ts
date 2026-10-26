import { it, expect } from "vite-plus/test"
import { searchInputSchema, searchSnippet } from "@/contexts/chat/domain/search"

it("bounds literal queries, rejects foreign scope and renders bounded plain snippets", () => {
  expect(searchInputSchema.safeParse({ q: " ", workspace: "other" }).success).toBe(false)
  expect(searchInputSchema.safeParse({ q: "x".repeat(101) }).success).toBe(false)
  expect(searchInputSchema.safeParse({ q: "x", before: -1 }).success).toBe(false)
  expect(searchInputSchema.parse({ q: "  %_日本語  ", until: 0 })).toEqual({
    q: "%_日本語",
    until: 0,
  })
  const text = `${"x".repeat(300)}<script>alert(1)</script>${"z".repeat(300)}`
  const snippet = searchSnippet(text, "<script>")
  expect(snippet).toContain("<script>alert(1)</script>")
  expect(snippet.length).toBeLessThanOrEqual(242)
  expect(snippet.startsWith("…")).toBe(true)
})
