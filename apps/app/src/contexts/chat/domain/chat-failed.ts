export type ChatFailureReason = "forbidden" | "missing" | "archived" | "conflict" | "invalid"

export class ChatFailed extends Error {
  constructor(readonly reason: ChatFailureReason) {
    super(
      {
        forbidden: "アクセス権がありません。ログイン状態を確認してください",
        missing: "チャンネルが見つかりません",
        archived: "アーカイブ済みのため送信できません",
        conflict: "名前または送信IDが既に使用されています",
        invalid: "入力を確認してください",
      }[reason],
    )
  }
}
