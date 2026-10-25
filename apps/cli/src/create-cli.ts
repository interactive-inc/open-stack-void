import { nodeFetch } from "@open-stack/sdk/node-fetch"
import { Command } from "commander"
import { VoidChatClient } from "@open-stack/sdk"

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

  const channels = command.command("channels")
  channels.command("list").action(async () => props.print(await (await client()).channels()))
  channels
    .command("create <name>")
    .action(async (name) => props.print(await (await client()).createChannel(name)))

  const messages = command.command("messages")
  messages
    .command("list <channel>")
    .option("--before <sequence>")
    .action(async (channel: string, options: { before?: string }) =>
      props.print(
        await (await client()).messages(channel, options.before ? Number(options.before) : null),
      ),
    )
  messages
    .command("send <channel> <text>")
    .option("--id <uuid>", "Reuse the same ID when retrying")
    .action(async (channel: string, text: string, options: { id?: string }) =>
      props.print(await (await client()).sendMessage(channel, text, options.id)),
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
  invitations.command("list").action(async () => props.print(await (await client()).invitations()))
  invitations
    .command("create <email>")
    .action(async (email) => props.print(await (await client()).invite(email)))
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
