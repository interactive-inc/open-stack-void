# Void Chat の紹介サイト

```sh
vp run dev
```

リポジトリルートで起動します。公開サイトは http://void.stack.localhost/、EmDash 管理画面は http://void.stack.localhost/_emdash/admin です。別ターミナルで `vp run seed:site` を実行すると、トップ・概要・9ページの使い方・3件の導入記事を追加します。既存編集は上書きしません。

トップは Pages の home、概要は Pages の about、記事一覧と詳細は Posts から取得します。サイト名はサイト設定で編集します。初めて使う人が登録から会話へ進める案内を中心に、Void Chat の業務利用と実装済みの機能を紹介します。開発基盤の説明は補足として残します。ソースは [interactive-inc/open-stack-void](https://github.com/interactive-inc/open-stack-void) です。

本番の公開先は stack.open.inta.site、チャットへのリンクは PUBLIC_APP_URL で設定します。公開・ドメイン設定は別途行います。

使い方は `/guide` から、初回登録・未読の確認・返信・再送・投稿の編集と削除・過去の投稿の検索・部屋の作成・招待・本人確認・困ったとき・CLI・MCP の案内へ進めます。再投入は既存の編集や公開状態を上書きしません。
