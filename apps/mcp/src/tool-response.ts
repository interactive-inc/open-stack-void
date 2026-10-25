import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

export async function toolResponse(operation: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const payload = await operation()

    return { content: [{ type: "text", text: JSON.stringify(payload) }] }
  } catch (error) {
    return {
      isError: true,
      content: [
        { type: "text", text: error instanceof Error ? error.message : "Operation failed" },
      ],
    }
  }
}
