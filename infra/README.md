# ローカル Terraform による AWS インフラ構築

**インフラ構築担当が、ローカルなどの管理用端末から Terraform を実行し、AWS 基盤を構築・変更するための手順です。**
会社サイトと紹介ページは `the3.co.jp`、利用アプリは専用サブドメインで配信します。
schedulaの公開デモ・技術案内は会社CloudFrontに専用Originを登録し、`/products/schedula/` 配下へまとめます。
[SSM契約と初回登録](SCHEDULA.md)がこの経路の正本です。以下の独立サブドメイン手順は利用アプリに適用します。
通常リージョンは `ap-northeast-1`、CloudFront 用 ACM 証明書と検証だけ `us-east-1` です。
既存の `the3.co.jp` パブリック Hosted Zone を参照します。

| 読むファイル | 担当する作業 | 操作する人・場所 |
| --- | --- | --- |
| この README | AWS 認証・state 保存先・入力値の準備、Terraform の plan / apply、構築結果の取得 | インフラ構築担当・管理用端末 |
| [サイトデプロイ手順](../docs/site-deployment.md) | GitHub の公開先・保護設定、タグ push、承認、公開確認、切り戻し | GitHub 設定担当・リリース担当・GitHub Actions |

この手順では配信先と認証基盤を用意します。サイトのファイルは、基盤構築後に GitHub タグで起動する workflow が公開します。
インフラ構成を変えるときは本書、通常のサイト更新ではサイトデプロイ手順を使います。
以下は作業手順の説明です。ドキュメントの更新だけでは AWS や GitHub の設定は変わりません。

## はじめて構築するときに押さえること

Terraform は、コードに書かれた構成と AWS の現在の状態を比較し、必要なリソースを作成・変更するツールです。
このリポジトリでは構成の設計図は用意済みです。初回は「どの AWS アカウントか」「既存のどのドメインか」
「管理記録をどこへ保存するか」を入力し、計画を確認してから実際の AWS に反映します。

| 用語・ファイル | 意味 | 初回にやること |
| --- | --- | --- |
| `*.tf` | 作りたい AWS 構成の設計図 | 既存の構成を確認する。通常リージョンは東京、CloudFront 用証明書だけ米国東部に設定済み |
| root | 独立して操作する Terraform のディレクトリ | 共通認証基盤の `infra/foundation` を先に、会社サイトの `infra/company` を後に操作する |
| `terraform.tfvars` | 設計図へ渡す入力値 | AWS アカウント ID と、foundation には Hosted Zone ID を記入する |
| state | 設計図と実際の AWS リソースを対応付ける台帳 | S3 に保存する。作成した CloudFront ID やロール ARN も Terraform が記録する |
| `backend.hcl` | state の保存先設定 | state 用 S3 名と root ごとの保存先 `key` を記入する |
| output | Terraform が管理するリソースの情報を取り出す窓口 | 構築後に取得し、GitHub の公開設定へ渡す |

**特に大事なのは、操作対象のアカウント・既存ゾーン・state 保存先を一致させることと、apply 前に plan を読むことです。**
state 用 S3 とサイトの HTML 用 S3 は用途が違います。state 用 S3 は構築担当が最初に用意し、
サイト用 S3 は company が作成します。state を失うと既存リソースとの対応が分からなくなるため、
保存先のバケット・key を途中で安易に変更せず、バージョニング・暗号化・非公開設定を維持します。

### 誰が、どこで操作するか

以下は操作の担当区分です。同じ人が複数の担当を兼ねることもできます。承認は GitHub に設定した承認者が行います。
端末のコマンドは、このリポジトリをチェックアウトしたルートディレクトリで実行します。

| 操作 | 誰が行うか | どこで行うか・使う認証 | 何が変わるか・確認すること |
| --- | --- | --- | --- |
| AWS 認証・ツールの準備 | インフラ構築担当 | 構築端末。対象 AWS アカウントの管理用プロファイル | AWS リソースは変更しない。S3・CloudFront・IAM・DNS などの構築と state 管理に必要な権限を持つ認証を使う |
| AWS アカウント・Hosted Zone ID の確認 | インフラ構築担当 | 同じ端末の AWS CLI、または AWS コンソールの Route 53 | 読み取り。既存 `the3.co.jp` のパブリックゾーンを特定する |
| state 用 S3 の準備 | インフラ構築担当 | 同じ端末の AWS CLI、または AWS コンソールの S3。管理用認証 | 未作成なら AWS にバケットを作る。サイト用バケットとは分ける |
| `backend.hcl`・`terraform.tfvars` の編集 | インフラ構築担当 | 構築端末のエディター | ローカルの4ファイルだけを変更する |
| `init`・`plan`・`show` | インフラ構築担当 | 構築端末の Terraform。管理用認証 | 準備・計画確認。AWS リソースの作成・変更・削除はまだ行わない |
| `apply` | インフラ構築担当 | 同じ構築端末の Terraform。管理用認証 | 保存した計画を AWS に反映する。foundation 完了後に company を適用する |
| output の取得と引き渡し | インフラ構築担当 | 構築端末の Terraform。state を読む管理用認証 | 読み取り。構築結果を GitHub 設定担当へ渡す。以降はサイトデプロイ手順を使う |

