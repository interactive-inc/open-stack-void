import { nodeFetch } from "@open-stack/sdk/node-fetch"
import { Command } from "commander"
import { VoidChatClient } from "@open-stack/sdk"
import { writeFile } from "node:fs/promises"
import { readAttachment } from "./read-attachment"
import { basename, extname } from "node:path"

type Props = {
  readClipboard: () => Promise<string | Error>
  print: (value: unknown) => void
  openBrowser: (url: string) => void
}

export function createCli(props: Props) {
  const command = new Command()
    .name("void-chat")
    .description("Void Chat")
    .version("0.1.0")
    .option(
      "--server <url>",
      "Server origin",
      process.env.VOID_CHAT_URL ?? "http://app.void.stack.localhost",
    )
    .option("--clipboard", "Explicitly read the access token from the clipboard")
  const server = () => command.opts<{ server: string }>().server
  const client = async () => {
    if (!command.opts<{ clipboard?: boolean }>().clipboard)
      throw new Error("ブラウザでトークンをコピーし、--clipboard を付けて実行してください")
    const token = await props.readClipboard()
    if (token instanceof Error) throw token
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("クリップボードに有効なトークンがありません")
    return new VoidChatClient({ request: nodeFetch, baseUrl: server(), token })
  }

  command.command("login").action(() => {
    new VoidChatClient({ request: nodeFetch, baseUrl: server(), token: null })
    props.openBrowser(server())
    props.print({
      message:
        "ブラウザでログインし、アカウントからトークンをコピーしてください。操作には --clipboard を付けます。",
    })
  })
  command.command("initialize").action(() => {
    new VoidChatClient({ request: nodeFetch, baseUrl: server(), token: null })
    props.openBrowser(server())
    props.print({ message: "初期化キーをブラウザへ貼り付け、パスキーを登録してください。" })
  })
  command.command("me").action(async () => props.print(await (await client()).me()))
  command
    .command("profile-name <name>")
    .action(async (name: string) => props.print(await (await client()).renameProfile(name)))

  const channels = command.command("channels")
  channels
    .command("activity <ids...>")
    .action(async (ids: string[]) => props.print(await (await client()).channelActivity(ids)))
  channels
    .command("read <id> <sequence>")
    .action(async (id: string, sequence: string) =>
      props.print(await (await client()).markChannelRead(id, Number(sequence))),
    )
  channels.command("list").action(async () => props.print(await (await client()).channels()))
  channels
    .command("create <name>")
    .option("--request-id <uuid>", "Reuse the ID after an uncertain response")
    .action(async (name: string, options: { requestId?: string }) =>
      props.print(await (await client()).createChannel(name, options.requestId)),
    )
  channels
    .command("rename <id> <name>")
    .action(async (id: string, name: string) =>
      props.print(await (await client()).renameChannel(id, name)),
    )
  channels
    .command("archive <id>")
    .action(async (id: string) => props.print(await (await client()).setChannelArchived(id, true)))
  channels
    .command("restore <id>")
    .action(async (id: string) => props.print(await (await client()).setChannelArchived(id, false)))

  const messages = command.command("messages")
  messages
    .command("search <channel> <query>")
    .option("--before <sequence>")
    .option("--until <sequence>")
    .action(async (channel: string, query: string, options: { before?: string; until?: string }) =>
      props.print(
        await (
          await client()
        ).search(
          channel,
          query,
          options.before === undefined ? undefined : Number(options.before),
          options.until === undefined ? undefined : Number(options.until),
        ),
      ),
    )
  const attachments = command.command("attachments")
  attachments
    .command("list <channel>")
    .option("--before <sequence>")
    .action(async (channel: string, options: { before?: string }) =>
      props.print(
        await (
          await client()
        ).attachments(channel, options.before === undefined ? undefined : Number(options.before)),
      ),
    )
  attachments
    .command("upload <channel> <file>")
    .requiredOption(
      "--request-id <uuid>",
      "Reuse this public request ID after an uncertain response",
    )
    .option("--type <mime>")
    .action(
      async (channel: string, file: string, options: { requestId?: string; type?: string }) => {
        const authenticated = await client()
        const bytes = await readAttachment(file)
        if (bytes instanceof Error) throw bytes
        const types: Record<string, string> = {
          ".txt": "text/plain",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
        }
        props.print(
          await authenticated.uploadAttachment(
            channel,
            basename(file),
            new Blob([bytes], {
              type:
                options.type ?? types[extname(file).toLowerCase()] ?? "application/octet-stream",
            }),
            options.requestId,
          ),
        )
      },
    )
  attachments
    .command("download <channel> <id>")
    .requiredOption("--output <file>")
    .action(async (channel: string, id: string, options: { output: string }) => {
      const blob = await (await client()).downloadAttachment(channel, id)
      await writeFile(options.output, new Uint8Array(await blob.arrayBuffer()), { flag: "wx" })
      props.print({ saved: options.output })
    })
  messages
    .command("list <channel>")
    .option("--before <sequence>")
    .option("--after <sequence>")
    .option("--until <sequence>")
    .action(
      async (channel: string, options: { before?: string; after?: string; until?: string }) => {
        if (
          (options.before !== undefined && options.after !== undefined) ||
          (options.until !== undefined && options.after === undefined)
        )
          command.error("Use before or after; until requires after")
        props.print(
          options.after !== undefined
            ? await (
                await client()
              ).messagesAfter(
                channel,
                Number(options.after),
                options.until === undefined ? undefined : Number(options.until),
              )
            : await (
                await client()
              ).messages(channel, options.before ? Number(options.before) : null),
        )
      },
    )
  messages
    .command("send <channel> <text>")
    .option("--id <uuid>", "Reuse the same ID when retrying")
    .option("--reply-to <uuid>", "Reply to a message in the same channel")
    .action(async (channel: string, text: string, options: { id?: string; replyTo?: string }) =>
      props.print(
        await (await client()).sendMessage(channel, text, options.id, options.replyTo ?? null),
      ),
    )

  const members = command.command("members")
  members.command("list").action(async () => props.print(await (await client()).members()))
  members.command("role <id> <role>").action(async (id: string, role: string) => {
    if (role !== "admin" && role !== "member") {
      command.error("Role must be admin or member")
      return
    }
    props.print(await (await client()).changeRole(id, role))
  })
  members
    .command("disable <id>")
    .action(async (id) => props.print(await (await client()).disableMember(id)))
  members
    .command("restore <id>")
    .action(async (id) => props.print(await (await client()).restoreMember(id)))

  const invitations = command.command("invitations")
  invitations
    .command("retry <id>")
    .requiredOption("--attempts <number>", "Current attempt count from invitations list", Number)
    .option(
      "--acknowledge-unknown",
      "Invalidate the previous link and accept possible duplicate email",
    )
    .action(async (id: string, options: { attempts: number; acknowledgeUnknown?: boolean }) =>
      props.print(
        await (await client()).retryInvitation(id, options.attempts, options.acknowledgeUnknown),
      ),
    )
  invitations.command("list").action(async () => props.print(await (await client()).invitations()))
  invitations
    .command("create <email>")
    .option("--request-id <uuid>", "Reuse the same request ID after an uncertain response")
    .action(async (email: string, options: { requestId?: string }) =>
      props.print(await (await client()).invite(email, options.requestId)),
    )
  invitations
    .command("revoke <id>")
    .action(async (id) => props.print(await (await client()).revokeInvitation(id)))

  const tokens = command.command("tokens")
  tokens.command("list").action(async () => props.print(await (await client()).tokens()))
  tokens
    .command("revoke <id>")
    .action(async (id) => props.print(await (await client()).revokeToken(id)))

  return command
}
