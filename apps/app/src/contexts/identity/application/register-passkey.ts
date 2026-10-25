import type { RegistrationClaim } from "@/contexts/identity/domain/registration-claim"
import type {
  RegistrationRepository,
  VerifiedCredential,
} from "@/contexts/identity/infrastructure/repositories/registration.repository"
import type { SessionRepository } from "@/contexts/identity/infrastructure/repositories/session.repository"

type Context = Readonly<{
  registrations: Pick<RegistrationRepository, "create">
  sessions: Pick<SessionRepository, "create">
}>

/** パスキーを登録して本人のセッションを開始する。 */
export class RegisterPasskey {
  constructor(private readonly context: Context) {}

  async execute(claim: RegistrationClaim, credential: VerifiedCredential) {
    const rejection = await this.context.registrations.create(claim, credential)

    if (rejection) return rejection

    return this.context.sessions.create(claim.id, "browser", "Browser")
  }
}
