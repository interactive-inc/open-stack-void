# MCP

- Use the official MCP SDK with stdio. Stdout is reserved for protocol messages.
- Use the shared SDK and server authorization; never introduce an administrator bypass.
- Expose tool failure as `isError`; include accurate read-only/destructive annotations.
- Use relative imports within this small Node package. Keep connection credentials outside tracked files.
