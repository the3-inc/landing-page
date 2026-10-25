# landing-page

Astro と Tailwind CSS 4 で構築した、the3合同会社の会社サイトです。
静的ファイルを S3 に配置し、CloudFront 経由で `https://the3.co.jp` に公開します。

インフラ構築はprivateの [infra](https://github.com/the3-inc/infra)、会社サイトの公開はこのリポジトリが担当します。
会社・デモの配信基盤をinfra側で一括構築し、各コードリポジトリは自分の成果物だけを独立して公開します。

会社ページは /、/company/、/contact/、/products/、/products/schedula/ の5つです。
デモと技術案内は /products/schedula/demo/ と docs/、利用アプリは schedula.the3.co.jp に分けます。
infraは準備中APIを含む配信基盤までを構築します。会社サイト・商品紹介は初回も通常更新もこのrepoの`v*`タグworkflowで公開し、デモはschedulaの`web-v*`タグworkflowで公開します。登録フラグやデモリンク用のEnvironment変数は不要です。
[インフラの管理先](infra/README.md)と[会社サイト公開手順](docs/site-deployment.md)を参照してください。

紹介ページ・デモ・技術文書の分担と変更が必要な箇所は、[会社サイトと製品Webの所有・デザイン・URL方針](docs/product-web-architecture.md)を参照してください。

## 開発

Node.js **26.12.1**（`.node-version`）、Python **3.14.9**（`.python-version`）、pnpm **12.11.2**（`package.json`）を使います。
バージョンファイルだけではランタイムは切り替わらないため、実行環境で指定バージョンを選んでください。CI・公開workflowもこれらのファイルを参照します。

2026年10月21日の[Node.js セキュリティ修正](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)と[Python の修正版](https://www.python.org/downloads/release/python-3149/)を適用しています。
Node.js 26 は2026年10月25日時点で Current（[LTS開始予定は10月28日](https://github.com/nodejs/Release)）です。このサイトでは静的ファイルのビルドと検査に使用します。

```sh
pnpm install --frozen-lockfile
pnpm exec lefthook install
pnpm dev
```

開発サーバーは通常 `http://localhost:4321` で起動します。

| 対象 | 編集先 |
| --- | --- |
| トップページ | `src/pages/index.astro` |
| ページの追加 | `src/pages/` |
| そのまま配信する画像など | `public/` |
| 共通ヘッダー・フッター・メタデータ・開発用テーマ選択 | `src/layouts/SiteLayout.astro` |
| 会社共通の色・書体・テーマ・基本ボタン | `packages/brand-preset/` |
| Tailwindへの対応付け・会社サイトのレイアウト | `src/styles/global.css` |
| Astro・Tailwind の設定 | `astro.config.mjs` |

会社共通の値と基本スタイルは[共通プリセット](packages/brand-preset/README.md)を正本とし、会社サイトで利用しています。配布元はこのリポジトリのGitHub Releasesです。[新製品への導入・公開・更新手順](docs/brand-preset-distribution.md)を参照してください。

トップページ、会社案内、お問い合わせ、製品一覧・詳細は、見出し・余白・細い区切り線を共通にしています。
shift-schedulaの製品LPは、特徴、3つの公開デモ、導入・組み込み、相談の順で案内します。製品の図解とデモの構成はページ内のスタイルで管理します。
背景は白に近い `#fafcfc`、文字は `#183638`、リンクとトップのお問い合わせボタンはティール `#087f83` を使います。
製品紹介もページ全体と同じ背景とし、余白と細い線で区切ります。ロゴと理念の図版は元の深緑・セージ・黄土を保ちます。
ロゴは `public/brand/the3-symbol.svg` にベクターパスで保存しています。元のPNGと生成・変換の情報は
[デザイン素材](docs/brand-assets.md)、表示と導線の確認結果は[デザイン確認](design-qa.md)を参照してください。

トップページは理念の説明、取り組み方、製品紹介、会社案内、お問い合わせの順で構成します。
理念の文章はトップページだけに掲載し、製品の詳しい説明や会社情報はそれぞれのページで案内します。
各ページは通常のスクロールと内容に応じた高さを使い、全画面セクションやスクロールスナップは使いません。
共通レイアウトは画面の高さを最低限確保し、短いページでもフッターを画面下端に配置します。
長いページでは本文の後に続きます。レイアウトはモバイルとデスクトップに対応します。
内容と導線の判断は[トップページの参考調査](docs/homepage-content-research.md)に記録しています。

開発中の `pnpm dev` では、ライト・ダーク・システム連動（既定）を選択できます。
明示した選択はローカルストレージに保存し、システム連動では OS の変更に追従します。
本番ビルドと `pnpm preview` には選択 UI とスクリプトを含めず、CSS でシステムのテーマに追従します。

## 検証とビルド

```sh
pnpm run check
pnpm run typecheck
pnpm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
pnpm build
pnpm preview
```

`pnpm run fix` は整形と安全な lint 修正を適用します。差分を確認し、再度ステージしてからコミットしてください。
pre-commit hook はステージ済みのファイルだけを検査します。

`typecheck` は `astro check` で Astro・TypeScript を検査します。
使用中の `@astrojs/check` が TypeScript 5・6 に対応しているため、TypeScript 6 を固定しています。
`build` は型検査後に `dist/` を生成し、`preview` は生成済みサイトをローカル配信します。

Vitest は一時ディレクトリへ5ページをビルドし、本文・共通ナビゲーション・理念の掲載先・
問い合わせ／地図リンク・生成 CSS・本番スクリプトと開発 UI の除外を検査します。
テーマのテストでは、システム設定の変更、保存済みの選択、ストレージが使えない場合を確認します。

Python 3.14.9の標準ライブラリで、会社・製品の接続検査もテストします。追加のPythonパッケージは不要です。
公開パスで両サイトを確認する手順は[サイト間の接続確認](docs/site-integration.md)を参照してください。

Astro は `output: "static"` を明示し、サーバーアダプターやフロントエンドフレームワークを使いません。
本番 URL は `astro.config.mjs` の `site` に設定しています。

## CI と公開

PRとmainのCIはBiome・Vitest・Astro型検査と本番ビルドを実行します。
TerraformとCloudFrontのURL処理はinfraのCIで検証します。
通常更新はmainへマージ → main CI成功 → 会社タグpush → 必要な承認 → 公開確認です。
AWS基盤を変更するときはinfraリポジトリでplan/applyします。会社タグworkflowはTerraformを実行しません。
製品紹介を追加するときはコンテンツテストとworkflowの公開URL確認も更新してください。