構築担当が使う AWS 管理用認証と、公開 workflow の `AWS_ROLE_ARN` は役割が違います。
管理用認証はインフラを作るために事前に必要です。公開用ロールは company が必要な権限とともに作成し、
GitHub Actions はそのロールを使ってサイトのファイルとキャッシュだけを更新します。

初回 company apply は DNS の向き先も変えます。**インフラ構築完了と、ページ公開完了は別です。**
タグ push 後のデプロイが終わるまでサイトのファイルは配備されないため、構築・初回公開のタイミングを合わせてください。

## ローカルで設定する値

対象の root は `infra/foundation` と `infra/company` です。設定ファイルは各ディレクトリの `.example` から作成します。

| 設定先 | 設定するもの | 値・取得元 |
| --- | --- | --- |
| インフラ構築端末 | `AWS_PROFILE` | 対象アカウントのインフラ管理用認証。backend と foundation / company の作成・更新権限が必要。公開用ロールとは別 |
| インフラ構築端末 | `AWS_REGION` | `ap-northeast-1`。Terraform の通常 provider も同リージョンに固定済み |
| 両 root の `backend.hcl` | `bucket`, `region`, `allowed_account_ids` | 用意した state 用 S3 名、その実リージョン、構築先 AWS アカウント ID。新規 backend の例は東京 |
| 両 root の `backend.hcl` | `key` | foundation は `production/foundation/terraform.tfstate`、company は `production/company/terraform.tfstate` |
| 両 root の `terraform.tfvars` | `aws_account_id` | 構築先 AWS アカウント ID。GitHub の `AWS_ACCOUNT_ID` と一致させる |
| foundation の `terraform.tfvars` | `hosted_zone_id` | 既存 `the3.co.jp` パブリック Hosted Zone の ID。`/hostedzone/` は除く |

`terraform.tfvars` は Terraform が自動で読みます。`backend.hcl` は `init -backend-config=backend.hcl` で指定します。
この方法では `TF_VAR_aws_account_id` などの環境変数は不要です。
サイトのバケット名・Distribution ID・公開ロール ARN は構築後の output で取得するため、事前に入力する必要はありません。

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

インフラ構築担当の端末に次を用意し、Bash / Zsh でリポジトリのルートから操作します。

| 前提条件 | 用途・確認方法 |
| --- | --- |
| Terraform **1.16.6** | `terraform version` で確認。別バージョンではこのリポジトリの制約を満たさない |
| AWS CLI v2 | `aws --version` で確認。AWS ログインと既存リソースの確認に使う |
| Git とチェックアウト済みのリポジトリ | `infra/foundation` と `infra/company` のコード・lock ファイルを使う |
| ネットワーク接続 | `init` 時の provider 取得と AWS API 接続に必要 |
| 対象アカウントの管理用 AWS 認証 | インフラと state の管理に必要な権限。公開 workflow 用ロールとは別 |
| 既存 Hosted Zone ID と state 用 S3 | ゾーンは既存 `the3.co.jp`。state 用 S3 は backend を使う最初の `init` より前に用意する |

AWS provider **6.69.0** は `init` が取得するため、個別にインストールする必要はありません。
`gh` と `jq` は、後続のサイトデプロイ手順で GitHub 変数を一括登録する場合に使います。
Terraform のローカル実行自体には不要です。
Terraform の導入は [公式手順](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli)を参照し、指定バージョンを選んでください。

管理用の AWS 認証はコンテンツ公開用ロールと分けます。
どちらの root も通常のリージョンは `ap-northeast-1` です。会社 S3 と foundation の SSM は東京に作成します。
CloudFront 用 ACM 証明書とその検証だけは AWS の要件により `us-east-1` です。
固定済みの AWS provider v6 の resource `region` 引数で、この2リソースのリージョンを指定しています。
CloudFront・IAM・Route 53 はグローバルサービスです。

### アカウントと DNS の確認

インフラ構築担当が構築端末で実行します。`AWS_PROFILE` は端末に登録した管理用プロファイル名です。
プロファイルや AWS CLI がまだない場合は、対象アカウントへのログイン方法とツールの準備を先に完了します。
`aws sts get-caller-identity` の `Account` が構築先であることを確認してから先へ進みます。

