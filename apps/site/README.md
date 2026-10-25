# Open Stack Void の紹介サイト

```sh
vp run dev
```

リポジトリルートで起動します。公開サイトは http://void.stack.localhost/、EmDash 管理画面は http://void.stack.localhost/_emdash/admin です。別ターミナルで `vp run seed:site` を実行すると、トップ・概要・導入／CLI・MCP／設計の記事を追加します。既存編集は上書きしません。

トップは Pages の home、概要は Pages の about、記事一覧と詳細は Posts から取得します。サイト名はサイト設定で編集します。ボイラープレートが主役で、Void Chat は同梱サンプルです。ソースは [interactive-inc/open-stack-void](https://github.com/interactive-inc/open-stack-void) です。

本番の公開先は stack.inta.site、アプリのサンプルへのリンクは PUBLIC_APP_URL で設定します。公開・ドメイン設定は別途行います。
