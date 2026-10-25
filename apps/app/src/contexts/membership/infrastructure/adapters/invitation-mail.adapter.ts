import { sendEmail } from "void/email"

export class InvitationMailAdapter {
  async send(email: string, link: string) {
    const delivery = await sendEmail({
      to: email,
      subject: "Void Chat への招待",
      text: `Void Chat に招待されました。次のリンクからパスキーを登録してください。招待は7日間有効です。\n\n${link}`,
    })

    if (!delivery.ok) {
      console.warn(
        "Invitation email rejected",
        "error" in delivery
          ? delivery.error.code
          : delivery.deliveries.filter((item) => !item.ok).map((item) => item.error.code),
      )
      return new Error("メールを送信できませんでした。送信設定を確認してください")
    }

    return null
  }
}
