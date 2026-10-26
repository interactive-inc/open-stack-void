import { it, expect } from "vite-plus/test"
import { UploadAttachment } from "@/contexts/chat/application/upload-attachment"
import type { Member } from "@/contexts/membership/domain/member"

it("rejects inactive and mismatched actors before storage, and allows all active public-channel members", async () => {
  const member: Member = {
    id: "member",
    name: "Member",
    email: "member@example.com",
    role: "member",
    status: "active",
    createdAt: 0,
  }
  const principal = { memberId: member.id, sessionHash: "synthetic", kind: "browser" }
  const input = {
    id: crypto.randomUUID(),
    name: "note.html",
    mediaType: "text/plain",
    data: new TextEncoder().encode("hello").buffer,
  }
  const writes: unknown[] = []
  const upload = new UploadAttachment({
    create: async (channelId, actor, file) => {
      writes.push(file)
      return {
        id: file.id,
        channelId,
        messageId: file.id,
        memberId: actor.memberId,
        name: file.name,
        mediaType: file.mediaType,
        size: file.data.byteLength,
        sequence: 1,
        createdAt: 0,
      }
    },
  })
  expect(
    await upload.execute({ ...member, status: "disabled" }, principal, "general", input),
  ).toMatchObject({ reason: "forbidden" })
  expect(
    await upload.execute({ ...member, id: "other" }, principal, "general", input),
  ).toMatchObject({ reason: "forbidden" })
  expect(
    await upload.execute(member, principal, "general", { ...input, mediaType: "text/html" }),
  ).toMatchObject({ reason: "invalid" })
  expect(writes).toHaveLength(0)
  for (const role of ["member", "admin", "owner"] as const)
    expect(await upload.execute({ ...member, role }, principal, "general", input)).toMatchObject({
      name: "note.txt",
    })
  expect(writes).toHaveLength(3)
})
