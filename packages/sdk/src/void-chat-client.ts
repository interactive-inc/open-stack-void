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
  attachmentSchema,
  attachmentPageSchema,
  searchPageSchema,
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

    if (body instanceof FormData) {
      headers.delete("Content-Type")
      options.body = body
    } else if (body !== undefined) options.body = JSON.stringify(body)

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
  message(channelId: string, id: string) {
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(id)}`,
      messageSchema,
    )
  }
  search(channelId: string, q: string, before?: number, until?: number) {
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/search`,
      searchPageSchema,
      "POST",
      { q, before, until },
    )
  }
  attachments(channelId: string, before?: number) {
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/attachments${before === undefined ? "" : `?before=${before}`}`,
      attachmentPageSchema,
    )
  }
  async uploadAttachment(
    channelId: string,
    name: string,
    file: Blob,
    id: string = crypto.randomUUID(),
  ) {
    if (file.size > 512 * 1024) throw new RequestFailed(413, "添付は512KiB以下にしてください")
    if (
      !file.size ||
      name.length > 120 ||
      !name.trim() ||
      !z.uuid().safeParse(id).success ||
      !["image/png", "image/jpeg", "image/webp", "text/plain"].includes(file.type)
    )
      throw new RequestFailed(400, "PNG/JPEG/WebP/TXTのファイルを選んでください")
    const form = new FormData()
    form.set("id", id)
    form.set("file", file, name)
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/attachments`,
      attachmentSchema,
      "POST",
      form,
    )
  }
  async downloadAttachment(channelId: string, id: string) {
    const headers = new Headers()
    if (this.props.token) headers.set("Authorization", `Bearer ${this.props.token}`)
    const response = await (this.props.request ?? fetch)(
      `${this.props.baseUrl.replace(/\/$/, "")}/api/channels/${encodeURIComponent(channelId)}/attachments/${encodeURIComponent(id)}`,
      { headers, credentials: "same-origin" },
    )
    if (!response.ok) {
      const failure = z
        .object({ error: z.string() })
        .safeParse(await response.json().catch(() => null))
      throw new RequestFailed(
        response.status,
        failure.success ? failure.data.error : `HTTP ${response.status}`,
      )
    }
    const reader = response.body?.getReader()
    if (!reader) throw new RequestFailed(502, "ファイルを取得できませんでした")
    const chunks: BlobPart[] = []
    let size = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 512 * 1024) {
          await reader.cancel()
          throw new RequestFailed(413, "添付は512KiB以下にしてください")
        }
        chunks.push(new Uint8Array(part.value))
      }
    } finally {
      reader.releaseLock()
    }
    return new Blob(chunks, { type: "application/octet-stream" })
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
  retryInvitation(id: string, attempts: number, acknowledgeUnknown = false) {
    return this.request(`/invitations/${encodeURIComponent(id)}/retry`, invitationSchema, "POST", {
      attempts,
      acknowledgeUnknown,
    })
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
