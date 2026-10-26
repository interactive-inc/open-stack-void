export type ChatFailureReason =
  | "forbidden"
  | "missing"
  | "archived"
  | "conflict"
  | "invalid"
  | "too-large"
  | "capacity"

export class ChatFailed extends Error {
  constructor(readonly reason: ChatFailureReason) {
    super(
      {
        forbidden: "アクセス権がありません。ログイン状態を確認してください",
        missing: "チャンネルが見つかりません",
        archived: "アーカイブ済みのため送信できません",
        conflict: "名前または送信IDが既に使用されています",
        invalid: "入力を確認してください",
        "too-large": "添付は512KiB以下にしてください",
        capacity: "チャンネルの添付上限（200件 / 16MiB）です。管理者に相談してください",
      }[reason],
    )
  }
}
