type Props = {
  request: Request
  key: string | undefined
}

const cookieName = "__Secure-open-stack-setup"
const setupPage = "/_emdash/admin/setup"
const headers = { "Cache-Control": "no-store", "X-Frame-Options": "DENY" }

/** 初期設定の鍵を確認し、このブラウザだけに登録画面の利用を許可する。 */
export async function setupAccess(props: Props): Promise<Response | null> {
  const url = new URL(props.request.url)
  const cookie = props.request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
  const authorized =
    Boolean(props.key) &&
    (props.request.headers.get("x-emdash-setup-key") === props.key ||
      cookie?.includes(`${cookieName}=${props.key}`))

  if (props.request.method === "POST" && url.pathname === `${setupPage}/unlock`) {
    if (props.request.headers.get("origin") !== url.origin)
      return new Response("この画面から操作してください。", { status: 403, headers })
    const body = await props.request.formData()
    if (!props.key || body.get("key") !== props.key)
      return new Response("鍵が一致しません。前の画面に戻って入力し直してください。", {
        status: 403,
        headers,
      })
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: setupPage,
        "Set-Cookie": `${cookieName}=${props.key}; Path=/_emdash; Secure; HttpOnly; SameSite=Strict; Max-Age=1800`,
      },
    })
  }
  if (authorized) return null
  if (url.pathname.startsWith("/_emdash/api/setup"))
    return Response.json({ error: "初期設定の鍵を入力してください。" }, { status: 403, headers })
  if (url.pathname !== setupPage && url.pathname !== `${setupPage}/`) return null
  return new Response(
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>管理者の初期設定</title><style>body{font-family:system-ui;max-width:28rem;margin:12vh auto;padding:1.5rem;line-height:1.8}input{box-sizing:border-box;width:100%;padding:.7rem;margin:.5rem 0 1rem}button{padding:.6rem 1rem}h1{font-size:1.5rem}</style><h1>管理者の初期設定</h1><p>初期設定の鍵を入力すると、このブラウザで30分間、管理者を登録できます。</p><form method="post" action="${setupPage}/unlock"><label for="key">初期設定の鍵</label><input id="key" name="key" type="password" autocomplete="off" required autofocus><button type="submit">登録画面へ進む</button></form></html>`,
    {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  )
}
