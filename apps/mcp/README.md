# MCP

公式 MCP SDK の stdio サーバーです。

```sh
vp -C apps/mcp run build
vp exec node apps/mcp/dist/server.mjs
```

`begin_login` → ブラウザでパスキー確認・承認 → `complete_login` の順に接続します。接続資格情報はプロセス内だけに保持し、クリップボード、ツールの引数・応答、平文設定ファイルを使いません。
