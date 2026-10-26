import type { Member } from "@/contexts/membership/domain/member"
import type { InvitationRepository } from "@/contexts/membership/infrastructure/repositories/invitation.repository"
import type { InvitationMailAdapter } from "@/contexts/membership/infrastructure/adapters/invitation-mail.adapter"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"
import type { InvitationDeliveryOutcome } from "@/contexts/membership/domain/invitation-delivery"
import { invitationSendTimeoutMilliseconds } from "@/contexts/membership/domain/invitation-delivery"

type Context = Readonly<{
  invitations: Pick<InvitationRepository, "claimDelivery" | "canDeliver" | "settleDelivery">
  mail: Pick<InvitationMailAdapter, "send">
  issueLink: () => Promise<{ hash: string; link: string }>
}>

/** 現在の状態を条件に、一回の配信を取得して確定する。 */
export class DispatchInvitation {
  constructor(private readonly context: Context) {}

  async execute(
    actor: Member,
    request: { id: string; attempts: number; acknowledgeUnknown: boolean },
  ) {
    if (actor.status !== "active" || actor.role === "member")
      return new InvitationFailed("forbidden")
    const secret = await this.context.issueLink()
    const lease = crypto.randomUUID()
    const claim = await this.context.invitations.claimDelivery(
      actor.id,
      request,
      secret.hash,
      lease,
    )
    if (claim instanceof InvitationFailed) return claim

    // Re-check both actors and revocation immediately before the external side effect.
    if (!(await this.context.invitations.canDeliver(actor.id, request.id, lease))) {
      await this.context.invitations.settleDelivery(request.id, lease, "failed")
      return new InvitationFailed("delivery-state")
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let outcome: InvitationDeliveryOutcome
    try {
      outcome = await Promise.race([
        this.context.mail.send(
          claim.email,
          secret.link,
          `invitation:${request.id}:${claim.attempts}`,
        ),
        new Promise<"unknown">((resolve) => {
          timer = setTimeout(() => resolve("unknown"), invitationSendTimeoutMilliseconds)
        }),
      ])
    } catch {
      outcome = "unknown"
    } finally {
      clearTimeout(timer)
    }
    // A late provider response must never overwrite a cancellation or a newer attempt.
    await this.context.invitations.settleDelivery(request.id, lease, outcome)
    return { ok: true }
  }
}
