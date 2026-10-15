# Terraform による会社サイト・製品の管理

会社サイトと紹介ページは `the3.co.jp`、製品本体は `alpha.the3.co.jp` などの専用 CloudFront で配信します。
AWS に未適用の状態から構築する Terraform 定義です。この変更では AWS 操作や実リソースの移管は行っていません。

## タグデプロイに必要な設定

初回は **ローカルの Terraform 入力 → AWS 基盤構築 → GitHub 設定 → タグ push → 承認・公開確認** の順に進めます。
以下は今後の設定・実行手順です。このドキュメントの更新だけでは AWS や GitHub の設定は変更されません。
対象の root は `infra/foundation` と `infra/company` です。設定ファイルは各ディレクトリの `.example` から作成します。

| 設定先 | 設定するもの | 値・取得元 |
| --- | --- | --- |
| インフラ構築端末 | `AWS_PROFILE` | 対象アカウントのインフラ管理用認証。backend と foundation / company の作成・更新権限が必要。公開用ロールとは別 |
| インフラ構築端末 | `AWS_REGION` | `ap-northeast-1`。Terraform の通常 provider も同リージョンに固定済み |
| 両 root の `backend.hcl` | `bucket`, `region`, `allowed_account_ids` | 用意した state 用 S3 名、その実リージョン、構築先 AWS アカウント ID。新規 backend の例は東京 |
| 両 root の `backend.hcl` | `key` | foundation は `production/foundation/terraform.tfstate`、company は `production/company/terraform.tfstate` |
| 両 root の `terraform.tfvars` | `aws_account_id` | 構築先 AWS アカウント ID。GitHub の `AWS_ACCOUNT_ID` と一致させる |
| foundation の `terraform.tfvars` | `hosted_zone_id` | 既存 `the3.co.jp` パブリック Hosted Zone の ID。`/hostedzone/` は除く |
| GitHub → Settings → Actions → General | GitHub Actions | `Deploy production` と参照する Actions を実行可能にする |
| GitHub → Settings → Environments → `production` | Environment variables | company の apply 後、下の対応表にある5変数を登録 |
| 同じ `production` Environment | Deployment branches and tags | Selected branches and tags で、**Branch: `main`** と **Tag: `v*`** を別々に許可 |
| 同じ `production` Environment | Required reviewers | 必要な承認者。設定時はタグ push 後の実行を承認する |
| GitHub → Settings → Rules → Rulesets | `main` と `v*` の保護 | main は PR と CI の `validate` チェックを必須化。`v*` は作成者を限定し、更新・削除を禁止 |

GitHub の変数は **production の Environment variables** に設定します。workflow は `vars.*` を参照するため、Secrets への登録では代用できません。

| GitHub 変数名 | company の output | 設定する値 |
| --- | --- | --- |
| `AWS_ACCOUNT_ID` | `aws_account_id` | 構築先アカウントの12桁 ID |
| `AWS_REGION` | `aws_region` | `ap-northeast-1` |
| `SITE_BUCKET` | `site_bucket` | 実際に作成・import した会社サイト用 S3 名。state 用 S3 とは別 |
| `DISTRIBUTION_ID` | `distribution_id` | 会社用 CloudFront の ID。ドメイン名や ARN ではない |
| `AWS_ROLE_ARN` | `deploy_role_arn` | Terraform が管理するデプロイ専用 IAM ロールの ARN |

S3・CloudFront・証明書・デプロイロールは company が作成します。Distribution ID やロール ARN を事前に決める必要はありません。
既存リソースを利用する場合は先に import し、state に取り込んだリソースの output を使います。
公開 workflow は state を読まないため、output を GitHub 変数へ渡す必要があります。
長期 AWS アクセスキーを GitHub に保存せず、foundation の OIDC provider と company のロールで認証します。

