# GitHub タグによる会社サイトのデプロイ

**`vMAJOR.MINOR.PATCH` タグを GitHub に push すると、GitHub Actions が会社サイトをビルドして本番へ公開します。**
ここでは GitHub の初回設定、タグの作成、承認、公開確認、切り戻しを説明します。
AWS 基盤は事前に [ローカル Terraform の手順](../infra/README.md)で構築します。この workflow は Terraform apply を行いません。
端末のコマンドは、チェックアウトしたリポジトリのルートから実行します。

## 何をトリガーに何が動くか

| トリガー | 実行するもの | AWS・サイトへの影響 |
| --- | --- | --- |
| PR、`main` への push | [ci.yml](../.github/workflows/ci.yml) の `CI / validate` | lint・テスト・ビルド・Terraform の mock 検証。AWS 認証や公開は行わない |
| `v*` タグの push | [deploy.yml](../.github/workflows/deploy.yml) の `Deploy production` | 正式なバージョン形式と main 履歴を検証し、必要な承認後にサイトを公開 |
| Actions から `tag` を指定して手動実行 | 同じ `Deploy production` | 既存タグを再ビルド・再公開。失敗時の再実行や切り戻しに使う |

`v*` は起動条件です。実際に公開できるタグは `vMAJOR.MINOR.PATCH` に限定します。
タグをローカルで作るだけでは起動しません。main の CI 成功だけでもサイトは公開されません。

## 担当者と前提条件

| 作業 | 担当・場所・認証 |
| --- | --- |
| 基盤構築と output の引き渡し | インフラ構築担当・管理用端末。state を読む管理用 AWS 認証 |
| 5変数と保護設定の登録 | GitHub 設定担当・GitHub Settings。CLI を使う場合は設定変更権限のある `gh` 認証 |
| タグ作成・push | リリース担当・Git のある開発端末。タグ作成を許可された GitHub アカウント |
| production の承認 | required reviewers に設定された承認者・Actions の実行画面 |
| ビルド・S3 配置・CloudFront 無効化・HTTP 確認 | GitHub Actions runner。OIDC によるデプロイ専用ロール |
| 最終的な表示確認 | リリース担当・ブラウザで `https://the3.co.jp` |

初回は AWS 基盤・証明書の検証・DNS の準備を完了し、company の output を取得します。
GitHub の設定完了後、Terraform・workflow・公開対象コードを main にマージし、対象コミットの CI 成功を確認します。
初回 company apply は DNS を切り替えるため、最初のサイトデプロイが終わるまでページを返せない点を公開予定に含めます。
GitHub 設定をブラウザで行う場合、`gh`・`jq` は不要です。CLI の一括登録には両方が必要です。
タグの push や Actions の操作に、ローカルの AWS 認証を渡す必要はありません。

## GitHub の公開設定

GitHub 設定担当が、Settings → Actions → General で workflow と参照する Actions を実行可能にします。
以下は GitHub の実設定を変更する手順です。初回構築の output が確定してから実施します。
GitHub の変数は **production の Environment variables** に登録します。`vars.*` を参照するため Secrets では代用できません。
長期 AWS アクセスキーは保存せず、GitHub OIDC で Terraform が用意したデプロイ専用ロールを引き受けます。

| GitHub 変数名 | company の output | 設定する値 |
| --- | --- | --- |
| `AWS_ACCOUNT_ID` | `aws_account_id` | 構築先アカウントの12桁 ID |
| `AWS_REGION` | `aws_region` | `ap-northeast-1` |
| `SITE_BUCKET` | `site_bucket` | 実際に作成・import した会社サイト用 S3 名。state 用 S3 とは別 |
| `DISTRIBUTION_ID` | `distribution_id` | 会社用 CloudFront の ID。ドメイン名や ARN ではない |
| `AWS_ROLE_ARN` | `deploy_role_arn` | Terraform が管理するデプロイ専用 IAM ロールの ARN |

company の構築後、インフラ構築担当が構築端末で次を実行して、作成結果を確認します。この操作は読み取りです。

```sh
terraform -chdir=infra/company output
```

表示された実際のバケット名・CloudFront ID・ロール ARN などを GitHub 設定担当へ渡します。
同じ人が担当する場合も、ここから先は GitHub 設定を変更する操作です。
ブラウザでは Settings → Environments → production → Environment variables に登録します。
以下の一括登録コマンドを使う場合は、Terraform output を読める構築端末で、GitHub 設定変更権限を持つ `gh` 認証を使います。