AWS コンソールへのログインと、端末から使う AWS 認証は別途設定が必要です。
管理用認証には S3・CloudFront・ACM・IAM・SSM・対象 DNS レコードの管理と、state の読み書きに必要な権限が必要です。
IAM Identity Center を利用している環境なら、初回に `aws configure sso` でプロファイルを作り、
以降は `aws sso login --profile your-infrastructure-profile` でログインします。
SSO の開始 URL・リージョン・利用するアカウントとロールは、利用中の認証環境に合わせます。
[認証設定の公式手順](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)を参照してください。

```sh
export AWS_PROFILE=your-infrastructure-profile
export AWS_REGION=ap-northeast-1
aws sts get-caller-identity
aws route53 list-hosted-zones-by-name --dns-name the3.co.jp \
  --query 'HostedZones[?Name==`the3.co.jp.`].[Id,Config.PrivateZone]' --output table
```

`aws_account_id` と backend の `allowed_account_ids` は、確認した実際のアカウント ID に合わせます。
provider と backend の両方で想定アカウントを制限します。誤ったアカウントの状態で続行しないでください。
Route 53 で管理している既存の `the3.co.jp` パブリックゾーンを使います。Hosted Zone は新規作成しません。
コンソールで確認する場合は、**Route 53 → ホストゾーン → the3.co.jp → ホストゾーンの詳細** の ID を控えます。
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

backend は Terraform の台帳を保存する仕組みです。このバケットは Terraform の最初の `init` より前に必要なので、
インフラ構築担当が管理用認証で用意します。以下の作成・設定コマンドは実際に AWS を変更します。
AWS コンソールの S3 から用意する場合も、東京リージョン・パブリックアクセス全ブロック・バージョニング有効・暗号化有効にします。

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

インフラ構築担当が構築端末で設定例をコピーし、エディターで4ファイルを編集します。この操作は AWS を変更しません。

```sh
cp infra/foundation/backend.hcl.example infra/foundation/backend.hcl
cp infra/company/backend.hcl.example infra/company/backend.hcl
cp infra/foundation/terraform.tfvars.example infra/foundation/terraform.tfvars
cp infra/company/terraform.tfvars.example infra/company/terraform.tfvars
```

入力値の例です。アカウント ID・ゾーン ID・バケット名は例示値なので、実際の値へ置き換えます。

`infra/foundation/terraform.tfvars`:

```hcl
aws_account_id = "123456789012"
hosted_zone_id = "Z0123456789EXAMPLE"
```

`infra/company/terraform.tfvars`:

```hcl
aws_account_id = "123456789012"
```

`infra/foundation/backend.hcl`:

```hcl
bucket              = "replace-with-private-versioned-state-bucket"
key                 = "production/foundation/terraform.tfstate"
region              = "ap-northeast-1"
allowed_account_ids = ["123456789012"]
```

`infra/company/backend.hcl` は同じ state 用バケットとアカウントを使い、`key` だけを
`production/company/terraform.tfstate` にします。同じバケット内に別々の台帳を保存する指定です。

`backend.hcl` の bucket・allowed_account_ids と、tfvars の aws_account_id を実値に変更します。
backend の region は state バケットの実際のリージョンに合わせます。新規作成の例は `ap-northeast-1` です。
foundation の hosted_zone_id も `/hostedzone/` を除いた実値にします。2つの backend key は別のままにします。
ローカル設定・state・plan は Git ignore 対象です。認証情報を HCL やコマンド引数に保存せず AWS_PROFILE 等を使います。
backend を変更する際は state 移行を別途計画し、既存環境で空の key へ安易に切り替えないでください。

## foundation の plan / apply

インフラ構築担当が構築端末で、前述の管理用プロファイルを使って実行します。
`-chdir=infra/foundation` は「このディレクトリの設計図を使う」という指定です。

| コマンド | 意味 | AWS リソースへの反映 |
| --- | --- | --- |
| `init` | provider を取得し、state 保存先を初期設定する | リソースは作成・変更しない。既存 state の移行を求められた場合は保存先を再確認する |
| `validate` | 設定の構文・整合性を検査する | AWS に接続せず、リソースも変更しない |
| `plan -out=...` | 現在の AWS と設計図を比較し、実行計画をファイルに保存する | リソースは作成・変更しない。AWS の読み取りと state のロックを行う |
| `show` | 保存した実行計画を表示する | リソースは変更しない |
| `apply 計画ファイル` | 保存済みの計画を実行する | **AWS の作成・変更・削除を行う** |

```sh
terraform -chdir=infra/foundation init -backend-config=backend.hcl -lockfile=readonly
terraform -chdir=infra/foundation validate
aws iam list-open-id-connect-providers
```

アカウントに `token.actions.githubusercontent.com` のプロバイダーが既にある場合は、
二重作成せず foundation に import します。旧 CloudFormation 等が所有している場合は先に所有権を外します。

```sh
terraform -chdir=infra/foundation import aws_iam_openid_connect_provider.github \
  "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
```

