/** 端末の本人確認で発生した失敗を、やり直せる案内に置き換える。 */
export function authenticationError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error("本人確認に失敗しました。もう一度お試しください")
  if (error.name === "NotAllowedError")
    return new Error(
      "端末での本人確認が完了しませんでした。登録済みの端末でやり直してください。初めて使う場合は管理者からの招待が必要です",
    )
  if (error.name === "InvalidStateError")
    return new Error(
      "この端末には既に認証用の鍵が登録されています。登録を取り消し、ログインしてください",
    )
  if (error.name === "NotSupportedError" || error.name === "SecurityError")
    return new Error(
      "この画面では端末の本人確認を利用できません。公開された正しいアドレスを、普段使っているブラウザで開いてください",
    )
  return error
}
