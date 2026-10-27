import { queryClient } from "@/client/query-client"
import { synchronizeMessages } from "@/client/synchronize-messages"

export function subscribeChannel(
  channelId: string,
  onStatus: (status: "connecting" | "connected" | "retrying") => void = () => undefined,
) {
  const connection: {
    socket: WebSocket | null
    isClosed: boolean
    timeout: number
    attempt: number
    heartbeat: number
  } = {
    socket: null,
    isClosed: false,
    timeout: 0,
    attempt: 0,
    heartbeat: 0,
  }
  const open = () => {
    const socket = new WebSocket(
      `${location.origin.replace(/^http/, "ws")}/api/channels/${encodeURIComponent(channelId)}/socket`,
    )
    connection.socket = socket
    socket.onmessage = (event) => {
      if (connection.isClosed || connection.socket !== socket) return
      if (event.data === "pong") clearTimeout(connection.heartbeat)
      void synchronizeMessages(channelId).catch(() => undefined)
      if (event.data !== "pong") void queryClient.invalidateQueries({ queryKey: ["channels"] })
    }
    socket.onopen = () => {
      if (connection.isClosed) {
        socket.close()
        return
      }
      onStatus("connected")
      connection.attempt = 0
      void synchronizeMessages(channelId).catch(() => undefined)
      void queryClient.invalidateQueries({ queryKey: ["channels"] })
    }
    socket.onclose = (event) => {
      if (connection.socket !== socket) return
      clearTimeout(connection.heartbeat)
      if (connection.isClosed) return
      if (event.code === 1008) {
        queryClient.setQueryData(["messages", channelId], [])
        void queryClient.invalidateQueries({ queryKey: ["me"] })
        return
      }
      onStatus("retrying")
      if (!connection.isClosed)
        connection.timeout = window.setTimeout(
          open,
          Math.min(30_000, 1000 * 2 ** connection.attempt++),
        )
    }
  }
  const ping = setInterval(() => {
    if (connection.socket?.readyState === WebSocket.OPEN) {
      const socket = connection.socket
      socket.send("ping")
      connection.heartbeat = window.setTimeout(() => socket.close(), 10_000)
    }
  }, 25_000)
  const reconnect = () => {
    if (connection.isClosed || connection.socket?.readyState === WebSocket.CONNECTING) return
    if (connection.socket?.readyState === WebSocket.OPEN) {
      void synchronizeMessages(channelId).catch(() => undefined)
      return
    }
    clearTimeout(connection.timeout)
    connection.attempt = 0
    open()
  }
  window.addEventListener("online", reconnect)

  open()

  return () => {
    connection.isClosed = true
    window.removeEventListener("online", reconnect)
    clearInterval(ping)
    clearTimeout(connection.timeout)
    clearTimeout(connection.heartbeat)
    connection.socket?.close()
  }
}
