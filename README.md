# Open Stack Void

フルスタック開発のためのオープンソースのボイラープレートです。Void Chat は、認証・メンバー管理・リアルタイム通信・CLI／MCP の基盤を示す同梱サンプルです。

ソース: [interactive-inc/open-stack-void](https://github.com/interactive-inc/open-stack-void)。ライセンス種別は、このリポジトリに LICENSE が追加されるまで指定しません。

- `apps/app`: Void / React、パスキー、招待、メンバー管理、Durable Objects のチャット
- `apps/site`: Astro / EmDash の公開サイト
- `apps/cli`: クリップボード認証の CLI
- `apps/mcp`: ブラウザ承認の stdio MCP
- `packages/sdk`: 共通 API クライアント

## ローカル起動

Node.js は `.node-version`、npm バックエンドは `package.json` の固定版を使います。利用者の操作入口は Vite+ の `vp` です。公式インストーラーの内部処理は許容し、プロジェクトから別のパッケージ管理を直接呼び出しません。以前の初回導入制約は [新しい判断](.docs/harness-intent.md) で更新しました。完全に空の Mac での初回導入は未検証です。

インストールは開発サーバーを停止して行います。最初の段階では依存スクリプトを無効化し、`prepare:local` がロック全体の公開日時を確認してから許可済みビルドだけを実行します。公開日時不明・24時間未満・外部 tarball は拒否します。依存を追加・更新した後も `vp run prepare:local` を実行してください。

```sh
vp install --frozen-lockfile
vp run prepare:local
vp run setup
vp run dev
```

[アプリ](http://app.void.stack.localhost/) を開き、`apps/app/.env` の初期化キーをブラウザへ貼り付けて、最初の所有者のパスキーを登録します。`vp run setup` はローカル専用のキーを生成し、既存値は上書きしません。キーを URL やターミナルに入力する必要はありません。

`vp run dev` は Portless でアプリと公開サイトを同時起動します。HTTP の80番ポートを使用し、プロキシはループバックに限定します。証明書の信頼登録・hosts・ファイアウォールは変更しません。80番が使用中なら既存プロセスを停止せず、競合を解消してから起動してください。

[公開サイト](http://void.stack.localhost/) / [EmDash 管理画面](http://void.stack.localhost/_emdash/admin)。CMS の編集者はアプリのアカウントと別管理です。通常サーバーの起動後、別ターミナルで `vp run seed:site` を実行してください。トップ・概要・導入記事が EmDash の正規データとして取り込まれます。`/about` は Pages の about、トップは Pages の home、記事一覧と詳細は Posts を表示します。

seed はローカルの `127.0.0.1:4321` のみに接続します。同じ slug の既存データは、下書き・非公開・ゴミ箱を含め上書きせず、メニュー・ウィジェット・既存設定も置き換えません。管理者・パスキー・トークンは作成しません。旧スターターの未セットアップ環境（ユーザーなし・既定のタイトルと説明のみ）は名称を Open Stack Void に移行します。

招待メールはローカル受信箱へ保存されます。開発サーバーに表示される受信箱リンクを使います。実メール送信と本番ドメインは未設定です。公開前に送信元と対象環境を設定してください。

## CLI

```sh
vp -C apps/cli run build
vp exec node apps/cli/dist/cli.mjs login
```

ブラウザでログインし、アカウントから CLI トークンを発行してコピーします。

```sh
vp exec node apps/cli/dist/cli.mjs --clipboard me
vp exec node apps/cli/dist/cli.mjs --clipboard channels list
vp exec node apps/cli/dist/cli.mjs --clipboard messages send general hello
```

認証用の秘密は `--clipboard` を付けた操作だけで読み取ります。引数・環境変数・ターミナル入力・平文設定ファイルには渡しません。Windows、macOS、Wayland のクリップボードに対応し、利用できない環境で平文入力へ切り替えません。公開 URL は `--server` または `VOID_CHAT_URL` で指定できます。

## MCP

```sh
vp -C apps/mcp run build
vp exec node apps/mcp/dist/server.mjs
```

MCP クライアントには上の vp コマンドを stdio サーバーとして登録します。クライアントの PATH にも、対応する Node とプロジェクトローカルの vp を設定してください。起動先の作業ディレクトリはリポジトリルート、またはスクリプトに絶対パスを指定します。

`begin_login` が返す公開承認 URL と確認コードを使い、本人がブラウザでパスキー確認して承認します。その後 `complete_login` を実行します。認証用の秘密は MCP の引数や応答に出ません。

## 検証

```sh
vp fmt
vp run lint
vp run check
vp run test
vp run build
vp run test:e2e
```

ブラウザテストはローカル限定です。インストール済み Chrome と仮想パスキーを使い、5183・5184・4322 の専用サーバーと Git 管理外の `.local/` にデータを分離します。通常の開発用データには書き込みません。Astro は同じプロジェクトの開発サーバーを同時起動できないため、サイトの開発サーバーを停止してから実行してください。

開発ルールは `AGENTS.md`、デザインは `DESIGN.md`、判断の背景は各プロジェクトの `.docs/` で管理します。公式スキルはプロジェクト内の `.agents/skills/` と `skills-lock.json` に固定されています。

ローカルURLはこの Windows 開発端末内専用です。別端末の localhost からは接続できません。旧 localhost のパスキーは RP ID が異なるため新ホストでは使えません。既存データは保持されます。既存利用者の新ホストへのパスキー移行は未提供です。旧ホストを利用し続ける場合は APP_ORIGIN を元に戻してください。

新ホストの回帰検証は、通常の開発サーバーを停止して `vp run test:e2e:portless` を実行します。毎回独立した `.local/` のデータで仮想パスキー、Cookie、WebSocket、Origin/CORS、CLI と MCP のブラウザ承認を確認します。Portless の hosts sync 警告は Windows の標準 DNS に対するもので、Chrome と本プロジェクトの CLI／MCP は OS 設定を変更せずに接続します。

CMS の独立した回帰検証: `vp run test:e2e:cms`。通常のサイトを停止して実行します。専用データで seed 初回／再実行、編集保持、記事の下書き・公開・更新・非公開、リンク遷移と再読込を検証します。

## 開発ハーネス

エージェントは [AGENTS.md](AGENTS.md) から [判断記録の入口](.docs/README.md) を読みます。`vp run setup:scanner` はチェックサム固定の検査ツールを `.local` に準備します。`vp run verify` が標準検証、`vp run verify:full` が分離ブラウザ検証を含む全体検証です。通常サーバーと同じポートを使う検証は同時起動しません。

コミット後、同じクリーン SHA で全体検証と `vp run check:secrets` を通してから、`vp run release:plan -- 0.1.0` でローカルの変更履歴案・リリース候補を作れます。タグ公開やデプロイは実行しません。