以降の節に、backend の準備、root の入力、foundation → company の plan / apply、
GitHub への変数一括登録、タグ push・完了確認の具体的な手順を記載しています。
初回の company apply で DNS が向くため、初回デプロイ完了まではページを返せません。

## 管理境界

| root | 所有するもの | backend key |
| --- | --- | --- |
| `infra/foundation` | アカウント共通 GitHub OIDC、製品向けの SSM 公開識別子 | `production/foundation/terraform.tfstate` |
| `infra/company` | 会社 S3、CloudFront、ACM、ルート DNS、会社デプロイロール | `production/company/terraform.tfstate` |
| 各製品リポジトリ | 製品専用 S3 / Lambda、CloudFront、ACM、サブドメイン DNS、ロール | 製品ごとに別の bucket / key |

会社の S3 と CloudFront は同じ root にまとめています。以前の「S3 作成 → 配信作成 → 接続設定」は不要です。
foundation を先に構築し、会社・各製品は SSM に公開された識別子だけを参照します。
他の root の `terraform_remote_state` は読みません。同じ AWS リソースを複数の state で管理しません。
既存の Route 53 ゾーン・ドメイン登録・NS は Terraform に取り込まず、ゾーン ID を参照します。
会社は apex の A / AAAA と自身の証明書検証レコードだけを所有し、製品は自身のレコードだけを所有します。

Terraform CLI は **1.16.6**、AWS provider は **6.69.0** に固定しています。
各 root の `.terraform.lock.hcl` をコミットし、通常の init では `-lockfile=readonly` を使います。
更新時は明示的にバージョンを変更し、両 root の lock・テスト・CI を一緒に更新します。

## AWS 認証なしの検証

Terraform とアプリの依存パッケージを用意し、リポジトリのルートから実行します。
以下は backend を初期化せず、AWS provider を mock に置き換えた **plan テストのみ**を行います。
state backend・AWS 認証・AWS リソースは使いません。provider の取得にはネットワークが必要です。

```sh
terraform fmt -check -recursive infra
for root in foundation company; do
  terraform -chdir="infra/$root" init -backend=false -input=false -lockfile=readonly
  terraform -chdir="infra/$root" validate
  terraform -chdir="infra/$root" test
done
pnpm run check
pnpm test
pnpm build
```

CI の `validate` job も同じ検証を行います。PR と main の CI は実 AWS に対する plan / apply や AWS 認証を行いません。
mock テストは契約値、誤ったアカウント・OIDC・ゾーンの拒否、非公開 S3、TLS、証明書のリージョン分離、
ID を含む Environment 信頼条件、会社だけの更新権限を検証します。実 AWS の権限・DNS 委任・API の成功を証明するものではありません。

## 初回構築の準備

以下のコマンドは今後の適用時に使用します。Terraform、AWS CLI v2、GitHub CLI、`jq` を用意し、
Bash / Zsh で実行します。管理用の AWS 認証はコンテンツ公開用ロールと分けます。
どちらの root も通常のリージョンは `ap-northeast-1` です。会社 S3 と foundation の SSM は東京に作成します。
CloudFront 用 ACM 証明書とその検証だけは AWS の要件により `us-east-1` です。
固定済みの AWS provider v6 の resource `region` 引数で、この2リソースのリージョンを指定しています。
CloudFront・IAM・Route 53 はグローバルサービスです。

### アカウントと DNS の確認

```sh
export AWS_PROFILE=your-infrastructure-profile
export AWS_REGION=ap-northeast-1
export TF_VAR_aws_account_id=123456789012
aws sts get-caller-identity
aws route53 list-hosted-zones-by-name --dns-name the3.co.jp \
  --query 'HostedZones[?Name==`the3.co.jp.`].[Id,Config.PrivateZone]' --output table
```

