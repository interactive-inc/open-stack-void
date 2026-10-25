import { queryClient } from "@/client/query-client"

export function subscribeChannel(channelId: string) {
  const connection: { socket: WebSocket | null; isClosed: boolean; timeout: number } = {
    socket: null,
    isClosed: false,
    timeout: 0,
  }
  const open = () => {
    const socket = new WebSocket(
      `${location.origin.replace(/^http/, "ws")}/api/channels/${encodeURIComponent(channelId)}/socket`,
    )
    connection.socket = socket
    socket.onmessage = (event) => {
      if (event.data !== "pong")
        void queryClient.invalidateQueries({ queryKey: ["messages", channelId] })
    }
    socket.onopen = () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", channelId] })
    }
    socket.onclose = () => {
      if (!connection.isClosed) connection.timeout = window.setTimeout(open, 2000)
    }
  }
  const ping = setInterval(() => {
    if (connection.socket?.readyState === WebSocket.OPEN) connection.socket.send("ping")
  }, 25_000)

  open()

  return () => {
    connection.isClosed = true
    clearInterval(ping)
    clearTimeout(connection.timeout)
    connection.socket?.close()
  }
}
