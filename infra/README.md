# 共通配信基盤と会社サイト

`https://the3.co.jp` の入口を共通 CloudFront にまとめ、会社サイトと将来の製品をパスで分岐します。
共通配信基盤とコンテンツの IaC・リリースを分けます。CloudFront の構成は共通スタックだけが更新します。

| テンプレート | スタック名 | 管理するリソース |
| --- | --- | --- |
| `shared-delivery.yaml` | `the3-shared-delivery-production` | 証明書、DNS、CloudFront、Origin / Behavior、静的配信用 OAC / Function、GitHub OIDC プロバイダー |
| `company-site.yaml` | `the3-company-site-production` | 会社専用 S3、バケットポリシー、会社リポジトリ用デプロイロール |
| 将来の製品リポジトリの IaC | 製品ごと | 製品専用 S3 / Lambda、配信元のアクセス許可、製品のデプロイロール |

共通基盤は会社 S3 の `SiteBucketDomainName` をパラメーターで受け取ります。
会社サイトは共通基盤の `DistributionId` と `GitHubOidcProviderArn` を受け取ります。
循環参照を避けるため、初回は **会社 S3 作成 → 共通基盤作成 → 会社サイトの接続設定** の順です。
CloudFormation の相互 Export / Import は使いません。通常のコンテンツ更新でこの手順を再実行する必要はありません。

## 初回構築

以下は AWS が未構築の状態からの手順です。旧 `site.yaml` の単一スタックを作成済みの場合は、
この手順をそのまま実行せず、既存リソースの保持・インポートと DNS / CloudFront Alias の移行を別途計画します。
旧スタックにこの分割後のテンプレートを直接適用すると、削除や置き換えが起きます。

AWS CLI v2、GitHub CLI、`jq`、管理用 AWS 認証、`gh auth login` を用意します。
コマンドは Bash / Zsh で、リポジトリのルートから実行します。
共通基盤は ACM の要件により `us-east-1` 固定です。以下では会社 S3 も同リージョンに作成します。

### アカウント・既存 DNS の確認

```sh
export AWS_PROFILE=your-admin-profile
export AWS_REGION=us-east-1
export COMPANY_SITE_STACK=the3-company-site-production
export SHARED_DELIVERY_STACK=the3-shared-delivery-production
aws sts get-caller-identity
aws route53 list-hosted-zones-by-name --dns-name the3.co.jp \
  --query 'HostedZones[?Name==`the3.co.jp.`].[Id,Config.PrivateZone]' --output table
```

同じ AWS アカウントの既存パブリックホストゾーンを選び、`/hostedzone/` を除く ID を指定します。
同名ゾーンが複数ある場合は、ドメインの権威 DNS に委任されているゾーンを選んでください。
ACM の自動 DNS 検証には、ドメインの NS がそのゾーンを指している必要があります。

```sh
export SITE_HOSTED_ZONE_ID=Z_REPLACE_WITH_PUBLIC_ZONE_ID
aws route53 get-hosted-zone --id "$SITE_HOSTED_ZONE_ID"
aws route53 list-resource-record-sets --hosted-zone-id "$SITE_HOSTED_ZONE_ID" \
  --query 'ResourceRecordSets[?Name==`the3.co.jp.`]'
```

既存のルート A / AAAA は自動では上書き・取り込みしません。
競合がある場合は既存サイトへの影響と切り戻しを確認してから移行します。
ドメイン登録・NS・MX / TXT・他のサブドメインは今回の管理対象にしません。

### 会社サイトのストレージ作成

```sh
aws cloudformation deploy \
  --stack-name "$COMPANY_SITE_STACK" \
  --template-file infra/company-site.yaml \
  --capabilities CAPABILITY_IAM \
  --tags Project=landing-page Environment=production ManagedBy=CloudFormation
```

初回は接続先が未指定のため、S3 と TLS 強制のバケットポリシーだけを作ります。
S3 は非公開・暗号化・バージョニング有効で、スタック削除時も保持します。

### 共通配信基盤の作成

