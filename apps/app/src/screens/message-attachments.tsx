import { useMutation } from "@tanstack/react-query"
import type { Attachment as ChatAttachment } from "@open-stack/sdk/contracts"
import {
  Attachment,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentAction,
} from "@/components/ui/attachment"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { chatClient } from "@/client/chat-client"

export function MessageAttachments(props: { attachments: ChatAttachment[]; channelId: string }) {
  const download = useMutation({
    mutationFn: async (attachment: ChatAttachment) => ({
      attachment,
      blob: await chatClient.downloadAttachment(props.channelId, attachment.id),
    }),
    onSuccess: ({ attachment, blob }) => {
      const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }))
      const link = document.createElement("a")
      link.href = url
      link.download = attachment.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })
  if (!props.attachments.length) return null
  return (
    <div className="flex flex-col gap-2">
      {props.attachments.map((attachment) => (
        <Attachment key={attachment.id} size="sm" state="done">
          <AttachmentContent>
            <AttachmentTitle>{attachment.name}</AttachmentTitle>
            <AttachmentDescription>{Math.ceil(attachment.size / 1024)} KiB</AttachmentDescription>
          </AttachmentContent>
          <AttachmentAction
            aria-label={`${attachment.name} をダウンロード`}
            disabled={download.isPending}
            onClick={() => download.mutate(attachment)}
          >
            ↓
          </AttachmentAction>
        </Attachment>
      ))}
      {download.error && (
        <Alert variant="destructive">
          <AlertDescription>{download.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
