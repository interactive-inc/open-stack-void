import { nodeFetch } from "@open-stack/sdk/node-fetch"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { VoidChatClient } from "@open-stack/sdk"
import { toolResponse } from "./tool-response"
import { BrowserAuthorization } from "./browser-authorization"

const connection: { baseUrl: string; token: string | null; request: typeof nodeFetch } = {
  request: nodeFetch,
  baseUrl: process.env.VOID_CHAT_URL ?? "http://app.void.stack.localhost",
  token: null,
}
const client = new VoidChatClient(connection)
const browserAuthorization = new BrowserAuthorization(connection)
const server = new McpServer({ name: "void-chat", version: "0.1.0" })
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
server.registerTool(
  "search_messages",
  {
    description:
      "Search the selected public channel. Results are plain-text snippets, capped at 50; continue with nextBefore and until. Read the full message with read_message.",
    inputSchema: z.object({
      channel: z.string(),
      q: z.string().trim().min(1).max(100),
      before: z.number().int().positive().optional(),
      until: z.number().int().nonnegative().optional(),
    }),
    annotations: readOnly,
  },
  (input) => toolResponse(() => client.search(input.channel, input.q, input.before, input.until)),
)
server.registerTool(
  "read_message",
  {
    description: "Read a message with current server authorization",
    inputSchema: z.object({ channel: z.string(), id: z.uuid() }),
    annotations: readOnly,
  },
  (input) => toolResponse(() => client.message(input.channel, input.id)),
)
server.registerTool(
  "list_attachments",
  {
    description:
      "List authorized attachment metadata, up to 50 per page; no storage keys or signed URLs",
    inputSchema: z.object({ channel: z.string(), before: z.number().int().positive().optional() }),
    annotations: readOnly,
  },
  (input) => toolResponse(() => client.attachments(input.channel, input.before)),
)
server.registerTool(
  "upload_attachment",
  {
    description:
      "Post a file to a public channel. Supply canonical base64 of PNG/JPEG/WebP/UTF-8 text, up to 512KiB. Reuse requestId after an uncertain response. Authentication is browser-approved; never supply access tokens.",
    inputSchema: z.object({
      channel: z.string(),
      name: z.string().min(1).max(120),
      mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "text/plain"]),
      data: z
        .string()
        .min(1)
        .max(699052)
        .refine(
          (value) =>
            value.length <= 699052 &&
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),
        ),
      requestId: z.uuid(),
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  (input) =>
    toolResponse(() =>
      client.uploadAttachment(
        input.channel,
        input.name,
        new Blob([new Uint8Array(Buffer.from(input.data, "base64"))], { type: input.mediaType }),
        input.requestId,
      ),
    ),
)
server.registerTool(
  "download_attachment",
  {
    description:
      "Read an authorized attachment as base64 data. This returns file content, never a bearer URL or authentication token.",
    inputSchema: z.object({ channel: z.string(), id: z.uuid() }),
    annotations: readOnly,
  },
  (input) =>
    toolResponse(async () => ({
      id: input.id,
      data: Buffer.from(
        await (await client.downloadAttachment(input.channel, input.id)).arrayBuffer(),
      ).toString("base64"),
    })),
)

