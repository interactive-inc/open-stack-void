# CLI

ルートの README の手順でビルドし、ブラウザで発行したトークンをコピーしてください。

```sh
node apps/cli/dist/cli.mjs --help
node apps/cli/dist/cli.mjs --clipboard channels list
```

認証用の秘密は明示的なクリップボード操作だけで受け取ります。初期化とパスキー管理はブラウザで完結します。