import は state を更新する操作です。ARN の `123456789012` は構築先のアカウント ID に置き換えます。
所有者を確認した後に、既存リソースがある場合だけ実行します。
既存 provider に追加の audience / thumbprint がある場合、plan で意図せず消さないよう定義を合わせてから続行します。

```sh
terraform -chdir=infra/foundation plan -out=foundation.tfplan
terraform -chdir=infra/foundation show foundation.tfplan
```

plan では `+` が作成、`~` が変更、`-` が削除、`-/+` などが置換を示します。
新規構築では想定した OIDC・SSM の作成になっていること、既存リソースの意図しない削除・置換がないことを確認します。
**次のコマンドが AWS に反映する操作です。保存済み plan を指定した apply は追加の yes 入力なしに実行されるため、先に計画を確認します。**

```sh
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
担当者・端末・認証は foundation と同じです。ここで会社サイトの配信基盤とデプロイ専用ロールを作成します。

新規構築では company が S3・CloudFront・証明書・デプロイロールを作成し、実 ID は state に記録します。
既存 CloudFront を使う場合は、対象ドメイン・Origin・証明書と所有者を確認します。company の backend を init し、定義を実物に合わせてから
`terraform -chdir=infra/company import aws_cloudfront_distribution.site EXISTING_DISTRIBUTION_ID` で取り込みます。
関連リソースも同様に取り込み、意図しない変更・削除・置換がない plan を確認します。
Terraform は AWS 上のリソースを自動検索して採用しません。state に管理されていなければ新規作成を計画するため、
既存リソースの import は plan / apply より先に行います。他の state や CloudFormation が管理中なら先に所有権を移管します。

```sh
terraform -chdir=infra/company init -backend-config=backend.hcl -lockfile=readonly
terraform -chdir=infra/company validate
terraform -chdir=infra/company plan -out=company.tfplan
terraform -chdir=infra/company show company.tfplan
```

既存 Hosted Zone 自体を新規作成せず、会社の S3・CloudFront・証明書・DNS レコード・ロールが計画どおりであることを確認します。
DNS 切り替えのタイミングも確認したうえで、インフラ構築担当が次を実行します。

```sh
terraform -chdir=infra/company apply company.tfplan
```

会社 S3 は非公開・BucketOwnerEnforced・AES256・バージョニング有効です。
TLS を強制し、GetObject は会社 CloudFront の OAC 経由だけに許可します。
S3 は `prevent_destroy` と `force_destroy = false` で保護し、過去のオブジェクトは保持します。
ACM の検証 CNAME と apex の A / AAAA を同じ root で作成します。
**初回 apply で DNS が向きますが、初回タグのデプロイ完了まではページを返せません。**

## 構築結果をサイトデプロイへ渡す

company の apply 完了後、インフラ構築担当が同じ管理用端末で次を実行します。state を読むだけの操作です。

```sh
terraform -chdir=infra/company output
```

AWS アカウント ID・リージョン・サイト用バケット名・CloudFront ID・デプロイ専用ロール ARN を GitHub 設定担当へ渡します。
Terraform は実 ID を state で管理します。既存リソースを import した場合も、そのリソースの情報が output に出ます。
GitHub への変数登録・タグ push・承認・公開確認は、[サイトデプロイ手順](../docs/site-deployment.md)に従います。

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

独立サブドメインのアプリ追加では会社用CloudFrontを変更しません。schedula公開デモの共有経路は[SCHEDULA.md](SCHEDULA.md)に従って会社rootで登録します。
会社のデプロイ権限は製品の配信元や Distribution に届かず、製品のロールも自製品だけを更新します。
同じ AWS アカウントや既存 DNS ゾーンなどの共通依存は残るため、すべての障害を完全に分離する構成ではありません。

### 切り戻しと削除

紹介文や製品リンクの切り戻しは会社サイトの旧タグ、製品本体の切り戻しは製品の旧タグで行います。
製品インフラの変更は製品 IaC で戻し、会社の Distribution は更新しません。
製品を廃止する場合は紹介ページからのリンクを先に整理し、DNS の切替・キャッシュ・利用者の移行を確認した後に
製品の Distribution、配信元、ロールを削除します。データの保持・削除は製品ごとに判断します。
会社 root の配信リソースを削除すると会社サイトと紹介ページが停止します。
共通OIDCとfoundation/v1のSSMはfoundationの所有です。追加のcompany/v1契約はcompanyが所有します。会社 state の変更・削除で共通基盤を削除しません。

## 範囲・費用・参照

現在の実リソースは今回の作業では変更していません。初回適用時に作るのは foundation と会社サイトだけです。
schedulaの商品紹介と共有経路の定義を追加しています。製品アプリ本体・製品サブドメイン・www・ステージング・配布用の共通moduleは作成していません。
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