初回だけ `production` Environment を用意します。既存 Environment では承認・許可 ref 設定を保持します。
company の apply 後、出力から変数を登録します。`gh` はリポジトリ設定を変更できるアカウントで認証します。
`DISTRIBUTION_ID` は `distribution_id` output の CloudFront ID、`AWS_ROLE_ARN` は `deploy_role_arn` output の
デプロイ専用ロール ARN です。ロールと必要な権限は company が作成するため、手作業でロールを用意する必要はありません。
Terraform が実 ID を state で管理し、以下のコマンドで公開 workflow へ渡します。
workflow は state を読む権限を持たないため、この変数登録が必要です。ID を別ファイルで管理する必要はありません。
`SITE_BUCKET` も作成・import 後の output を使い、仮のバケット名を残さないでください。

```sh
(
  set -euo pipefail
  outputs=$(terraform -chdir=infra/company output -json)
  for pair in AWS_ACCOUNT_ID:aws_account_id AWS_REGION:aws_region SITE_BUCKET:site_bucket DISTRIBUTION_ID:distribution_id AWS_ROLE_ARN:deploy_role_arn; do
    key=${pair%%:*}
    output=${pair#*:}
    value=$(printf '%s' "$outputs" | jq -er --arg key "$output" '.[$key].value')
    gh variable set "$key" --repo the3-inc/landing-page --env production --body "$value"
  done
)
```

### ブランチ・タグ・Environment の保護

公開前に GitHub 保護を設定します。Terraform は GitHub の Ruleset / Environment を作成しません。

- `main` Ruleset: PR と CI の `validate` ステータスチェックを必須にする。
- `v*` タグ Ruleset: 更新・削除を禁止し、作成者をリリース担当者に限定する。
- `production` の Deployment branches and tags: `main` ブランチと `v*` タグのみ許可する。
- 必要な承認者を required reviewers に設定する。利用プランによる制限は実際の画面で確認する。

### デプロイ用ロールの権限と信頼条件

公開ロールと権限は [company の定義](../infra/company/main.tf)にある `aws_iam_role.deploy` と `aws_iam_role_policy.deploy` が管理します。

| 対象 | 許可する操作 | 用途 |
| --- | --- | --- |
| 会社 S3 バケットのみ | `s3:ListBucket` | sync の差分確認 |
| 会社 S3 のオブジェクトのみ | `s3:PutObject`, `s3:DeleteObject` | アップロードと不要ファイルの削除 |
| 会社 S3 のオブジェクトのみ | `s3:AbortMultipartUpload` | 大きなファイルのアップロード失敗時の後片付け |
| 会社 CloudFront Distribution のみ | `cloudfront:CreateInvalidation`, `cloudfront:GetInvalidation` | キャッシュ無効化と完了待ち |

Terraform state、SSM、IAM・DNS・証明書・CloudFront 設定の管理権限は付与しません。
workflow は AWS_ACCOUNT_ID によって別アカウントへの接続も拒否します。

会社ロールは foundation の GitHub OIDC provider と audience `sts.amazonaws.com` を信頼し、subject は次の完全一致です。

```text
repo:the3-inc@249383711/landing-page@1418165190:environment:production
```

これは GitHub が返す ID を含む `sub_claim_prefix` に Environment を加えた値です。
`gh api repos/the3-inc/landing-page/actions/oidc/customization/sub` で確認できます。
リポジトリの移管・改名や subject 設定変更時は IAM 信頼条件とテストも合わせて更新します。
Environment の OIDC subject に ref は含まれません。許可 ref とタグ権限も AWS 認証の保護に含まれます。
インフラ用の GitHub 自動 apply workflow は作りません。plan / show / 明示的な apply は管理用認証で行い、
タグ workflow は既存のリソースへコンテンツを公開するだけです。

## リリースタグとデプロイ

タグは `vMAJOR.MINOR.PATCH`（例: `v1.0.0`）に統一します。
PATCH は修正、MINOR は機能・コンテンツの追加、MAJOR は互換性や公開 URL の変更に使います。
先頭ゼロ・プレリリースタグは受け付けません。`package.json` は非公開アプリのため
バージョンを連動させません。公開バージョンの基準は Git タグです。

PR をマージし、`main` の CI 成功後に実行します。

```sh
git fetch origin main --tags
git log -1 --oneline origin/main
git tag --list 'v*' --sort=-version:refname
# 上記コミットの CI 成功と、タグ名が未使用であることを確認してから実行
git tag -a v1.0.0 origin/main -m 'Release v1.0.0'
git push origin refs/tags/v1.0.0
```

