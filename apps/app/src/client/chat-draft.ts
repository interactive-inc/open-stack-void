export type ChatDraft = { text: string; id: string | null; replyToId: string | null }
export const emptyChatDraft: ChatDraft = { text: "", id: null, replyToId: null }