`TF_VAR_aws_account_id` は実際のアカウント ID に置き換えます。
provider と backend の両方で想定アカウントを制限します。誤ったアカウントの状態で続行しないでください。
Route 53 で管理している既存の `the3.co.jp` パブリックゾーンを使います。Hosted Zone は新規作成しません。
同じアカウントのゾーン ID を指定し、ドメインの NS がそのゾーンに委任されていることを確認します。
foundation はゾーン名と公開 / 非公開を確認しますが、外部の NS 委任は検証しません。

```sh
aws route53 get-hosted-zone --id Z_REPLACE_WITH_PUBLIC_ZONE_ID
aws route53 list-resource-record-sets --hosted-zone-id Z_REPLACE_WITH_PUBLIC_ZONE_ID \
  --query 'ResourceRecordSets[?Name==`the3.co.jp.`]'
```

既存の apex A / AAAA や検証 CNAME は自動で上書きしません。必要な既存レコードは適用前に import し、
所有者と切り戻しを確認します。メール用 MX / TXT と他製品の DNS は管理しません。
旧 CloudFormation を適用した可能性がある場合は、後述の移管手順を先に確認します。

### state backend を用意する

会社・製品はそれぞれ別の state key と、その key / lock に限定したアクセス権を使います。
読み取りだけでも state には機密情報が含まれ得るため、製品から foundation / company の state を読める権限は与えません。
backend 自体は各 root の管理対象に含めません。既存の暗号化・非公開・バージョニング有効な S3 backend を
使うか、未作成なら管理者が一度だけ次のように用意します。bucket 名はアカウント内外で一意にします。

```sh
export THE3_STATE_BUCKET=replace-with-globally-unique-state-bucket
aws s3api create-bucket --bucket "$THE3_STATE_BUCKET" --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3api put-public-access-block --bucket "$THE3_STATE_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$THE3_STATE_BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$THE3_STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

backend の通信も TLS に限定するバケットポリシーを管理者が設定します。
既存 backend では元のポリシーを保持し、上書きで他の利用者の権限を失わないようにします。
S3 native locking を `use_lockfile = true` で有効にしています。state には GetObject / PutObject、
対応する `.tflock` には GetObject / PutObject / DeleteObject、対象 prefix の ListBucket が必要です。
state key と同じ prefix に lock が作成されるため、その両方を権限に含めます。
DynamoDB ロックやリポジトリへの state のコミットは使いません。

### root ごとの入力を設定する

```sh
cp infra/foundation/backend.hcl.example infra/foundation/backend.hcl
cp infra/company/backend.hcl.example infra/company/backend.hcl
cp infra/foundation/terraform.tfvars.example infra/foundation/terraform.tfvars
cp infra/company/terraform.tfvars.example infra/company/terraform.tfvars
```

`backend.hcl` の bucket・allowed_account_ids と、tfvars の aws_account_id を実値に変更します。
backend の region は state バケットの実際のリージョンに合わせます。新規作成の例は `ap-northeast-1` です。
foundation の hosted_zone_id も `/hostedzone/` を除いた実値にします。2つの backend key は別のままにします。
ローカル設定・state・plan は Git ignore 対象です。認証情報を HCL やコマンド引数に保存せず AWS_PROFILE 等を使います。
backend を変更する際は state 移行を別途計画し、既存環境で空の key へ安易に切り替えないでください。

## foundation の plan / apply

```sh
terraform -chdir=infra/foundation init -backend-config=backend.hcl -lockfile=readonly
aws iam list-open-id-connect-providers
```

アカウントに `token.actions.githubusercontent.com` のプロバイダーが既にある場合は、
二重作成せず foundation に import します。旧 CloudFormation 等が所有している場合は先に所有権を外します。

```sh
terraform -chdir=infra/foundation import aws_iam_openid_connect_provider.github \
  "arn:aws:iam::${TF_VAR_aws_account_id}:oidc-provider/token.actions.githubusercontent.com"