アカウント共通の GitHub OIDC プロバイダーがあれば再利用し、なければ作成します。
以下の OIDC 自動検出は初回専用です。

```sh
(
  set -euo pipefail
  company_domain=$(aws cloudformation describe-stacks --stack-name "$COMPANY_SITE_STACK" \
    --query 'Stacks[0].Outputs[?OutputKey==`SiteBucketDomainName`].OutputValue | [0]' --output text)
  oidc_arn=$(aws iam list-open-id-connect-providers \
    --query 'OpenIDConnectProviderList[].Arn' --output json | \
    jq -er 'map(select(endswith(":oidc-provider/token.actions.githubusercontent.com"))) | .[0] // ""')
  aws cloudformation deploy \
    --stack-name "$SHARED_DELIVERY_STACK" \
    --template-file infra/shared-delivery.yaml \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
      HostedZoneId="$SITE_HOSTED_ZONE_ID" \
      CompanySiteBucketDomainName="$company_domain" \
      GitHubOidcProviderArn="$oidc_arn" \
    --tags Project=shared-delivery Environment=production ManagedBy=CloudFormation
)
```

証明書の DNS 検証、CloudFront、ルート A / AAAA の作成完了まで待ちます。
**この時点で DNS が向きますが、次の接続設定と初回タグデプロイが終わるまでページを返せません。**

### 会社サイトを共通基盤に接続

```sh
(
  set -euo pipefail
  delivery=$(aws cloudformation describe-stacks --stack-name "$SHARED_DELIVERY_STACK" \
    --query 'Stacks[0].Outputs' --output json)
  distribution_id=$(printf '%s' "$delivery" | jq -er '.[] | select(.OutputKey=="DistributionId") | .OutputValue')
  oidc_arn=$(printf '%s' "$delivery" | jq -er '.[] | select(.OutputKey=="GitHubOidcProviderArn") | .OutputValue')
  aws cloudformation deploy \
    --stack-name "$COMPANY_SITE_STACK" \
    --template-file infra/company-site.yaml \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
      DistributionId="$distribution_id" \
      GitHubOidcProviderArn="$oidc_arn" \
      GitHubRepository=the3-inc/landing-page \
    --tags Project=landing-page Environment=production ManagedBy=CloudFormation
)
```

対象 CloudFront からの S3 読み取り許可と、会社専用のデプロイロールを追加します。
ロールには会社 S3 の更新と共有 Distribution のキャッシュ無効化だけを許可し、
DNS・CloudFront 設定・製品ストレージの更新権限を与えません。

## GitHub 設定

初回だけ `production` Environment と変数を作成します。既存 Environment がある場合は、
その承認・許可 ref 設定を維持した上で変数登録部分を実行してください。

```sh
(
  set -euo pipefail
  gh api --method PUT repos/the3-inc/landing-page/environments/production
  company=$(aws cloudformation describe-stacks --stack-name "$COMPANY_SITE_STACK" \
    --query 'Stacks[0].Outputs' --output json)
  distribution_id=$(aws cloudformation describe-stacks --stack-name "$SHARED_DELIVERY_STACK" \
    --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue | [0]' --output text)
  gh variable set AWS_REGION --repo the3-inc/landing-page --env production --body "$AWS_REGION"
  gh variable set DISTRIBUTION_ID --repo the3-inc/landing-page --env production --body "$distribution_id"
  for pair in SITE_BUCKET:SiteBucket AWS_ROLE_ARN:DeployRoleArn; do
    key=${pair%%:*}
    output=${pair#*:}
    value=$(printf '%s' "$company" | jq -er --arg key "$output" \
      '.[] | select(.OutputKey == $key) | .OutputValue')
    gh variable set "$key" --repo the3-inc/landing-page --env production --body "$value"
  done
)
```

| 変数 | 値の取得元 |
| --- | --- |
| `AWS_REGION` | 会社 S3 のリージョン。上記手順では `us-east-1` |
| `SITE_BUCKET` | 会社スタックの `SiteBucket` |
| `AWS_ROLE_ARN` | 会社スタックの `DeployRoleArn` |
| `DISTRIBUTION_ID` | 共通スタックの `DistributionId` |

