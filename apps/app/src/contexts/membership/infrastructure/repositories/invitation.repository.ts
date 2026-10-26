import { z } from "zod"
import { invitationSchema } from "@/contexts/membership/domain/invitation"
import type { InvitationDeliveryOutcome } from "@/contexts/membership/domain/invitation-delivery"
import {
  invitationAttemptLimit,
  invitationLeaseMilliseconds,
} from "@/contexts/membership/domain/invitation-delivery"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"

function parseInvitation(value: unknown) {
  const row = z
    .object({ deliveryState: z.string(), deliveryAttempts: z.number() })
    .passthrough()
    .parse(value)
  return invitationSchema.parse({
    ...row,
    delivery: { state: row.deliveryState, attempts: row.deliveryAttempts },
  })
}

const authority =
  "EXISTS (SELECT 1 FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin'))"

type Context = Readonly<{ database: D1Database }>

export class InvitationRepository {
  constructor(private readonly context: Context) {}

  async create(invitation: {
    id: string
    hash: string
    email: string
    invitedBy: string
    expiresAt: number
  }) {
    const database = this.context.database
    const now = Date.now()
    const writes = await database.batch([
      database
        .prepare(
          "SELECT id FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')",
        )
        .bind(invitation.invitedBy),
      database
        .prepare(
          "INSERT OR IGNORE INTO chat_invitations (id, hash, email, invited_by, expires_at, created_at, delivery_state) SELECT ?, ?, ?, ?, ?, ?, 'queued' WHERE EXISTS (SELECT 1 FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')) AND NOT EXISTS (SELECT 1 FROM chat_members WHERE lower(email) = ?) AND NOT EXISTS (SELECT 1 FROM chat_invitations WHERE lower(email) = ? AND state = 'pending' AND expires_at > ?)",
        )
        .bind(
          invitation.id,
          invitation.hash,
          invitation.email,
          invitation.invitedBy,
          invitation.expiresAt,
          now,
          invitation.invitedBy,
          invitation.email,
          invitation.email,
          now,
        ),
      database
        .prepare(
          "SELECT id, email, expires_at AS expiresAt, 'pending' AS status, delivery_state AS deliveryState, delivery_attempts AS deliveryAttempts FROM chat_invitations WHERE id = ? AND email = ? AND invited_by = ? AND state = 'pending' AND expires_at > ?",
        )
        .bind(invitation.id, invitation.email, invitation.invitedBy, now),
      database.prepare("SELECT id FROM chat_members WHERE lower(email) = ?").bind(invitation.email),
      database.prepare("SELECT id FROM chat_invitations WHERE id = ?").bind(invitation.id),
    ])
    if (!writes[0].results.length) return new InvitationFailed("forbidden")
    if (writes[3].results.length) return new InvitationFailed("registered")
    if (!writes[2].results.length)
      return new InvitationFailed(writes[4].results.length ? "used" : "conflict")
    return {
      created: writes[1].meta.changes === 1,
      invitation: parseInvitation(writes[2].results[0]),
    }
  }

  async findMany(actorId: string, id: string | null = null) {
    const database = this.context.database
    const reads = await database.batch([
      database
        .prepare(
          "SELECT id FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')",
        )
        .bind(actorId),
      database
        .prepare(
          "SELECT i.id, i.email, i.expires_at AS expiresAt, CASE WHEN i.delivery_state = 'sending' AND i.delivery_lease_until <= ? THEN 'unknown' ELSE i.delivery_state END AS deliveryState, i.delivery_attempts AS deliveryAttempts, CASE WHEN i.state = 'revoked' THEN 'revoked' WHEN i.state = 'accepted' THEN 'accepted' WHEN i.state != 'pending' THEN 'unavailable' WHEN i.expires_at <= ? THEN 'expired' WHEN m.status != 'active' OR m.role NOT IN ('owner', 'admin') THEN 'unavailable' ELSE 'pending' END AS status FROM chat_invitations i JOIN chat_members m ON m.id = i.invited_by WHERE (? IS NULL OR i.id = ?) ORDER BY (i.expires_at > ?) DESC, i.created_at DESC LIMIT 100",
        )
        .bind(Date.now(), Date.now(), id, id, Date.now()),
    ])

    if (!reads[0].results.length) return new InvitationFailed("forbidden")
    return reads[1].results.map(parseInvitation)
  }

