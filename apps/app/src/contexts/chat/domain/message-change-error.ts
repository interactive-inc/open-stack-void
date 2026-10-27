/** 投稿を変更できない理由と、呼び出し元へ返す状態を保持する。 */
export class MessageChangeError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409,
  ) {
    super(message)
  }
}
