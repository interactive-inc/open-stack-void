import { QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { queryClient } from "@/client/query-client"
import { AppScreen } from "@/screens/app-screen"
import "@/styles/globals.css"

export default function HomePage(props: { authorizationId: string | null }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <title>Void Chat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <AppScreen authorizationId={props.authorizationId} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
