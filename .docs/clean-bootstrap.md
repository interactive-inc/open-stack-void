# クリーン端末での初回導入

「pnpm を実行しない」と「初回導入から操作入口をすべて vp にする」を同時に満たす Windows の公式標準経路は、Vite+ 1.4.0 の静的確認では成立しなかった。これは既存の準備済み環境で動いたこととは別の判断である。[[package-management]]。

新しい分離フォルダーで公開レジストリのメタデータと公式ソースだけを取得し、初期化や依存スクリプトは実行しなかった。npm の公開 provenance が指すソースコミットは `102fe8edad2c45690f24830feee30bfe242817ee`。既存の VP_HOME、CLI キャッシュ、PATH の準備状態を初回導入の成功証拠にしていない。

この版の [install.rs](https://github.com/voidzero-dev/vite-plus/blob/102fe8edad2c45690f24830feee30bfe242817ee/crates/vp_setup/src/install.rs#L123) は初期化用の pnpm 10.34.7 を固定し、ラッパーの packageManager に書き込む。同ファイルの [install_production_deps](https://github.com/voidzero-dev/vite-plus/blob/102fe8edad2c45690f24830feee30bfe242817ee/crates/vp_setup/src/install.rs#L200) はその pnpm を取得し、[node から pnpm.cjs を起動](https://github.com/voidzero-dev/vite-plus/blob/102fe8edad2c45690f24830feee30bfe242817ee/crates/vp_setup/src/install.rs#L352)する。[self_setup.rs](https://github.com/voidzero-dev/vite-plus/blob/102fe8edad2c45690f24830feee30bfe242817ee/crates/vp_global_cli/src/self_setup.rs#L253) がこれを呼ぶ。[Windows インストーラー](https://github.com/voidzero-dev/vite-plus/blob/102fe8edad2c45690f24830feee30bfe242817ee/crates/vp_installer/src/main.rs#L1)も、取得したバイナリの自己初期化に委譲する。

[公式ローカル CLI の説明](https://viteplus.dev/guide/local-cli#manual-installation)には npm を使う導入方法があるため、pnpm なしの Vite+ 利用自体が不可能なわけではない。しかし Node と既存パッケージ管理が必要で、最初の操作は vp ではない。自己初期化の依存取得をスキップする内部フラグは、npm に置き換える正式な導入手順ではないため使用しない。

必要な判断は、CLI が事前に供給された環境を前提にするか、CLI 初回取得だけ別の入口を認めるかである。どちらも勝手に採用せず、現在の README は前者を前提条件として明示する。完全に空の端末から、現在の二つの制約を保った導入が成功したとは扱わない。通常サーバーと既存データは変更していない。
