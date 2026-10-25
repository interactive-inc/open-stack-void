type Context = Readonly<{ database: D1Database }>

export class ChannelRepository {
  constructor(private readonly context: Context) {}

  async findOne(id: string) {
    return this.context.database
      .prepare("SELECT id, name FROM chat_channels WHERE id = ?")
      .bind(id)
      .first<{ id: string; name: string }>()
  }

  async findMany() {
    const channels = await this.context.database
      .prepare("SELECT id, name FROM chat_channels ORDER BY created_at, name")
      .all<{ id: string; name: string }>()

    return channels.results
  }

  async create(name: string, memberId: string) {
    const id = crypto.randomUUID()

    await this.context.database
      .prepare("INSERT INTO chat_channels (id, name, created_by, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, name, memberId, Date.now())
      .run()

    return { id, name }
  }
}
