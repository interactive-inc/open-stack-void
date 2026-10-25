import { Hono } from "hono"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { env } from "void/env"
import { z } from "zod"
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"
import type { AppEnvironment } from "@/api/app-environment"
import { authenticate } from "@/contexts/identity/interface/authenticate"
import { ChallengeRepository } from "@/contexts/identity/infrastructure/repositories/challenge.repository"

export const reauthenticationRoutes = new Hono<AppEnvironment>()

reauthenticationRoutes.post("/reauth/options", authenticate, async (context) => {
  if (context.get("sessionKind") !== "browser")
    return context.json({ error: "ブラウザで操作してください" }, 403)

  const input = z
    .object({
      name: z
        .string()
        .regex(/^(issue-token|add-passkey|delete-passkey:[A-Za-z0-9_-]+|device:[a-f0-9-]{36})$/)
        .max(1200),
    })
    .parse(await context.req.json())
  const credentials = await context.env.DB.prepare(
    "SELECT id FROM chat_credentials WHERE member_id = ?",
  )
    .bind(context.get("member").id)
    .all<{ id: string }>()
  const options = await generateAuthenticationOptions({
    rpID: new URL(env.APP_ORIGIN).hostname,
    userVerification: "required",
    allowCredentials: credentials.results.map((credential) => ({ id: credential.id })),
  })
  const challengeId = await new ChallengeRepository({ database: context.env.DB }).create(
    options.challenge,
    "reauth",
    JSON.stringify({
      sessionHash: context.get("sessionHash"),
      memberId: context.get("member").id,
      purpose: input.name,
    }),
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

reauthenticationRoutes.post("/reauth/verify", authenticate, async (context) => {
  const challenge = await new ChallengeRepository({ database: context.env.DB }).consume(
    getCookie(context, "void_chat_challenge") ?? "",
    "reauth",
  )

  deleteCookie(context, "void_chat_challenge", { path: "/api/auth" })

  if (!challenge) return context.json({ error: "本人確認をやり直してください" }, 400)

  const claim = z
    .object({ sessionHash: z.string(), memberId: z.string(), purpose: z.string() })
    .parse(JSON.parse(challenge.payload))

  if (
    claim.sessionHash !== context.get("sessionHash") ||
    claim.memberId !== context.get("member").id ||
    context.get("sessionKind") !== "browser"
  )
    return context.json({ error: "セッションが異なります" }, 403)

  const response = await context.req.json<AuthenticationResponseJSON>()
  const credential = await context.env.DB.prepare(
    "SELECT id, public_key AS publicKey, counter FROM chat_credentials WHERE id = ? AND member_id = ?",
  )
    .bind(response.id, claim.memberId)
    .first<{ id: string; publicKey: string; counter: number }>()

  if (!credential) return context.json({ error: "パスキーを確認できませんでした" }, 403)

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

  if (!verification?.verified) return context.json({ error: "パスキーを確認できませんでした" }, 403)

  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE chat_credentials SET counter = ? WHERE id = ?").bind(
      verification.authenticationInfo.newCounter,
      credential.id,
    ),
    context.env.DB.prepare("UPDATE chat_sessions SET name = ?, created_at = ? WHERE hash = ?").bind(
      claim.purpose,
      Date.now(),
      claim.sessionHash,
    ),
  ])

  return context.json({ ok: true })
})
