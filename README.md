# Open Stack Void

フルスタック開発のためのオープンソースのボイラープレートです。Void Chat は、認証・メンバー管理・リアルタイム通信・CLI／MCP の基盤を示す同梱サンプルです。

ソース: [interactive-inc/open-stack-void](https://github.com/interactive-inc/open-stack-void)。ライセンス種別は、このリポジトリに LICENSE が追加されるまで指定しません。

- `apps/app`: Void / React、パスキー、招待、メンバー管理、Durable Objects のチャット
- `apps/site`: Astro / EmDash の公開サイト
- `apps/cli`: クリップボード認証の CLI
- `apps/mcp`: ブラウザ承認の stdio MCP
- `packages/sdk`: 共通 API クライアント

## ローカル起動

Node.js 24.22.1（`.node-version`）と、`package.json` に固定した npm 12.2.1 を使います。操作入口は Vite+ の `vp` です。公式のプロジェクトローカル CLI を利用し、グローバル CLI の自己セットアップは実行しません。

この手順は利用できる `vp` が既に用意された端末向けです。グローバルインストーラー1.4.0は内部で別のパッケージ管理を使うため、このプロジェクトの導入手順には含めません。

クリーンな Windows 端末の公式初期化は pnpm 10.34.7 を実行することをソースで確認したため、「初回導入から全操作 vp・pnpm 不使用」の成立を確認済みとはしていません。npm による公式ローカル CLI の導入は別経路として存在しますが、最初の入口が vp ではありません。根拠と制約は [初回導入の確認](.docs/clean-bootstrap.md) を参照してください。

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