```

import は state を更新する操作です。所有者を確認した後に、既存リソースがある場合だけ実行します。
既存 provider に追加の audience / thumbprint がある場合、plan で意図せず消さないよう定義を合わせてから続行します。

```sh
terraform -chdir=infra/foundation plan -out=foundation.tfplan
terraform -chdir=infra/foundation show foundation.tfplan
# 内容を確認して適用する場合のみ
terraform -chdir=infra/foundation apply foundation.tfplan
```

OIDC と SSM 契約は `prevent_destroy` で保護します。これは完全な削除防止ではなく、
コードや state から保護を外せる管理者の権限・運用も必要です。会社 root にはこれらの resource を定義しません。

## SSM の公開契約と製品からの参照

すべて **ap-northeast-1 / String 型 / バージョン付きパス**で公開します。秘密情報は入れません。

| Parameter Store の名前 | 値 |
| --- | --- |
| `/the3/production/foundation/v1/aws-account-id` | 共通基盤の AWS アカウント ID |
| `/the3/production/foundation/v1/hosted-zone-id` | 既存 the3.co.jp パブリックゾーン ID |
| `/the3/production/foundation/v1/github-oidc-provider-arn` | foundation が所有する GitHub OIDC ARN |

会社と各製品の IaC 実行主体には、この3パラメーターの `ssm:GetParameter` だけを許可します。
例えば同アカウントならリソース ARN は `arn:aws:ssm:ap-northeast-1:ACCOUNT_ID:parameter/the3/production/foundation/v1/*` です。
これは参照の許可だけで、OIDC による AssumeRole や Route 53 の変更権限は別の IAM 設定です。
公開契約を変更するのは foundation の管理者だけです。既存 v1 の意味を変更せず、破壊的変更は v2 を公開して移行します。
会社の bucket / Distribution ID / ロールはこの契約には公開しません。

各製品リポジトリでは、provider の default region に依存せず次のように参照します。
`aws_account_id` は製品 root で明示する想定アカウント ID です。コードは製品 root が所有します。

```hcl
provider "aws" {
  alias               = "foundation"
  region              = "ap-northeast-1"
  allowed_account_ids = [var.aws_account_id]
}

data "aws_ssm_parameter" "foundation" {
  provider        = aws.foundation
  for_each        = toset(["aws-account-id", "hosted-zone-id", "github-oidc-provider-arn"])
  name            = "/the3/production/foundation/v1/${each.key}"
  with_decryption = false
  lifecycle {
    postcondition {
      condition     = each.key != "aws-account-id" || self.value == var.aws_account_id
      error_message = "The foundation contract belongs to a different AWS account."
    }
    postcondition {
      condition     = each.key != "github-oidc-provider-arn" || self.value == "arn:aws:iam::${var.aws_account_id}:oidc-provider/token.actions.githubusercontent.com"
      error_message = "The OIDC ARN must identify this account's GitHub provider."
    }
  }
}

locals {
  # Only non-secret public identifiers are published in this contract.
  foundation = { for key, parameter in data.aws_ssm_parameter.foundation : key => nonsensitive(parameter.value) }
}
```

製品側では `local.foundation["hosted-zone-id"]` を自身の DNS / 証明書検証に使い、
`local.foundation["github-oidc-provider-arn"]` を自身のデプロイロールの信頼ポリシーに使います。
OIDC の subject は製品ごとに `gh api repos/ORGANIZATION/PRODUCT_REPOSITORY/actions/oidc/customization/sub`
の `sub_claim_prefix` を確認し、`:environment:production` を付けた完全一致条件にします。
ID を含む形式では `repo:ORGANIZATION@OWNER_ID/PRODUCT_REPOSITORY@REPO_ID:environment:production` です。
audience は `sts.amazonaws.com` を要求します。会社・他製品の subject は許可しません。
会社の state / CloudFront / ロールにはアクセスしません。製品の backend key と lock 権限も自製品に限定します。

## company の plan / apply

foundation の適用後に実行します。3つの SSM 値が存在しなければ plan が失敗します。

新規構築では company が S3・CloudFront・証明書・デプロイロールを作成し、実 ID は state に記録します。
既存 CloudFront を使う場合は、対象ドメイン・Origin・証明書と所有者を確認します。company の backend を init し、定義を実物に合わせてから
`terraform -chdir=infra/company import aws_cloudfront_distribution.site EXISTING_DISTRIBUTION_ID` で取り込みます。
関連リソースも同様に取り込み、意図しない変更・削除・置換がない plan を確認します。
Terraform は AWS 上のリソースを自動検索して採用しません。state に管理されていなければ新規作成を計画するため、
既存リソースの import は plan / apply より先に行います。他の state や CloudFormation が管理中なら先に所有権を移管します。

```sh
terraform -chdir=infra/company init -backend-config=backend.hcl -lockfile=readonly
terraform -chdir=infra/company plan -out=company.tfplan
terraform -chdir=infra/company show company.tfplan
# 内容を確認して適用する場合のみ
terraform -chdir=infra/company apply company.tfplan
```

会社 S3 は非公開・BucketOwnerEnforced・AES256・バージョニング有効です。
TLS を強制し、GetObject は会社 CloudFront の OAC 経由だけに許可します。
S3 は `prevent_destroy` と `force_destroy = false` で保護し、過去のオブジェクトは保持します。
ACM の検証 CNAME と apex の A / AAAA を同じ root で作成します。
**初回 apply で DNS が向きますが、初回タグのデプロイ完了まではページを返せません。**

## GitHub の公開設定

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

公開ロールの権限は company の `aws_iam_role_policy.deploy` に定義しています。

| 対象 | 許可する操作 | 用途 |
| --- | --- | --- |
| 会社 S3 バケットのみ | `s3:ListBucket` | sync の差分確認 |
| 会社 S3 のオブジェクトのみ | `s3:PutObject`, `s3:DeleteObject` | アップロードと不要ファイルの削除 |
| 会社 S3 のオブジェクトのみ | `s3:AbortMultipartUpload` | 大きなファイルのアップロード失敗時の後片付け |
| 会社 CloudFront Distribution のみ | `cloudfront:CreateInvalidation`, `cloudfront:GetInvalidation` | キャッシュ無効化と完了待ち |

Terraform state、SSM、IAM・DNS・証明書・CloudFront 設定の管理権限は付与しません。
workflow は AWS_ACCOUNT_ID によって別アカウントへの接続も拒否します。

公開前に GitHub 保護を設定します。Terraform は GitHub の Ruleset / Environment を作成しません。

- `main` Ruleset: PR と CI の `validate` ステータスチェックを必須にする。
- `v*` タグ Ruleset: 更新・削除を禁止し、作成者をリリース担当者に限定する。
- `production` の Deployment branches and tags: `main` ブランチと `v*` タグのみ許可する。
- 必要な承認者を required reviewers に設定する。利用プランによる制限は実際の画面で確認する。

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

## CloudFormation 適用済み環境を移管する場合

今回は新規構築向けのコード移行で、実リソースの所有権移管は行っていません。
旧テンプレートは Git 履歴に残ります。移管前にアカウント、スタック、実リソース、DNS、GitHub 変数を棚卸しします。

1. 旧テンプレートで移管する resource に DeletionPolicy / UpdateReplacePolicy の Retain を設定し、その変更だけを適用する。
2. 会社・製品のデプロイを止め、OIDC / S3 / CloudFront / 証明書 / DNS / IAM の実 ID と設定を保存する。
3. 旧スタックから Retain 付きの resource を外し、削除されずに CloudFormation の管理から外れたことを確認する。
4. OIDC は foundation、会社の配信・ストレージ・ロールは company へ、provider の import ID 形式に従って取り込む。
   S3 の所有権・公開制限・暗号化・バージョニング等の別 resource も取り込む。
5. バケット名・ロール名・Function / OAC 名等を既存値に合わせ、変更・削除・置換がない plan になるまで調整する。
   固定名や bucket_prefix / name_prefix を既存値に合わせず、そのまま apply しない。
6. foundation の SSM 契約を公開し、company の参照値と GitHub 変数を実リソースに合わせて確認する。
   各 root の plan をレビューしてから通常運用へ戻す。

同じリソースを両方の管理下に置きません。CloudFormation の削除と Terraform の新規作成で置き換える方式は採りません。
実 ID が未確認のため、今回の変更には自動移管スクリプトや固定 import block を含めていません。

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

## 製品本体をサブドメインで公開する

### 製品側の IaC を用意する

製品 Alpha の例です。製品の実装と配信方式を決め、各製品リポジトリで必要なリソースを定義します。
この会社 root を製品の backend にそのまま適用すると、会社ドメインの DNS / Alias が競合します。
製品側に独立した Terraform root・state・workflow を置き、次の契約を満たす IaC を用意します。
共通 module が必要になったら配布元と利用側 root を分け、利用側で immutable tag / commit を固定します。

| 項目 | Alpha の値・責任 |
| --- | --- |
| 公開ホスト | `alpha.the3.co.jp` |
| Hosted Zone | 既存 `the3.co.jp` パブリックゾーン。同じゾーン内の Alpha レコードだけを製品 IaC が管理 |
| 証明書 | `us-east-1` の ACM で `alpha.the3.co.jp` を DNS 検証 |
| CloudFront | Alpha 専用 Distribution。Alias は `alpha.the3.co.jp` のみ |
| 配信元 | Alpha 専用の非公開 S3、または Lambda / API Gateway |
| DNS | `alpha.the3.co.jp` の A / AAAA エイリアス → Alpha の CloudFront |
| GitHub OIDC | 同じ AWS アカウントなら既存プロバイダーを再利用。製品スタックから共通プロバイダーを再作成しない |
| デプロイロール | Alpha リポジトリの Environment を信頼し、Alpha リソースと専用 Distribution の無効化だけを許可 |

各製品の証明書を個別に作り、会社の証明書を拡張・共有しません。
`the3.co.jp` のルートレコードと他製品の DNS は変更しません。
CloudFront 用証明書は `us-east-1` が必要ですが、S3 / Lambda の配置リージョンは製品ごとに決められます。
別アカウントに製品を置く場合は、そのアカウントの OIDC プロバイダーと DNS 検証・レコード管理の分担を別途設計します。

### 配信元に合わせて設定する

静的な製品は、製品専用 S3 のルートに `index.html` とアセットを配置します。
OAC とバケットポリシーは Alpha の Distribution に限定し、TLS 強制・暗号化・バージョニングを設定します。
ディレクトリ形式のページは製品専用の URL 書き換えで解決します。
Astro なら製品の `site` は `https://alpha.the3.co.jp` とし、`base` は既定の `/` を使います。
`/products/alpha/` への対応や、そのプレフィックス付き S3 配置は不要です。

Lambda / API Gateway を使う製品では、Alpha の Distribution 内で画面・アセット・API を分けます。
動的レスポンスはキャッシュ無効を基本とし、必要なメソッド・Cookie・クエリ・認証情報を転送します。
静的ページ用 Function を API に付けず、オリジンが期待する Host を設定します。
Function URL + OAC なら製品用 Lambda OAC と `AWS_IAM` を使い、Alpha の Distribution に対して
`lambda:InvokeFunctionUrl` と `lambda:InvokeFunction` の許可を製品側で設定します。
OAC の `always` は Authorization を AWS 署名に置き換え、POST / PUT にはクライアントの本文ハッシュが必要です。
Bearer 認証や通常の API クライアントとの相性を確認し、必要なら API Gateway 経由を選びます。

製品ごとの Cookie は Domain 属性を省略してホスト限定にし、セッションには Secure・HttpOnly 等を設定します。
`Domain=the3.co.jp` でセッションを全製品に共有しません。共通ログインが必要になったら SSO を別途設計します。
会社と製品は別オリジンです。会社側の紹介ページは通常のリンクで接続し、製品 API を呼び出す設計が必要になったら
認証と CORS を別途定義します。サブドメイン同士は同一サイトになり得るため、CSRF 対策も製品側で行います。

### 公開とリリース

1. `alpha.the3.co.jp` の既存レコードと CloudFront Alias の競合がないことを確認する。
2. 製品 IaC を適用し、証明書の検証、専用 CloudFront、製品の配信元、DNS を作成する。
   DNS 作成から初回コンテンツのデプロイまでは利用可能にならない点を公開手順に含める。
3. 製品リポジトリの Environment に製品用のリージョン・配信元・Distribution ID・ロール ARN を設定する。
   会社の `DISTRIBUTION_ID` や `AWS_ROLE_ARN` は使わない。ブランチ・タグ・Environment 保護も製品ごとに設定する。
4. 製品の新しいタグを push して専用 S3 / Lambda を更新する。
   キャッシュ無効化が必要なら Alpha の Distribution だけに対して実行する。
5. `https://alpha.the3.co.jp` の画面・アセット・下層 URL・API・認証と、オリジンへの直接アクセス制限を確認する。
6. 製品の公開を確認してから、この会社サイトの紹介ページを会社タグで公開する。

製品追加で会社用 CloudFront の Origin / Behavior を増やす必要はありません。
会社のデプロイ権限は製品の配信元や Distribution に届かず、製品のロールも自製品だけを更新します。
同じ AWS アカウントや既存 DNS ゾーンなどの共通依存は残るため、すべての障害を完全に分離する構成ではありません。

### 切り戻しと削除

紹介文や製品リンクの切り戻しは会社サイトの旧タグ、製品本体の切り戻しは製品の旧タグで行います。
製品インフラの変更は製品 IaC で戻し、会社の Distribution は更新しません。
製品を廃止する場合は紹介ページからのリンクを先に整理し、DNS の切替・キャッシュ・利用者の移行を確認した後に
製品の Distribution、配信元、ロールを削除します。データの保持・削除は製品ごとに判断します。
会社 root の配信リソースを削除すると会社サイトと紹介ページが停止します。
共通 OIDC と SSM は foundation の所有です。会社 state の変更・削除で共通基盤を削除しません。

## 範囲・費用・参照

現在の実リソースは今回の作業では変更していません。初回適用時に作るのは foundation と会社サイトだけです。
紹介ページの内容・製品本体・製品サブドメイン・www・ステージング・配布用の共通 module はまだ作成しません。
state backend の初期作成と既存環境の import は別途確認してから行います。
製品を別アカウントに置く場合は、OIDC と SSM の共有方式・DNS 権限をその境界に合わせて再設計します。

Terraform のタグは `Project=the3-foundation` または `landing-page`、`Environment=production`、`ManagedBy=Terraform` です。
S3 の旧バージョンやハッシュ付きアセット、state 履歴は保持され、保管費用が蓄積します。
S3・CloudFront・Route 53・SSM、将来の Lambda / API Gateway の利用料金が発生します。

参照: [S3 backend と lock](https://developer.hashicorp.com/terraform/language/backend/s3)、
[Terraform mock テスト](https://developer.hashicorp.com/terraform/language/tests/mocking)、
[remote state を使わない値の共有](https://developer.hashicorp.com/terraform/language/state/remote-state-data)、
[CloudFront の ACM リージョン](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)、
[GitHub OIDC subject](https://docs.github.com/en/actions/reference/security/oidc)、
[S3 multipart upload の権限](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)、
[Lambda OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)。
