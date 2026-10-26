import type { RegistrationClaim } from "@/contexts/identity/domain/registration-claim"

type Context = Readonly<{ database: D1Database }>
export type VerifiedCredential = Readonly<{ id: string; publicKey: string; counter: number }>

export class RegistrationRepository {
  constructor(private readonly context: Context) {}

  async create(claim: RegistrationClaim, credential: VerifiedCredential): Promise<null | Error> {
    const database = this.context.database
    const statements: D1PreparedStatement[] = []

    if (!claim.existing) {
      if (claim.role === "owner")
        statements.push(database.prepare("INSERT INTO chat_bootstrap_claims (id) VALUES (1)"))

      if (claim.inviteHash) {
        statements.push(
          database
            .prepare(
              "INSERT INTO chat_members (id, email, name, role, status, created_at) SELECT ?, ?, ?, 'member', 'active', ? FROM chat_invitations i JOIN chat_members inviter ON inviter.id = i.invited_by WHERE i.hash = ? AND i.state = 'pending' AND i.email = ? AND i.expires_at > ? AND inviter.status = 'active' AND inviter.role IN ('owner', 'admin')",
            )
            .bind(
              claim.id,
              claim.email,
              claim.name,
              Date.now(),
              claim.inviteHash,
              claim.email,
              Date.now(),
            ),
        )
      } else {
        statements.push(
          database
            .prepare(
              "INSERT INTO chat_members (id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
            )
            .bind(claim.id, claim.email, claim.name, claim.role, Date.now()),
        )
      }
    }

    if (claim.existing) {
      statements.push(
        database
          .prepare(
            "INSERT INTO chat_credentials (id, member_id, public_key, counter, name, created_at) SELECT ?, ?, ?, ?, 'Passkey', ? FROM chat_sessions s JOIN chat_members m ON m.id = s.member_id WHERE s.hash = ? AND s.member_id = ? AND s.kind = 'browser' AND s.expires_at > ? AND m.status = 'active'",
          )
          .bind(
            credential.id,
            claim.id,
            credential.publicKey,
            credential.counter,
            Date.now(),
            claim.sessionHash,
            claim.id,
            Date.now(),
          ),
      )
    } else {
      statements.push(
        database
          .prepare(
            "INSERT INTO chat_credentials (id, member_id, public_key, counter, name, created_at) VALUES (?, ?, ?, ?, 'Passkey', ?)",
          )
          .bind(credential.id, claim.id, credential.publicKey, credential.counter, Date.now()),
      )
      statements.push(
        database
          .prepare(
            "INSERT OR IGNORE INTO chat_channels (id, name, created_by, created_at) VALUES ('general', 'general', ?, ?)",
          )
          .bind(claim.id, Date.now()),
      )
    }

    if (claim.inviteHash)
      statements.push(
        database
          .prepare(
            "UPDATE chat_invitations SET state = 'accepted', expires_at = 0 WHERE hash = ? AND state = 'pending'",
          )
          .bind(claim.inviteHash),
      )

    const writes = await database.batch(statements).catch(() => null)

    if (!writes || (claim.existing && !writes[0]?.meta.changes))
      return new Error("登録は使用済み、期限切れ、または別の登録と競合しました")

    return null
  }
}
