import { useEffect, useRef, useState } from "react"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

type Props = { channelId: string; sequence: number; paused: boolean }

/** 前面にある会話で末尾を実際に表示したときだけ、自分の確認位置を進める。 */
export function ChannelReadMarker(props: Props) {
  const element = useRef<HTMLDivElement>(null)
  const error = useState(false)
  const retry = useState(0)
  useEffect(() => {
    const node = element.current
    const viewport = node?.closest('[data-slot="message-scroller-viewport"]')
    if (!node || !viewport || props.paused || !props.sequence) return
    let stopped = false
    let pending = false
    let acknowledged = false
    let timer = 0
    const check = () => {
      clearTimeout(timer)
      const rect = node.getBoundingClientRect()
      const bounds = viewport.getBoundingClientRect()
      if (
        stopped ||
        acknowledged ||
        pending ||
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        getComputedStyle(node).visibility !== "visible" ||
        rect.top < bounds.top ||
        rect.bottom > bounds.bottom
      )
        return
      timer = window.setTimeout(() => {
        const current = node.getBoundingClientRect()
        const visible = viewport.getBoundingClientRect()
        if (
          stopped ||
          document.visibilityState !== "visible" ||
          !document.hasFocus() ||
          getComputedStyle(node).visibility !== "visible" ||
          current.top < visible.top ||
          current.bottom > visible.bottom
        )
          return
        pending = true
        void chatClient
          .markChannelRead(props.channelId, props.sequence)
          .then(() => {
            acknowledged = true
            if (!stopped) {
              error[1](false)
              void queryClient.invalidateQueries({ queryKey: ["channel-activity"] })
            }
          })
          .catch(() => {
            if (!stopped) error[1](true)
          })
          .finally(() => {
            pending = false
          })
      }, 400)
    }
    const observer = new IntersectionObserver(check, { root: viewport, threshold: 1 })
    observer.observe(node)
    viewport.addEventListener("scroll", check)
    window.addEventListener("focus", check)
    window.addEventListener("blur", check)
    document.addEventListener("visibilitychange", check)
    check()
    return () => {
      stopped = true
      clearTimeout(timer)
      observer.disconnect()
      viewport.removeEventListener("scroll", check)
      window.removeEventListener("focus", check)
      window.removeEventListener("blur", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [props.channelId, props.sequence, props.paused, retry[0]])
  return (
    <div ref={element} className="min-h-px">
      {error[0] && (
        <Alert variant="destructive">
          <AlertDescription>
            確認位置を保存できませんでした。
            <Button size="xs" variant="ghost" onClick={() => retry[1]((value) => value + 1)}>
              再試行
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
