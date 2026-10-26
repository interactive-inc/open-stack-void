import { z } from "zod"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"

import { attachmentLimit } from "@/contexts/chat/domain/attachment-limits"
export const attachmentSchema = z.object({
  id: z.uuid(),
  channelId: z.string(),
  messageId: z.uuid(),
  memberId: z.string(),
  name: z.string(),
  mediaType: z.string(),
  size: z.number().int().positive(),
  sequence: z.number().int().positive(),
  createdAt: z.number(),
})
export type Attachment = z.infer<typeof attachmentSchema>
export type AttachmentSubmission = {
  id: string
  name: string
  mediaType: string
  data: ArrayBuffer
}

export function validateAttachment(
  input: AttachmentSubmission,
): { name: string; mediaType: string } | ChatFailed {
  if (
    !z.uuid().safeParse(input.id).success ||
    !input.name.trim() ||
    input.name.length > 120 ||
    /[\\/]/u.test(input.name) ||
    [...input.name].some((character) => {
      const code = character.codePointAt(0) ?? 0
      return (
        code < 32 ||
        code === 127 ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      )
    })
  )
    return new ChatFailed("invalid")
  if (input.data.byteLength > attachmentLimit) return new ChatFailed("too-large")
  if (!input.data.byteLength) return new ChatFailed("invalid")
  const bytes = new Uint8Array(input.data)
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value)
  let extension: string
  switch (input.mediaType) {
    case "image/png":
      if (
        bytes.length < 24 ||
        !starts([137, 80, 78, 71, 13, 10, 26, 10]) ||
        new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR"
      )
        return new ChatFailed("invalid")
      extension = "png"
      break
    case "image/jpeg":
      if (
        bytes.length < 4 ||
        !starts([255, 216, 255]) ||
        bytes.at(-2) !== 255 ||
        bytes.at(-1) !== 217
      )
        return new ChatFailed("invalid")
      extension = "jpg"
      break
    case "image/webp": {
      const header = new TextDecoder().decode(bytes.slice(0, 16))
      if (
        bytes.length < 20 ||
        !header.startsWith("RIFF") ||
        header.slice(8, 12) !== "WEBP" ||
        !["VP8 ", "VP8L", "VP8X"].includes(header.slice(12, 16)) ||
        new DataView(input.data).getUint32(4, true) !== bytes.length - 8
      )
        return new ChatFailed("invalid")
      extension = "webp"
      break
    }
    case "text/plain":
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        for (const character of text) {
          const code = character.codePointAt(0) ?? 0
          if ((code < 32 && ![9, 10, 13].includes(code)) || code === 127)
            return new ChatFailed("invalid")
        }
      } catch {
        return new ChatFailed("invalid")
      }
      extension = "txt"
      break
    default:
      return new ChatFailed("invalid")
  }
  const stem =
    input.name
      .trim()
      .replace(/\.[^.]*$/, "")
      .slice(0, 100) || "attachment"
  return { name: `${stem}.${extension}`, mediaType: input.mediaType }
}
