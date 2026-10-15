# landing-page

Astro と Tailwind CSS 4 で構築した、the3合同会社の会社サイトです。
静的ファイルを S3 に配置し、CloudFront 経由で `https://the3.co.jp` に公開します。

**インフラの構築・変更はローカルの Terraform、サイトのデプロイはタグ push で起動する GitHub Actions が担当します。**

| 作業 | 担当・実行場所 | 実施すること |
| --- | --- | --- |
| AWS 基盤の構築・変更 | インフラ構築担当がローカルなどの管理用端末で Terraform を実行 | S3・CloudFront・証明書・IAM ロール・DNS レコードの管理と、既存 Hosted Zone の参照 |
| 公開先の登録 | GitHub 設定担当が `production` Environment を設定 | Terraform output のバケット名・Distribution ID・ロール ARN などを変数へ登録 |
| サイトのデプロイ | リリース担当が `vMAJOR.MINOR.PATCH` タグを push し、GitHub Actions が実行 | 必要な承認後にビルド・S3 配置・CloudFront のキャッシュ無効化・公開確認 |

初回準備後のサイト更新は **main へマージ → CI 成功 → タグ push → 必要な承認 → デプロイ** です。
インフラ構成を変える場合は別途 Terraform を実行します。タグ workflow は Terraform apply を行いません。
詳細手順はファイルごとに分けています。

| 読むファイル | 対象 |
| --- | --- |
| [ローカル Terraform によるインフラ構築](infra/README.md) | ツール・AWS 認証・入力値・state 用 S3 の準備、plan / apply、構築結果の取得 |
| [GitHub タグによるサイトデプロイ](docs/site-deployment.md) | GitHub の公開設定、起動条件、タグ push、承認、公開確認、切り戻し |

現在のページは、理念・事業紹介の `/`、会社情報・アクセスの `/company/`、
メール・電話の問い合わせ先を掲載した `/contact/` の3つです。
製品紹介は将来 `/products/<name>/` に追加し、製品本体やデモは `alpha.the3.co.jp` などの
専用サブドメインで配信します。製品ごとに CloudFront・配信元・公開 workflow を持ち、紹介ページからリンクします。

## 開発

Node.js **24.21.0**（`.node-version`）と pnpm **12.11.2**（`package.json`）を使います。
バージョンファイルだけでは Node.js は切り替わらないため、実行環境で指定バージョンを選んでください。

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
| ブランドカラー・基本スタイル | `src/styles/global.css` |
| Astro・Tailwind の設定 | `astro.config.mjs` |

理念の文章はトップページだけに掲載します。各ページは通常のスクロールと内容に応じた高さを使い、
全画面セクションやスクロールスナップは使いません。レイアウトはモバイルとデスクトップに対応します。

開発中の `pnpm dev` では、ライト・ダーク・システム連動（既定）を選択できます。
明示した選択はローカルストレージに保存し、システム連動では OS の変更に追従します。
本番ビルドと `pnpm preview` には選択 UI とスクリプトを含めず、CSS でシステムのテーマに追従します。

## 検証とビルド

```sh
pnpm run check
pnpm run typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm run fix` は整形と安全な lint 修正を適用します。差分を確認し、再度ステージしてからコミットしてください。
pre-commit hook はステージ済みのファイルだけを検査します。

`typecheck` は `astro check` で Astro・TypeScript を検査します。
使用中の `@astrojs/check` が TypeScript 5・6 に対応しているため、TypeScript 6 を固定しています。
`build` は型検査後に `dist/` を生成し、`preview` は生成済みサイトをローカル配信します。

Vitest は一時ディレクトリへ3ページをビルドし、本文・共通ナビゲーション・理念の掲載先・
問い合わせ／地図リンク・生成 CSS・本番スクリプトと開発 UI の除外を検査します。
テーマのテストでは、システム設定の変更、保存済みの選択、ストレージが使えない場合を確認します。

Astro は `output: "static"` を明示し、サーバーアダプターやフロントエンドフレームワークを使いません。
本番 URL は `astro.config.mjs` の `site` に設定しています。

## CI とインフラ

GitHub Actions は PR と `main` で lint・テスト・本番ビルドと、
Terraform の fmt・validate・provider mock による plan テストを実行します。
CI では AWS 認証や実リソースの変更を行いません。
Terraform CLI **1.16.6** と AWS provider **6.69.0** を固定し、各 root の provider lock をコミットします。

| Terraform root | 管理するもの |
| --- | --- |
| `infra/foundation` | アカウント共通 GitHub OIDC と、3つの非機密識別子を公開する SSM パラメーター |
| `infra/company` | 会社 S3・CloudFront・証明書・DNS レコード・デプロイ専用 IAM ロール |

通常リージョンは **`ap-northeast-1`**、CloudFront 用 ACM 証明書と検証だけ **`us-east-1`** です。
Route 53 の既存 `the3.co.jp` パブリック Hosted Zone を参照します。
両 root は暗号化・ロック付き S3 backend の別々の key で state を管理します。
製品リポジトリは SSM の公開契約だけを読み、製品専用の state とリソースを管理します。

## 構築・デプロイの進め方

初回は [インフラ構築手順](infra/README.md)で AWS 基盤を用意し、構築結果を GitHub 設定担当へ渡します。
続いて [サイトデプロイ手順](docs/site-deployment.md)で `production` の5変数と保護設定を登録し、タグを push します。
通常のサイト更新は main へマージ → CI 成功 → タグ push → 必要な承認 → 公開確認です。
インフラ構成の変更は、管理用端末から別途 Terraform を実行します。
