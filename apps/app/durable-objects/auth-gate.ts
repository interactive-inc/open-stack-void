import { defineDurableState } from "void/durable"

export const AuthGate = defineDurableState({
  name: "auth-gate",
  initialState: { window: 0, count: 0 },
  methods: {
    allow(context) {
      const window = Math.floor(Date.now() / 60_000)

      if (context.state.window !== window) context.state = { window, count: 0 }

      context.state.count += 1

      return context.state.count <= 30
    },
  },
})

export default AuthGate