server.registerTool(
  "rename_profile",
  {
    description: "Change only the authenticated member's display name",
    inputSchema: z.object({ name: z.string().trim().min(1).max(80) }),
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  (input) => toolResponse(() => client.renameProfile(input.name)),
)

server.registerTool(
  "begin_login",
  {
    description:
      "Start browser passkey authentication. Open the returned URL and enter the confirmation code. No credentials are accepted by this tool.",
    inputSchema: z.object({}),
    annotations: { destructiveHint: false },
  },
  () => toolResponse(() => browserAuthorization.begin()),
)
server.registerTool(
  "complete_login",
  {
    description: "Finish the browser-approved login without exposing the access token",
    inputSchema: z.object({}),
    annotations: { destructiveHint: false },
  },
  () => toolResponse(() => browserAuthorization.complete()),
)
server.registerTool(
  "cancel_login",
  {
    description: "Cancel this MCP session’s pending browser login",
    inputSchema: z.object({}),
    annotations: { destructiveHint: false },
  },
  () => toolResponse(() => browserAuthorization.cancel()),
)

server.registerTool(
  "whoami",
  {
    description: "Get the current active member",
    inputSchema: z.object({}),
    annotations: readOnly,
  },
  () => toolResponse(() => client.me()),
)
server.registerTool(
  "list_channels",
  { description: "List team channels", inputSchema: z.object({}), annotations: readOnly },
  () => toolResponse(() => client.channels()),
)
server.registerTool(
  "create_channel",
  {
    description: "Create a channel (admin)",
    inputSchema: z.object({
      name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
      requestId: z.uuid().optional(),
    }),
  },
  (input) => toolResponse(() => client.createChannel(input.name, input.requestId)),
)
server.registerTool(
  "rename_channel",
  {
    description: "Rename a public channel (admin); history and identity are preserved",
    inputSchema: z.object({
      channel: z.string(),
      name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  (input) => toolResponse(() => client.renameChannel(input.channel, input.name)),
)
server.registerTool(
  "set_channel_archived",
  {
    description:
      "Archive or restore a public channel (admin). Archive stops new messages and retains history.",
    inputSchema: z.object({ channel: z.string(), archived: z.boolean() }),
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  (input) => toolResponse(() => client.setChannelArchived(input.channel, input.archived)),
)
server.registerTool(
  "list_messages_after",
  {
    description:
      "Recover messages in ascending sequence, up to 100 per page. Continue after the last sequence; until fixes the snapshot upper bound.",
    inputSchema: z.object({
      channel: z.string(),
      after: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      until: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    }),
    annotations: readOnly,
  },
  (input) => toolResponse(() => client.messagesAfter(input.channel, input.after, input.until)),
)
server.registerTool(
  "list_messages",
  {
    description: "Read up to 100 messages; use the first sequence as before for older messages",
    inputSchema: z.object({ channel: z.string(), before: z.number().int().positive().optional() }),
    annotations: readOnly,
  },
  (input) => toolResponse(() => client.messages(input.channel, input.before ?? null)),
)
server.registerTool(
  "send_message",
  {
    description: "Send a message. Reuse id when retrying.",
    inputSchema: z.object({
      channel: z.string(),
      text: z.string().min(1).max(4000),
      id: z.string().uuid().optional(),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  (input) => toolResponse(() => client.sendMessage(input.channel, input.text, input.id)),
)
server.registerTool(
  "list_members",
  { description: "List team members", inputSchema: z.object({}), annotations: readOnly },
  () => toolResponse(() => client.members()),
)
server.registerTool(
  "change_member_role",
  {
    description: "Change a member role (owner)",
    inputSchema: z.object({ id: z.string(), role: z.enum(["admin", "member"]) }),
    annotations: { destructiveHint: true },
  },
  (input) => toolResponse(() => client.changeRole(input.id, input.role)),
)
server.registerTool(
  "disable_member",
  {
    description: "Disable member access across all clients (admin)",
    inputSchema: z.object({ id: z.string() }),
    annotations: { destructiveHint: true },
  },
  (input) => toolResponse(() => client.disableMember(input.id)),
)
server.registerTool(
  "restore_member",
  {
    description: "Restore member access (admin)",
    inputSchema: z.object({ id: z.string() }),
    annotations: { destructiveHint: true },
  },
  (input) => toolResponse(() => client.restoreMember(input.id)),
)
server.registerTool(
  "list_invitations",
  {
    description: "List pending, expired and currently unavailable invitations (admin)",
    inputSchema: z.object({}),
    annotations: readOnly,
  },
  () => toolResponse(() => client.invitations()),
)
server.registerTool(
  "invite_member",
  {
    description:
      "Create an email invitation (admin). Reuse requestId after an uncertain response; cancel the old invitation before resending.",
    inputSchema: z.object({ email: z.email(), requestId: z.uuid().optional() }),
    annotations: { destructiveHint: false },
  },
  (input) => toolResponse(() => client.invite(input.email, input.requestId)),
)
server.registerTool(
  "revoke_invitation",
  {
    description: "Revoke a pending invitation (admin)",
    inputSchema: z.object({ id: z.string() }),
    annotations: { destructiveHint: true },
  },
  (input) => toolResponse(() => client.revokeInvitation(input.id)),
)
server.registerTool(
  "list_tokens",
  {
    description: "List your access tokens without their secrets",
    inputSchema: z.object({}),
    annotations: readOnly,
  },
  () => toolResponse(() => client.tokens()),
)
server.registerTool(
  "revoke_token",
  {
    description: "Revoke your access token",
    inputSchema: z.object({ id: z.string() }),
    annotations: { destructiveHint: true },
  },
  (input) => toolResponse(() => client.revokeToken(input.id)),
)

server.connect(new StdioServerTransport()).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "MCP connection failed")
  process.exitCode = 1
})
