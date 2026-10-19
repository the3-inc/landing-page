# 会社サイトと製品Webの接続確認

会社サイトとschedulaの公開用成果物を、同じ公開パスで確認します。通常の開発サーバー、APIの入力制限、各リポジトリの独立した公開は維持します。
Python 3.9以上の標準ライブラリを使い、会社側の`dist/`と製品側の生成先を入力します。各出力先は空の場所に作り、APIの計算は既存の製品テスト・コンテナーsmokeで確認してください。

## 生成物を使う

会社サイトで通常の検査・ビルドを行います。

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
pnpm build
```

schedulaのcheckoutで公開用の生成物を作ります。次の`/tmp/schedula-public-site`は未使用の空の出力先に置き換えてください。

```sh
uv sync --locked
uv run --no-sync python -m web.build /tmp/schedula-public-site
```

会社サイトのcheckoutへ戻り、次を実行します。`--product`は`products/schedula/`を含む生成先のrootです。

```sh
python3 scripts/site_check.py --company dist --product /tmp/schedula-public-site
python3 scripts/site_check.py --company dist --product /tmp/schedula-public-site --serve
```

検査に成功すると、プレビューは`http://127.0.0.1:4322/`で起動します。`--port`で変更でき、Ctrl+Cで終了します。
生成物は一時ディレクトリへコピーし、終了後に削除します。入力した成果物は変更せず、同じファイルの重複やsymlinkは拒否します。
デモ・技術案内の末尾スラッシュを308で補完し、存在しないファイルは404を返します。このプレビューは静的表示専用で、計算APIは起動しません。

一覧→紹介→デモ・文書→紹介を確認し、キーボードの最初のTabで本文への移動リンクが選べること、320px程度の幅でも横にはみ出さないことを確認します。
製品の計算まで含めた接続は、schedulaの既存ブラウザーテストに会社の生成先を渡して確認できます。

```sh
# schedulaのcheckoutで実行。Playwrightは既存のブラウザー検証環境を使う
COMPANY_SITE_DIR=/absolute/path/to/landing-page/dist node tests/public-browser.cjs
```

このテスト用serverはlocalhostで会社の生成物と製品の公開handlerを接続します。本番handlerのOrigin・入力検査は変更しません。

## 公開URLを使う

両方のコンテンツが配備された状態では、会社側の次の検査を使います。GETによる静的参照の確認であり、APIの計算リクエストは送りません。

```sh
python3 scripts/site_check.py --url https://the3.co.jp
```

会社5ページと製品2ページ、CSS・JS・画像・文書、`#contact`と公開教材のフラグメントを照合します。
一覧→紹介→デモ・文書→紹介・相談の必須リンクが削除された場合も失敗します。正規ページ・ファイルのURLからの意図しない転送は拒否し、別ページの正常な応答で代替させません。
ファイルの代わりにHTMLが返る場合も失敗とし、demo/docsの末尾スラッシュと未知の文書の403/404を確認します。

会社の公開workflowは、5ページの応答確認後にこの接続検査を実行します。初回はデモ・文書を先に公開してください。
製品の公開workflowは`web.smoke --public`で製品所有の静的参照と3教材の計算を検証し、会社の初回公開には依存しません。
製品更新後も、上の会社側検査で公開済み会社ページとの往復を確認します。相手のタグ公開やTerraform applyは呼び出しません。

自動検査が確認するのはファイルと遷移先の整合です。ブラウザーの描画・操作やCloudFront runtimeの検証を代替しません。
