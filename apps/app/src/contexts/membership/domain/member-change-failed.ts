export class MemberChangeFailed extends Error {
  constructor(readonly reason: "forbidden" | "missing" | "changed") {
    super(
      {
        forbidden: "このメンバーを変更する権限がありません",
        missing: "メンバーが見つかりません",
        changed: "権限またはメンバーの状態が変わりました。再読み込みしてください",
      }[reason],
    )
  }
}