タグの例は未使用の場合だけ使い、既存タグがあれば次のバージョンを選びます。
Terraform・workflow の変更も含めて `main` にマージしてからリリースします。
タグは取得した `origin/main` に付けるため、ローカルの未コミット変更や未 push のコミットは含まれません。
ローカルでのタグ作成だけでは起動しません。GitHub Release の作成は不要です。

タグの push で `Deploy production` が起動します。タグ形式と `origin/main` に含まれる
コミットであることを確認し、lint・テスト・ビルド成功後に AWS を更新します。
production に required reviewers を設定した場合は、Actions の実行画面で承認してからジョブが開始します。
GitHub Actions の `GITHUB_TOKEN` で作ったタグでは通常別ワークフローが起動しないため、
この手順はリリース担当者がローカルから実行してください。

ハッシュ付き `_astro/` アセットを先に配置し、次にページを同期します。
以前の `_astro/` は保持し、それ以外の不要ファイルは削除します。
会社用 Distribution の全パス（将来の紹介ページも含む）を無効化し、完了を待った後、公開 URL の `/`・`/company/`・`/contact/` が
HTTPS で HTTP 200 を返すことを確認します。すべて成功した後に、実行サマリーにタグ・コミット・無効化 ID を記録します。
タグ push 後は次のコマンド、または GitHub の Actions 画面で完了を確認します。

```sh
gh run list --repo the3-inc/landing-page --workflow deploy.yml
gh run watch RUN_ID --repo the3-inc/landing-page --exit-status
```

承認待ちの操作は Actions 画面で行います。HTTP 検証は表示内容や CSS の見た目まで保証しないため、公開 URL をブラウザでも確認してください。
初回デプロイ前の URL はまだコンテンツを返しません。

## 切り戻し・失敗時

Actions → Deploy production → Run workflow で **Branch: main** を選び、
`tag` に以前のタグ（例: `v1.0.0`）を指定します。同じチェックと承認を経て再デプロイします。
タグを移動・再作成せず、新規修正には次のバージョンを使います。
同時デプロイは直列に実行します。ただし GitHub の concurrency は待機中の実行を
置き換えることがあるため、全タグの順番通りの公開は保証しません。

切り戻し時もタグのコードを frozen lockfile で再ビルドします。以前のビルド成果物を
保管・復元する方式ではなく、外部ビルド入力まで含めた同一バイトの復元は保証しません。
S3 の更新はファイル単位で、サイト全体の切り替えは原子的ではありません。
アップロード途中で失敗した場合は同じタグを手動再実行するか、以前のタグへ切り戻します。
無効化に失敗した場合はアップロードだけ完了している可能性があるため、実行ログと実際の URL を確認します。

## /products 配下に紹介ページを追加する

例として、製品本体が `https://alpha.the3.co.jp` にある場合の紹介ページを追加します。
製品名・紹介内容・公開 URL が決まってから作成し、未公開 URL へのリンクは公開しません。

1. このリポジトリに `src/pages/products/alpha.astro` を作成し、既存の `SiteLayout.astro` を使う。
   一覧が必要になったら `src/pages/products/index.astro` も追加する。
2. 製品の説明と `https://alpha.the3.co.jp` への通常のリンクを置く。
   アプリのコードやログイン画面は会社 S3 に配置しない。
3. 既存ナビゲーションや製品一覧から紹介ページへリンクし、必要な画像はこの会社サイトで管理する。
   会社 Astro の `site` は `https://the3.co.jp` のまま、`base` も変更しない。
4. `tests/site.test.ts` のビルド確認を更新し、紹介内容・製品リンク・共通レイアウトを確認する。
   `.github/workflows/deploy.yml` の公開 URL 確認にも `/products/alpha/` を追加する。
   一覧ページを作った場合は `/products/` も追加し、README のページ数も更新する。
5. lint・テスト・ビルドを通し、PR をマージして会社サイトの新しいリリースタグを push する。

既存のディレクトリ用 Function が `/products/alpha/` を `/products/alpha/index.html` に書き換えます。
通常の Astro ページ追加だけで配信でき、会社の Origin / Behavior、DNS、証明書の追加は不要です。
会社 workflow は会社用 Distribution の `/*` を無効化するため、新しい紹介ページも対象です。
これは製品サブドメインのキャッシュには影響しません。
