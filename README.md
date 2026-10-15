# landing-page

Astro と Tailwind CSS 4 で構築した、the3合同会社の会社サイトです。
静的ファイルを S3 に配置し、CloudFront 経由で `https://the3.co.jp` に公開します。

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

## タグで本番デプロイするまで

**初回に AWS 基盤と GitHub の設定を完了し、その後の公開をタグ push で開始します。**
タグ workflow は既存リソースへの公開だけを行い、Terraform apply は実行しません。

1. [必要な設定の一覧](infra/README.md#タグデプロイに必要な設定)に従い、管理用 AWS 認証、
   両 root の `backend.hcl`・`terraform.tfvars` を設定します。アカウント ID と既存 Hosted Zone ID を使います。
2. 管理用認証で foundation → company の順に plan を確認し、明示的に apply します。
   S3・CloudFront・証明書・公開ロールは Terraform が作成します。既存リソースを使う場合は先に import します。
3. [GitHub の公開設定](infra/README.md#github-の公開設定)に従い、
   Settings → Environments → **production → Environment variables** に company outputs から次の5変数を登録します。
   `AWS_ACCOUNT_ID`、`AWS_REGION`、`SITE_BUCKET`、`DISTRIBUTION_ID`、`AWS_ROLE_ARN`。
   README 内の登録コマンドでまとめて転記できます。長期 AWS アクセスキーは使いません。
4. GitHub Actions を有効にし、`main` の PR・CI 必須化、`v*` タグの作成制限と更新・削除禁止、
   production の許可 ref（ブランチ `main` とタグ `v*`）・必要な承認者を設定します。
   承認者を設定した場合は、タグ push 後の実行を承認します。
5. Terraform・workflow・公開対象コードを含む変更を PR で `main` にマージし、対象コミットの CI 成功を確認してからタグを push します。

`DISTRIBUTION_ID` と `AWS_ROLE_ARN` は Terraform state で管理するリソースの output です。
ID やロールを手作業で作る必要はありません。公開 workflow は state を読む権限を持たないため、GitHub Variables へ値を渡します。
初回 company apply で DNS が向き、初回デプロイ完了まではページを返せません。

### タグの作成と push

以下は実際に本番デプロイを開始する操作です。`v1.0.0` は未使用のバージョンに置き換えてください。
ローカルの未コミット変更や未 push のコミットではなく、取得した `origin/main` のコミットにタグを付けます。

```sh
git fetch origin main --tags
git log -1 --oneline origin/main
git tag --list 'v*' --sort=-version:refname
# 上記コミットの CI 成功と、タグ名が未使用であることを確認してから実行
git tag -a v1.0.0 origin/main -m 'Release v1.0.0'
git push origin refs/tags/v1.0.0
```

タグは `vMAJOR.MINOR.PATCH` に統一します。先頭ゼロ・プレリリース形式は受け付けません。
`package.json` のバージョン更新と GitHub Release の作成は不要です。ローカルでのタグ作成だけでは起動せず、push が必要です。

### 完了確認と切り戻し

Actions の **Deploy production** を確認し、production の承認待ちであれば承認します。
workflow はタグの検証 → lint・テスト・ビルド → S3 配置 → CloudFront 無効化・完了待ち →
公開3ページの HTTP 200 確認を行います。成功時の実行サマリーにはタグ・コミット・無効化 ID が残ります。

```sh
gh run list --repo the3-inc/landing-page --workflow deploy.yml
gh run watch RUN_ID --repo the3-inc/landing-page --exit-status
```

成功後は [公開サイト](https://the3.co.jp)をブラウザでも確認します。
切り戻しは Actions → Deploy production → Run workflow で **Branch: main** を選び、
`tag` に以前のタグを指定します。既存タグの移動・再作成はしません。

backend の準備、適用・移管手順、ロールの権限、失敗時の制約、製品の追加は [インフラ README](infra/README.md) を参照してください。
製品紹介ページを追加するときは、コンテンツテストと workflow の公開 URL 検証も更新します。
