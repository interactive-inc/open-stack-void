import { Hono } from "hono"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { env } from "void/env"
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server"
import type { RegistrationResponseJSON } from "@simplewebauthn/server"
import type { AppEnvironment } from "@/api/app-environment"
import { resolveRegistrationClaim } from "@/contexts/identity/interface/resolve-registration-claim"
import { ChallengeRepository } from "@/contexts/identity/infrastructure/repositories/challenge.repository"
import { registrationClaimSchema } from "@/contexts/identity/domain/registration-claim"
import { SessionRepository } from "@/contexts/identity/infrastructure/repositories/session.repository"

import { RegisterPasskey } from "@/contexts/identity/application/register-passkey"
import { RegistrationRepository } from "@/contexts/identity/infrastructure/repositories/registration.repository"

export const registrationRoutes = new Hono<AppEnvironment>()

registrationRoutes.get("/status", async (context) => {
  const claim = await context.env.DB.prepare("SELECT id FROM chat_bootstrap_claims LIMIT 1").first()

  return context.json({ canBootstrap: !claim && Boolean(env.BOOTSTRAP_TOKEN) })
})

registrationRoutes.post("/register/options", async (context) => {
  const claim = await resolveRegistrationClaim(context)

  if (claim instanceof Error) return context.json({ error: claim.message }, 403)

  const credentials = await context.env.DB.prepare(
    "SELECT id FROM chat_credentials WHERE member_id = ?",
  )
    .bind(claim.id)
    .all<{ id: string }>()
  const options = await generateRegistrationOptions({
    rpName: "Void Chat",
    rpID: new URL(env.APP_ORIGIN).hostname,
    userID: new TextEncoder().encode(claim.id),
    userName: claim.email,
    userDisplayName: claim.name,
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    excludeCredentials: credentials.results.map((credential) => ({ id: credential.id })),
  })
  const id = await new ChallengeRepository({ database: context.env.DB }).create(
    options.challenge,
    "register",
    JSON.stringify(claim),
  )

  setCookie(context, "void_chat_challenge", id, {
    httpOnly: true,
    secure: env.APP_ORIGIN.startsWith("https:"),
    sameSite: "Strict",
    path: "/api/auth",
    maxAge: 300,
  })

  return context.json(options)
})

registrationRoutes.post("/register/verify", async (context) => {
  const challenge = await new ChallengeRepository({ database: context.env.DB }).consume(
    getCookie(context, "void_chat_challenge") ?? "",
    "register",
  )

  deleteCookie(context, "void_chat_challenge", { path: "/api/auth" })

  if (!challenge) return context.json({ error: "登録をやり直してください" }, 400)

  const claim = registrationClaimSchema.parse(JSON.parse(challenge.payload))
  const verification = await verifyRegistrationResponse({
    response: await context.req.json<RegistrationResponseJSON>(),
    expectedChallenge: challenge.challenge,
    expectedOrigin: env.APP_ORIGIN,
    expectedRPID: new URL(env.APP_ORIGIN).hostname,
    requireUserVerification: true,
  }).catch(() => null)

  if (!verification?.verified || !verification.registrationInfo)
    return context.json({ error: "パスキーを確認できませんでした" }, 400)

  const credential = verification.registrationInfo.credential
  const session = await new RegisterPasskey({
    registrations: new RegistrationRepository({ database: context.env.DB }),
    sessions: new SessionRepository({ database: context.env.DB }),
  }).execute(claim, {
    id: credential.id,
    publicKey: btoa(String.fromCharCode(...credential.publicKey)),
    counter: credential.counter,
  })

  if (session instanceof Error) return context.json({ error: session.message }, 409)
  setCookie(context, "void_chat_session", session.token, {
    httpOnly: true,
    secure: env.APP_ORIGIN.startsWith("https:"),
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return context.json({ ok: true })
})
