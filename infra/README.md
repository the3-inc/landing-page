# 会社サイト・製品紹介と製品本体の配信

会社サイトと製品紹介は `the3.co.jp`、製品本体は製品別サブドメインと専用 CloudFront で配信します。
`/products` から別の S3 / Lambda にルーティングする構成は採りません。
紹介ページのコンテンツはこのリポジトリ、製品本体のアプリと IaC は各製品リポジトリが管理します。

| URL | 配信先 | リリース |
| --- | --- | --- |
| `the3.co.jp/`・`/company/`・`/contact/` | 会社用 CloudFront → 会社 S3 | このリポジトリのタグ |
| `the3.co.jp/products/alpha/` | 同じ会社用 CloudFront → 同じ会社 S3 | このリポジトリのタグ。紹介ページは将来追加 |
| `alpha.the3.co.jp` | Alpha 専用 CloudFront → Alpha の S3 / Lambda | Alpha リポジトリのタグ |

| テンプレート | スタック名 | 管理するリソース |
| --- | --- | --- |
| `company-delivery.yaml` | `the3-company-delivery-production` | 会社用証明書、ルート DNS、CloudFront、会社用 OAC / Function、再利用可能なアカウント OIDC プロバイダー |
| `company-site.yaml` | `the3-company-site-production` | 会社・紹介ページ用 S3、バケットポリシー、会社用デプロイロール |
| 各製品リポジトリの IaC（将来作成） | 製品ごと | 製品用証明書、サブドメイン DNS、専用 CloudFront、S3 / Lambda、製品用デプロイロール |

配信スタックは会社 S3 の `SiteBucketDomainName` を受け取り、会社スタックは配信スタックの
`DistributionId` と `GitHubOidcProviderArn` を受け取ります。循環参照を避けるため、
初回は **会社 S3 作成 → 会社用配信基盤作成 → 会社サイトの接続設定** の順です。
相互 Export / Import は使いません。通常のコンテンツ更新では IaC の再実行は不要です。
製品が再利用するのはアカウント共通の OIDC プロバイダーと既存 Route 53 ゾーンだけです。
会社の Distribution・証明書・OAC・Function・デプロイロールは製品へ渡しません。

## 初回構築

以下は AWS が未構築の状態からの手順です。旧 `site.yaml` の単一スタック、または旧 `shared-delivery.yaml` を作成済みの場合は、
この手順をそのまま実行せず、既存リソースの保持・インポートと DNS / CloudFront Alias の移行を別途計画します。
旧スタックにこの分割後のテンプレートを直接適用すると、削除や置き換えが起きます。

AWS CLI v2、GitHub CLI、`jq`、管理用 AWS 認証、`gh auth login` を用意します。
コマンドは Bash / Zsh で、リポジトリのルートから実行します。
会社サイトの配信基盤は ACM の要件により `us-east-1` 固定です。以下では会社 S3 も同リージョンに作成します。

### アカウント・既存 DNS の確認

```sh
export AWS_PROFILE=your-admin-profile
export AWS_REGION=us-east-1
export COMPANY_SITE_STACK=the3-company-site-production
export COMPANY_DELIVERY_STACK=the3-company-delivery-production
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

### 会社サイトの配信基盤の作成

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
    --stack-name "$COMPANY_DELIVERY_STACK" \
    --template-file infra/company-delivery.yaml \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
      HostedZoneId="$SITE_HOSTED_ZONE_ID" \
      CompanySiteBucketDomainName="$company_domain" \
      GitHubOidcProviderArn="$oidc_arn" \
    --tags Project=company-delivery Environment=production ManagedBy=CloudFormation
)
```

証明書の DNS 検証、CloudFront、ルート A / AAAA の作成完了まで待ちます。
**この時点で DNS が向きますが、次の接続設定と初回タグデプロイが終わるまでページを返せません。**

### 会社サイトを会社サイトの配信基盤に接続

```sh
(
  set -euo pipefail
  delivery=$(aws cloudformation describe-stacks --stack-name "$COMPANY_DELIVERY_STACK" \
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
ロールには会社 S3 の更新と会社用 Distribution のキャッシュ無効化だけを許可し、
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
  distribution_id=$(aws cloudformation describe-stacks --stack-name "$COMPANY_DELIVERY_STACK" \
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
| `DISTRIBUTION_ID` | 配信スタックの `DistributionId` |

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
会社用 Distribution の全パス（将来の紹介ページも含む）を無効化し、完了を待った後、公開 URL の `/`・`/company/`・`/contact/` が
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

## 会社の配信基盤・ストレージの更新

会社サイトと紹介ページの配信設定は `company-delivery.yaml` が管理します。
製品本体の Origin / Behavior は各製品の IaC が専用 Distribution に定義します。
会社・製品のタグ workflow から会社サイトの配信基盤の IaC を実行しません。
インフラ変更は管理用 AWS 認証で変更差分を確認して適用します。
既存スタックの更新では、未指定のパラメーターは前回値を再利用します。

```sh
aws cloudformation deploy \
  --stack-name "$COMPANY_DELIVERY_STACK" \
  --template-file infra/company-delivery.yaml \
  --capabilities CAPABILITY_IAM \
  --tags Project=company-delivery Environment=production ManagedBy=CloudFormation

aws cloudformation deploy \
  --stack-name "$COMPANY_SITE_STACK" \
  --template-file infra/company-site.yaml \
  --capabilities CAPABILITY_IAM \
  --tags Project=landing-page Environment=production ManagedBy=CloudFormation
```

配信スタックの `GitHubOidcProviderArn` 入力は初回値を維持します。初回に空でプロバイダーを
作成した場合、更新時も空を維持し、作成済み ARN を自動検出して渡し直さないでください。
配信スタックで新規作成した OIDC プロバイダーは削除時も保持します。
会社用 Distribution を作り直した場合は、会社 S3 のポリシーと会社の GitHub 変数を更新します。
製品の Distribution ID と配信設定は独立しているため変更しません。

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
今回の会社テンプレートを製品スタックにそのまま適用すると、会社ドメインの DNS / Alias が競合します。
会社用の値をハードコードしたテンプレートは流用せず、製品側で次の契約を満たす IaC を用意します。

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
会社用の配信スタックを削除すると会社サイトと紹介ページが停止します。
会社配信スタックが新規作成した OIDC プロバイダーは保持されますが、製品が利用している間は手動削除もしません。

## 範囲・費用・参照

現時点で作成するのは `the3.co.jp` の会社配信基盤と会社 S3 だけです。
紹介ページの内容・製品本体・製品サブドメイン・`www`・ステージングはまだ作成しません。
会社用配信リソースは `Project=company-delivery`、ストレージは `Project=landing-page` とし、
`Environment=production`、`ManagedBy=CloudFormation` を付けます。
S3 の旧バージョン・ハッシュ付きアセットは保持するため、保管費用が蓄積します。
会社と各製品の CloudFront・S3・Route 53、将来の Lambda / API Gateway の利用料金が発生します。

参照: [ACM のリージョン](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)、
[Route 53 と CloudFront](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-cloudfront-distribution.html)、
[S3 OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)、
[Lambda OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)、
[Cookie のスコープ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)。
