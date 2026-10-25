# 移行時の依存監査

npm 移行直後の監査では moderate 11件・high 13件が報告された。伝播した依存の件数であり、独立した問題が24個あったという意味ではない。根にある esbuild、Undici、Zod の対象版は移行前のロックにも含まれていた。移行では Undici の修正版が重複解消で外れたため、その差も確認した。

CMS の入力検証にも関わる [Zod のメモリ消費問題](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) は、同じ4系の修正版へ揃えた。開発エミュレーターやネットワーク処理が参照する [Undici の問題](https://github.com/advisories/GHSA-4qv8-2p9j-2685) も、既に旧ロックに存在していた7系の修正版へ揃えた。どちらも公開日時を検証し、例外を設けていない。

残る moderate 6件は、Void の開発用データベースツールから古い esbuild へ至る依存関係に由来する。[対象の問題](https://github.com/advisories/GHSA-67mh-4wv8-2f99) は esbuild 自身の開発サーバーに関するもの。通常のアプリとサイトは Vite+／Astro のサーバーを使用し、この esbuild の serve API を起動する構成ではない。持ち越しは残して記録し、ツールの別の用途まで安全とみなさない。強制的な0系の更新や Void／EmDash の大きな版変更は今回の移行に混ぜない。[[package-management]]。
