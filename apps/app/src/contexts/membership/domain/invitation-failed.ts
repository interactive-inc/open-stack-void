export class InvitationFailed extends Error {
  constructor(readonly reason: "forbidden" | "registered" | "conflict" | "delivery" | "used") {
    super(
      {
        forbidden: "招待を管理する権限がありません。メンバーを再読み込みしてください",
        registered: "登録済みのメールアドレスです",
        conflict: "この宛先への招待が残っています。一覧を確認し、取消後に再度招待してください",
        delivery: "メールを送信できませんでした。招待を作り直してください",
        used: "この要求IDは再利用できません。新しい招待として作成してください",
      }[reason],
    )
  }
}