  async revoke(actorId: string, id: string) {
    const database = this.context.database
    const writes = await database.batch([
      database
        .prepare(
          "SELECT id FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')",
        )
        .bind(actorId),
      database
        .prepare(
          "UPDATE chat_invitations SET state = 'revoked', expires_at = 0, delivery_lease = NULL, delivery_lease_until = 0, delivery_state = CASE WHEN delivery_state = 'sending' THEN 'unknown' ELSE delivery_state END WHERE id = ? AND state = 'pending' AND EXISTS (SELECT 1 FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin'))",
        )
        .bind(id, actorId),
    ])
    return writes[0].results.length === 1
  }

  async claimDelivery(
    actorId: string,
    request: { id: string; attempts: number; acknowledgeUnknown: boolean },
    hash: string,
    lease: string,
  ) {
    const database = this.context.database
    const now = Date.now()
    const writes = await database.batch([
      database
        .prepare(
          `SELECT id FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')`,
        )
        .bind(actorId),
      database
        .prepare(
          `UPDATE chat_invitations SET delivery_state = 'unknown', delivery_lease = NULL, delivery_lease_until = 0 WHERE id = ? AND delivery_state = 'sending' AND delivery_lease_until <= ? AND ${authority}`,
        )
        .bind(request.id, now, actorId),
      database
        .prepare(
          `UPDATE chat_invitations SET hash = ?, delivery_state = 'sending', delivery_attempts = delivery_attempts + 1, delivery_lease = ?, delivery_lease_until = ? WHERE id = ? AND state = 'pending' AND expires_at > ? AND delivery_attempts = ? AND delivery_attempts < ? AND (delivery_state IN ('queued', 'failed') OR (delivery_state = 'unknown' AND ? = 1)) AND ${authority} AND EXISTS (SELECT 1 FROM chat_members m WHERE m.id = chat_invitations.invited_by AND m.status = 'active' AND m.role IN ('owner', 'admin'))`,
        )
        .bind(
          hash,
          lease,
          now + invitationLeaseMilliseconds,
          request.id,
          now,
          request.attempts,
          invitationAttemptLimit,
          request.acknowledgeUnknown ? 1 : 0,
          actorId,
        ),
      database
        .prepare(
          "SELECT email, delivery_attempts AS attempts FROM chat_invitations WHERE id = ? AND delivery_lease = ?",
        )
        .bind(request.id, lease),
    ])
    if (!writes[0].results.length) return new InvitationFailed("forbidden")
    const claim = writes[3].results[0]
    if (!claim) return new InvitationFailed("delivery-state")
    return z.object({ email: z.email(), attempts: z.number().int() }).parse(claim)
  }

  async canDeliver(actorId: string, id: string, lease: string) {
    return Boolean(
      await this.context.database
        .prepare(
          `SELECT i.id FROM chat_invitations i JOIN chat_members m ON m.id = i.invited_by WHERE i.id = ? AND i.delivery_lease = ? AND i.delivery_state = 'sending' AND i.delivery_lease_until > ? AND i.state = 'pending' AND i.expires_at > ? AND m.status = 'active' AND m.role IN ('owner', 'admin') AND ${authority}`,
        )
        .bind(id, lease, Date.now(), Date.now(), actorId)
        .first(),
    )
  }

  async settleDelivery(id: string, lease: string, outcome: InvitationDeliveryOutcome) {
    await this.context.database
      .prepare(
        "UPDATE chat_invitations SET delivery_state = ?, delivery_lease = NULL, delivery_lease_until = 0 WHERE id = ? AND delivery_lease = ? AND delivery_state = 'sending' AND state != 'revoked' AND delivery_lease_until > ?",
      )
      .bind(outcome, id, lease, Date.now())
      .run()
  }
}
