import { it, expect } from "vite-plus/test"
import { validateAttachment } from "@/contexts/chat/domain/attachment"
import { attachmentLimit } from "@/contexts/chat/domain/attachment-limits"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"

function input(
  name = "note.txt",
  mediaType = "text/plain",
  data = new TextEncoder().encode("hello").buffer,
) {
  return { id: crypto.randomUUID(), name, mediaType, data }
}
it("bounds bytes, rejects unsafe paths and checks declared content signatures", () => {
  for (const name of [
    "../file.txt",
    "folder/file.txt",
    "folder\\file.txt",
    "line\r\nbreak.txt",
    "\u202eevil.txt",
    "",
    "x".repeat(121),
  ])
    expect(validateAttachment(input(name))).toBeInstanceOf(ChatFailed)
  expect(
    validateAttachment(input("large.txt", "text/plain", new ArrayBuffer(attachmentLimit + 1))),
  ).toMatchObject({ reason: "too-large" })
  expect(validateAttachment(input("empty.txt", "text/plain", new ArrayBuffer(0)))).toMatchObject({
    reason: "invalid",
  })
  for (const mediaType of [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "text/html",
    "application/javascript",
  ])
    expect(validateAttachment(input("file", mediaType))).toMatchObject({ reason: "invalid" })
  expect(
    validateAttachment(input("file", "text/plain", new Uint8Array([0xff, 0xfe]).buffer)),
  ).toBeInstanceOf(ChatFailed)
  expect(
    validateAttachment(input("file", "text/plain", new Uint8Array([0]).buffer)),
  ).toBeInstanceOf(ChatFailed)
})
it("canonicalizes download extensions and preserves inert UTF-8 text including HTML-looking content", () => {
  expect(
    validateAttachment(
      input(
        "<script>.html",
        "text/plain",
        new TextEncoder().encode("<script>alert(1)</script>\n日本語").buffer,
      ),
    ),
  ).toEqual({ name: "<script>.txt", mediaType: "text/plain" })
  expect(
    validateAttachment(
      input(
        "limit.txt",
        "text/plain",
        new TextEncoder().encode("x".repeat(attachmentLimit)).buffer,
      ),
    ),
  ).not.toBeInstanceOf(ChatFailed)
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  ).buffer
  expect(validateAttachment(input("photo.html", "image/png", png))).toEqual({
    name: "photo.png",
    mediaType: "image/png",
  })
})
