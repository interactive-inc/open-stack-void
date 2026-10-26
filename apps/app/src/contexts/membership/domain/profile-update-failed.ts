export class ProfileUpdateFailed extends Error {
  constructor(readonly reason: "inactive" | "invalid-name" | "unavailable") {
    super(
      reason === "invalid-name"
        ? "表示名は1〜80文字で入力してください"
        : "プロフィールを更新できません。ログイン状態を確認してください",
    )
  }
}