AWS アクセスキーは登録しません。OIDC の信頼先は `the3-inc/landing-page` の Environment `production` です。
公開前に以下の GitHub 保護を設定します。YAML の追加だけでは有効になりません。

- `main` Ruleset: PR と実際の `CI / validate` ステータスチェックを必須にする。
- `v*` タグ Ruleset: 更新・削除を禁止し、作成者をリリース担当者に限定する。
- Environment の Deployment branches and tags: `main` ブランチと `v*` タグのみ許可する。
- 必要な承認者を required reviewers に設定する。利用プランによる制限は設定画面で確認する。

Environment の OIDC subject に ref は含まれないため、許可 ref とタグ作成権限も AWS 認証の保護に含まれます。
カスタム OIDC subject を使っている場合は会社スタックの信頼ポリシーを実際の subject に合わせます。

## リリースタグとデプロイ

タグは `vMAJOR.MINOR.PATCH`（例: `v1.0.0`）に統一します。
PATCH は修正、MINOR は機能・コンテンツの追加、MAJOR は互換性や公開 URL の変更に使います。
先頭ゼロ・プレリリースタグは受け付けません。`package.json` は非公開アプリのため
バージョンを連動させません。公開バージョンの基準は Git タグです。

PR をマージし、`main` の CI 成功後に実行します。

```sh
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git tag -a v1.0.0 -m 'Release v1.0.0'
git push origin refs/tags/v1.0.0
```

タグの例は未使用の場合だけ使い、既存タグがあれば次のバージョンを選びます。

タグの push で `Deploy production` が起動します。タグ形式と `origin/main` に含まれる
コミットであることを確認し、lint・テスト・ビルド成功後に AWS を更新します。
GitHub Actions の `GITHUB_TOKEN` で作ったタグでは通常別ワークフローが起動しないため、
この手順はリリース担当者がローカルから実行してください。

ハッシュ付き `_astro/` アセットを先に配置し、次にページを同期します。
以前の `_astro/` は保持し、それ以外の不要ファイルは削除します。
会社ページと `/_astro/*` のキャッシュだけを無効化し、完了を待った後、公開 URL の `/`・`/company/`・`/contact/` が
HTTPS で HTTP 200 を返すことを確認します。すべて成功した後に、実行サマリーにタグ・コミット・無効化 ID を記録します。
タグ push 後は `gh run list --workflow deploy.yml` で実行を探し、`gh run watch RUN_ID --exit-status`
で完了を確認できます。HTTP 検証は表示内容や CSS の見た目まで保証しないため、公開 URL をブラウザでも確認してください。
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

## 共通基盤・会社インフラの更新

CloudFront の Origin / Behavior は `shared-delivery.yaml` に集約します。
会社・製品のタグ workflow から共通基盤の IaC を実行しません。
インフラ変更は管理用 AWS 認証で変更差分を確認して適用します。
既存スタックの更新では、未指定のパラメーターは前回値を再利用します。

```sh
aws cloudformation deploy \
  --stack-name "$SHARED_DELIVERY_STACK" \
  --template-file infra/shared-delivery.yaml \
  --capabilities CAPABILITY_IAM \
  --tags Project=shared-delivery Environment=production ManagedBy=CloudFormation

aws cloudformation deploy \
  --stack-name "$COMPANY_SITE_STACK" \
  --template-file infra/company-site.yaml \
  --capabilities CAPABILITY_IAM \
  --tags Project=landing-page Environment=production ManagedBy=CloudFormation
```

共通スタックの `GitHubOidcProviderArn` 入力は初回値を維持します。初回に空でプロバイダーを
作成した場合、更新時も空を維持し、作成済み ARN を自動検出して渡し直さないでください。
共通スタックで新規作成した OIDC プロバイダーは削除時も保持します。
共通 Distribution を作り直した場合は会社・各製品の配信元ポリシーと GitHub の ID も更新します。

## /products 配下に製品を追加する

