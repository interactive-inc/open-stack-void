import { z } from "zod"
import {
  memberSchema,
  channelSchema,
  messageSchema,
  invitationSchema,
  tokenSchema,
  passkeySchema,
  issuedTokenSchema,
  successSchema,
} from "./contracts"

type Props = Readonly<{
  baseUrl: string
  token: string | null
  request?: (input: string, options: RequestInit) => Promise<Response>
}>

export class RequestFailed extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export class VoidChatClient {
  constructor(private readonly props: Props) {
    if (props.baseUrl) {
      const url = new URL(props.baseUrl)
      if (
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        !["http:", "https:"].includes(url.protocol)
      )
        throw new Error("サーバーにはオリジンURLを指定してください")
      if (
        url.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]", "app.void.stack.localhost"].includes(url.hostname)
      )
        throw new Error("ローカル以外ではHTTPSを使用してください")
    }
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = "GET",
    body: unknown = undefined,
  ): Promise<T> {
    const headers = new Headers({ "Content-Type": "application/json" })

    if (this.props.token) headers.set("Authorization", `Bearer ${this.props.token}`)

    const options: RequestInit = {
      method,
      headers,
      credentials: "same-origin",
    }

    if (body !== undefined) options.body = JSON.stringify(body)

    const response = await (this.props.request ?? fetch)(
      `${this.props.baseUrl.replace(/\/$/, "")}/api${path}`,
      options,
    )
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const failure = z.object({ error: z.string() }).safeParse(payload)
      throw new RequestFailed(
        response.status,
        failure.success ? failure.data.error : `HTTP ${response.status}`,
      )
    }

    return schema.parse(payload)
  }

  me() {
    return this.request("/me", memberSchema)
  }
  channels() {
    return this.request("/channels", channelSchema.array())
  }
  renameProfile(name: string) {
    return this.request("/me", memberSchema, "PATCH", { name })
  }
  createChannel(name: string, id: string = crypto.randomUUID()) {
    return this.request("/channels", channelSchema, "POST", { name, id })
  }
  renameChannel(id: string, name: string) {
    return this.request(`/channels/${encodeURIComponent(id)}`, channelSchema, "PATCH", { name })
  }
  setChannelArchived(id: string, archived: boolean) {
    return this.request(`/channels/${encodeURIComponent(id)}/archive`, channelSchema, "PATCH", {
      archived,
    })
  }
  messagesAfter(channelId: string, after: number, until?: number) {
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/messages?after=${after}${until === undefined ? "" : `&until=${until}`}`,
      messageSchema.array(),
    )
  }
  messages(channelId: string, before: number | null = null) {
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/messages${before ? `?before=${before}` : ""}`,
      messageSchema.array(),
    )
  }
  sendMessage(channelId: string, text: string, id: string = crypto.randomUUID()) {
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/messages`,
      messageSchema,
      "POST",
      { id, text },
    )
  }
  members() {
    return this.request("/members", memberSchema.array())
  }
  changeRole(id: string, role: "admin" | "member") {
    return this.request(`/members/${encodeURIComponent(id)}`, memberSchema, "PATCH", { role })
  }
  disableMember(id: string) {
    return this.request(`/members/${encodeURIComponent(id)}`, memberSchema, "DELETE")
  }
  restoreMember(id: string) {
    return this.request(`/members/${encodeURIComponent(id)}/restore`, memberSchema, "POST", {})
  }
  invitations() {
    return this.request("/invitations", invitationSchema.array())
  }
  invite(email: string, id: string = crypto.randomUUID()) {
    return this.request("/invitations", invitationSchema, "POST", { email, id })
  }
  revokeInvitation(id: string) {
    return this.request(`/invitations/${encodeURIComponent(id)}`, successSchema, "DELETE")
  }
  tokens() {
    return this.request("/tokens", tokenSchema.array())
  }
  issueToken(name: string) {
    return this.request("/tokens", issuedTokenSchema, "POST", { name })
  }
  revokeToken(id: string) {
    return this.request(`/tokens/${encodeURIComponent(id)}`, successSchema, "DELETE")
  }
  passkeys() {
    return this.request("/passkeys", passkeySchema.array())
  }
  deletePasskey(id: string) {
    return this.request(`/passkeys/${encodeURIComponent(id)}`, successSchema, "DELETE")
  }
  logout() {
    return this.request("/auth/logout", successSchema, "POST", {})
  }
}
