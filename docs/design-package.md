# 共有デザインパッケージ

正本は`packages/brand/`、会社サイトは`@the3/brand`をworkspace依存として使います。利用方法・固定版の取得・配布条件は[パッケージの説明](../packages/brand/README.md)を参照してください。

## 更新と正式発行

1. パッケージと`CHANGELOG.md`を更新し、`package.json`の版を上げます。会社サイトのCSSも同じ変更で確認します。
2. `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm test`、`python3 -m unittest discover -s tests -p 'test_*.py' -v`、`pnpm build`、`pnpm pack:design`を確認します。
3. mainへ統合し、対象コミットのmain push CIが成功したことを確認します。
4. 対象コミットへ`design-v1.0.0`形式のタグを作りpushします。既存タグの移動・配布物の差し替えは禁止です。
5. `Release design package`がタグと版、mainへの包含、CI成功、配布物を検証してGitHub Releaseを発行します。手動実行でも既存の`design-v*`タグを指定します。
6. 利用先で固定版を更新するPRを作り、表示・操作・公開用ビルドを確認します。

配布workflowだけが`contents: write`を持ち、CI確認に`actions: read`を使います。AWS認証・サイト公開・他リポジトリへの書き込みは行いません。既存の`v*`会社サイト公開と独立しています。失敗したdraftは内容を確認してから回復し、公開済みの版は再利用しません。

`pnpm pack:design`の出力先は`.design-dist/`で、会社サイトの`dist/`とは分離します。再作成するときは前の配布物を確認してから出力先を空にします。

ローカル配布物の`source_state=working-tree`は未発行の検証用です。正式Releaseの代わりにはしません。初回のschedula導入はこの検証用配布物で行い、初版発行後に同じ更新手順で正式版へ固定し直します。

## ブラウザー検証

`pnpm build`後、CIと同じPlaywright 1.62.1と対応するChromiumを用意し、`PLAYWRIGHT_MODULE_PATH`にPlaywrightの配置先を指定して`pnpm test:browser`を実行します。CIでは一時フォルダへ検証ツールを入れます。ライト・ダーク、320/390/768/1440px、本文スキップ、背景・フォント・動きを減らす設定を検証し、画面画像を`test-results/design/`へ保存します。