製品ごとに専用のリポジトリ、ストレージ / 実行環境、デプロイロール、リリースタグを持ちます。
会社用 S3 に製品成果物を混在させません。会社 workflow の `s3 sync --delete` は会社専用バケットだけが対象です。

### 配信するパスとアプリの契約を決める

例として製品 Alpha を `/products/alpha/` に公開します。

| パス | 配信先 | 設定 |
| --- | --- | --- |
| `/products/alpha/api` と `/products/alpha/api/*` | API Gateway / Lambda Function URL | 静的ページより先に評価、必要なメソッド・認証情報を転送 |
| `/products/alpha` と `/products/alpha/*` | 製品専用 S3 または SSR 用 Lambda | 製品に合わせたキャッシュ・パス処理 |
| その他 | 会社 S3 | 現在の DefaultCacheBehavior |

`/products/alpha/*` は末尾スラッシュのない `/products/alpha` に一致しません。
両方を登録するか、専用のリダイレクトを実装します。`/products/alpha*` は別名の製品も拾うため使いません。
`/products/` を一覧ページにする場合は、この会社サイトにページを追加して一覧の所有者と無効化対象も更新します。

製品の CSS・画像・JS・画面遷移・認証コールバックも `/products/alpha/` に対応させます。
Astro なら製品側に `site: "https://the3.co.jp"` と `base: "/products/alpha"` を設定します。
会社サイトは `/_astro/*` を使用するため、製品のアセットは `/products/alpha/_astro/*` などに分けます。
同じドメインはブラウザのオリジンを共有します。Cookie の名前・Path、localStorage のキーも製品間で調整します。

### 静的な製品を S3 に追加する

1. 製品側の IaC で非公開・暗号化・バージョニング有効の専用 S3 とデプロイロールを作成する。
   バケットポリシーで共通 `DistributionId` からの読み取りだけを許可し、TLS を強制する。
   OIDC プロバイダーは共通出力を再利用し、信頼先は製品リポジトリの Environment に限定する。
2. 製品のタグ workflow で成果物を `s3://PRODUCT_BUCKET/products/alpha/` に配置する。
   例えば `products/alpha/index.html` と `products/alpha/_astro/...` を置く。
3. 共通 IaC の `Distribution.Properties.DistributionConfig` に以下を追記する。
   `Origins` は既存の会社 Origin を残して末尾に追加し、`CacheBehaviors` は具体的なパスを先に並べる。
   サンプルのバケットドメインは製品スタックの RegionalDomainName 出力に置き換える。

```yaml
Origins:
  - Id: product-alpha
    DomainName: alpha-example.s3.us-east-1.amazonaws.com
    OriginAccessControlId: !GetAtt OriginAccessControl.Id
    S3OriginConfig:
      OriginAccessIdentity: ''
CacheBehaviors:
  - PathPattern: /products/alpha
    TargetOriginId: product-alpha
    ViewerProtocolPolicy: redirect-to-https
    AllowedMethods: [GET, HEAD, OPTIONS]
    CachedMethods: [GET, HEAD]
    Compress: true
    CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6
    ResponseHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03
    FunctionAssociations:
      - EventType: viewer-request
        FunctionARN: !GetAtt DirectoryIndex.FunctionARN
  - PathPattern: /products/alpha/*
    TargetOriginId: product-alpha
    ViewerProtocolPolicy: redirect-to-https
    AllowedMethods: [GET, HEAD, OPTIONS]
    CachedMethods: [GET, HEAD]
    Compress: true
    CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6
    ResponseHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03
    FunctionAssociations:
      - EventType: viewer-request
        FunctionARN: !GetAtt DirectoryIndex.FunctionARN
```

この例は URL のプレフィックスを維持します。共通 Function は `/products/alpha/` を
`/products/alpha/index.html` に書き換えるため、S3 の配置先もそれに合わせます。
`OriginPath` はプレフィックスを取り除く機能ではありません。
既存 Function はディレクトリ型の静的ページ向けです。SPA のフォールバックが必要なら製品用 Function を用意し、
その製品 Behavior だけに関連付けます。Distribution 全体の 403 / 404 をトップページに変換しないでください。

