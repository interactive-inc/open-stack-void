import { useQuery } from "@tanstack/react-query"
import { ChatScreen } from "@/screens/chat-screen"
import { LoginScreen } from "@/screens/login-screen"
import { chatClient } from "@/client/chat-client"
import { Skeleton } from "@/components/ui/skeleton"
import { AuthorizationScreen } from "@/screens/authorization-screen"
import { RequestFailed } from "@open-stack/sdk"

type Props = { authorizationId: string | null }

/** セッションに応じた画面を表示する。 */
export function AppScreen(props: Props) {
  const viewer = useQuery({
    queryKey: ["me"],
    queryFn: () => chatClient.me(),
    refetchInterval: 30_000,
  })

  if (viewer.isPending)
    return (
      <main className="grid min-h-dvh place-items-center">
        <Skeleton className="h-2 w-16" aria-label="読み込み中" />
      </main>
    )

  if (
    !viewer.data ||
    (viewer.error instanceof RequestFailed && [401, 403].includes(viewer.error.status))
  )
    return <LoginScreen />

  if (props.authorizationId) return <AuthorizationScreen requestId={props.authorizationId} />

  return <ChatScreen viewer={viewer.data} />
}
