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
    inputSchema: z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/) }),
  },
  (input) => toolResponse(() => client.createChannel(input.name)),
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
