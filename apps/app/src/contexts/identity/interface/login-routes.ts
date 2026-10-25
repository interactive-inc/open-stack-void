import { Hono } from "hono"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { env } from "void/env"
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"
import type { AppEnvironment } from "@/api/app-environment"
import { ChallengeRepository } from "@/contexts/identity/infrastructure/repositories/challenge.repository"
import { SessionRepository } from "@/contexts/identity/infrastructure/repositories/session.repository"
import { authenticate } from "@/contexts/identity/interface/authenticate"

export const loginRoutes = new Hono<AppEnvironment>()

loginRoutes.post("/login/options", async (context) => {
  const options = await generateAuthenticationOptions({
    rpID: new URL(env.APP_ORIGIN).hostname,
    userVerification: "required",
  })
  const challengeId = await new ChallengeRepository({ database: context.env.DB }).create(
    options.challenge,
    "login",
    "{}",
  )

  setCookie(context, "void_chat_challenge", challengeId, {
    httpOnly: true,
    secure: env.APP_ORIGIN.startsWith("https:"),
    sameSite: "Strict",
    path: "/api/auth",
    maxAge: 300,
  })

  return context.json(options)
})

loginRoutes.post("/login/verify", async (context) => {
  const challenge = await new ChallengeRepository({ database: context.env.DB }).consume(
    getCookie(context, "void_chat_challenge") ?? "",
    "login",
  )

  deleteCookie(context, "void_chat_challenge", { path: "/api/auth" })

  if (!challenge) return context.json({ error: "ログインをやり直してください" }, 400)

  const response = await context.req.json<AuthenticationResponseJSON>()
  const credential = await context.env.DB.prepare(
    "SELECT k.id, k.public_key AS publicKey, k.counter, k.member_id AS memberId FROM chat_credentials k JOIN chat_members m ON m.id = k.member_id WHERE k.id = ? AND m.status = 'active'",
  )
    .bind(response.id)
    .first<{ id: string; publicKey: string; counter: number; memberId: string }>()

  if (!credential) return context.json({ error: "ログインできませんでした" }, 401)

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: env.APP_ORIGIN,
    expectedRPID: new URL(env.APP_ORIGIN).hostname,
    requireUserVerification: true,
    credential: {
      id: credential.id,
      publicKey: Uint8Array.from(atob(credential.publicKey), (character) =>
        character.charCodeAt(0),
      ),
      counter: credential.counter,
    },
  }).catch(() => null)

  if (!verification?.verified) return context.json({ error: "パスキーを確認できませんでした" }, 401)

  await context.env.DB.prepare(
    "UPDATE chat_credentials SET counter = ? WHERE id = ? AND counter = ?",
  )
    .bind(verification.authenticationInfo.newCounter, credential.id, credential.counter)
    .run()

  const session = await new SessionRepository({ database: context.env.DB }).create(
    credential.memberId,
    "browser",
    "Browser",
  )

  setCookie(context, "void_chat_session", session.token, {
    httpOnly: true,
    secure: env.APP_ORIGIN.startsWith("https:"),
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return context.json({ ok: true })
})

loginRoutes.post("/logout", authenticate, async (context) => {
  await context.env.DB.prepare("DELETE FROM chat_sessions WHERE hash = ?")
    .bind(context.get("sessionHash"))
    .run()

  deleteCookie(context, "void_chat_session", { path: "/" })

  return context.json({ ok: true })
})
