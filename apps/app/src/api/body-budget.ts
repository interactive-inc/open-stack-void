export function bodyBudget(method: string, path: string, attachmentMaximum: number) {
  return method === "POST" && /^\/api\/channels\/[^/]+\/attachments$/.test(path)
    ? attachmentMaximum + 16_384
    : 16_384
}