4. `cfn-lint infra/*.yaml` と製品のテストを通し、共通スタックを更新する。
5. 製品のページ・アセット・下層への直接アクセス、会社の3ページ、未登録パスを確認する。
6. 以後の製品リリースでは製品タグ workflow だけを実行し、キャッシュ無効化も
   `/products/alpha` と `/products/alpha/*` に限定する。書き換え前と後の URI を両方カバーする。

### Lambda に振り分ける製品・API を追加する

製品 IaC で Lambda と Function URL、または API Gateway を作成し、その HTTPS ホストを共通 Origin に追加します。
Lambda Function URL の場合は Lambda 用 OAC（`OriginAccessControlOriginType: lambda`、署名 `always`）を
共通 IaC に定義し、Function URL は `AWS_IAM` にします。S3 用 OAC は流用しません。
製品 IaC の Lambda リソースポリシーで共通 Distribution に対する `lambda:InvokeFunctionUrl` と
`lambda:InvokeFunction` を許可します。具体的なポリシーは AWS の OAC 手順に従い、直接呼び出しの拒否も確認します。

動的 Behavior には静的ページ用 Function を付けず、アプリにプレフィックスを処理させます。
API を含む場合は API の Behavior を製品ページより前に置き、末尾スラッシュなしの API ルートも扱います。
動的コンテンツは `CachingDisabled` を基本にし、必要な Cookie・クエリ・認証ヘッダーを Origin Request Policy で転送します。
Function URL / API Gateway に閲覧側の `Host: the3.co.jp` をそのまま送らず、例えば
`AllViewerExceptHostHeader` を利用します。HTTP メソッドは API に合わせて設定し、認証結果のキャッシュ混在を防ぎます。
Function URL の OAC `always` は `Authorization` を AWS 署名で置き換えます。
アプリの Bearer トークンをそのまま同ヘッダーで転送する設計は避け、Cookie による認証や API Gateway 経由を検討します。

Function URL + OAC の POST / PUT は、クライアントが本文の SHA-256 を `x-amz-content-sha256` に付ける必要があります。
通常のフォーム・API クライアントとの相性を確認し、必要なら API Gateway 経由を選びます。
共通 CloudFront があるだけで利用者認証ができるわけではないため、製品側で認証・認可を実装します。

### リリースと切り戻しの境界

製品のタグ workflow は製品専用ストレージ / Lambda だけを更新します。
各ロールは自身の配信元と共通 Distribution の無効化だけに限定します。
CloudFront の IAM 権限では無効化する URL パスを制限できないため、パスの限定は workflow とそのレビューで守ります。
会社サイトにページを追加した場合は、会社 workflow の無効化パスと公開確認対象も合わせて更新します。

製品のコンテンツ切り戻しはその製品の旧タグを使います。
Origin / Behavior の変更を戻す場合は共通 IaC を戻し、対象パスを無効化します。
製品を削除する場合は、先に共通 Behavior / Origin を外して反映とキャッシュの扱いを確認し、
その後に製品の実行環境・許可を削除します。共通基盤を削除すると全サイトに影響します。

## 範囲・費用・参照

公開ドメインは `the3.co.jp` のみです。`www`・ステージング・実製品のリソースはまだ含みません。
製品追加時に DNS や証明書の追加は不要です。
共通リソースは `Project=shared-delivery`、会社は `Project=landing-page` とし、
`Environment=production`、`ManagedBy=CloudFormation` を付けます。
S3 の旧バージョン・ハッシュ付きアセットは保持するため、保管費用が蓄積します。
CloudFront・S3・Route 53、将来の Lambda / API Gateway の利用料金が発生します。

参照: [CloudFront Behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html)、
[ACM のリージョン](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)、
[S3 OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)、
[Lambda OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)、
[Origin Request Policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html)、
[CloudFront IAM 権限](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudfront.html)、
[Astro base](https://docs.astro.build/en/reference/configuration-reference/#base)。
