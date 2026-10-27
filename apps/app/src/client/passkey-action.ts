import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser"
import { z } from "zod"
import { authenticationError } from "@/client/authentication-error"

export async function passkeyAction(
  action: "login" | "register" | "reauth",
  name = "",
  bootstrap: string | null = null,
) {
  const parameters = new URLSearchParams(location.hash.slice(1))
  const optionsResponse = await fetch(`/api/auth/${action}/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, invitation: parameters.get("invite"), bootstrap }),
  })

  if (!optionsResponse.ok) {
    const failure = await optionsResponse.json()
    throw new Error(z.object({ error: z.string() }).parse(failure).error)
  }

  const options = await optionsResponse.json()
  const response =
    action === "register"
      ? await startRegistration({
          optionsJSON: z
            .custom<PublicKeyCredentialCreationOptionsJSON>(
              (value) =>
                z
                  .object({
                    challenge: z.string(),
                    rp: z.object({ name: z.string() }),
                    user: z.object({ id: z.string(), name: z.string() }),
                    pubKeyCredParams: z.array(
                      z.object({ type: z.literal("public-key"), alg: z.number() }),
                    ),
                  })
                  .safeParse(value).success,
            )
            .parse(options),
        }).catch((error: unknown) => {
          throw authenticationError(error)
        })
      : await startAuthentication({
          optionsJSON: z
            .custom<PublicKeyCredentialRequestOptionsJSON>(
              (value) => z.object({ challenge: z.string() }).safeParse(value).success,
            )
            .parse(options),
        }).catch((error: unknown) => {
          throw authenticationError(error)
        })
  const verificationResponse = await fetch(`/api/auth/${action}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  })

  if (!verificationResponse.ok) {
    const failure = await verificationResponse.json()
    throw new Error(z.object({ error: z.string() }).parse(failure).error)
  }

  history.replaceState(null, "", location.pathname + location.search)
}
