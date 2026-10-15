# AWS 配信とリリース

Astro の `dist/` を非公開 S3 に配置し、CloudFront の HTTPS URL から配信します。
S3 への読み取りは対象 CloudFront の OAC に限定します。
デプロイロールは、このリポジトリの GitHub Environment `production` からの
OIDC 認証だけを受け付けます。AWS アクセスキーは登録しません。

## 初回の AWS 設定

公開 URL は `https://the3.co.jp` です。既存の Route 53 パブリックホストゾーンを使い、
`site.yaml` で ACM 証明書と DNS 検証、非公開 S3、CloudFront、ディレクトリの URL 書き換え、
ルートドメインの A / AAAA エイリアス、GitHub OIDC とデプロイロールを作成します。
既存のホストゾーンやドメイン登録は作成・移管しません。`www` は今回の対象外です。

証明書と配信リソースを一つのスタックで作るため、**作成先は `us-east-1` 固定**です。
S3 もこのリージョンに配置します。CloudFront は各地のエッジから配信します。
この手順は新規構築向けです。別リージョンの既存スタックを移行する手順ではありません。

AWS CLI v2、GitHub CLI、`jq` を用意し、管理用 AWS 認証と `gh auth login` を設定します。
AWS アクセスキーは GitHub に登録しません。以下はリポジトリのルートで実行します。

### 対象アカウントとホストゾーンの確認

```sh
export AWS_PROFILE=your-admin-profile
export AWS_REGION=us-east-1
aws sts get-caller-identity
aws route53 list-hosted-zones-by-name --dns-name the3.co.jp \
  --query 'HostedZones[?Name==`the3.co.jp.`].[Id,Config.PrivateZone]' --output table
```

`PrivateZone=false` のゾーン ID を選び、`/hostedzone/` を除いて設定します。
同名ゾーンが複数ある場合は、ドメインの権威 DNS に委任されているゾーンを選んでください。
証明書の自動検証には、ゾーンとスタックが同じ AWS アカウントにあり、
ドメインの NS がそのゾーンを指している必要があります。

```sh
export SITE_HOSTED_ZONE_ID=Z_REPLACE_WITH_PUBLIC_ZONE_ID
aws route53 get-hosted-zone --id "$SITE_HOSTED_ZONE_ID"
aws route53 list-resource-record-sets --hosted-zone-id "$SITE_HOSTED_ZONE_ID" \
  --query 'ResourceRecordSets[?Name==`the3.co.jp.`]'
```

既存のルート A / AAAA レコードがある場合、このテンプレートは上書きして取り込みません。
既存サイトへの影響を確認し、移行・切り戻しを決めてから競合を解消してください。
メール用 MX / TXT、他のサブドメインはこのスタックの管理対象にしません。

### IaC の実行

アカウント内の GitHub OIDC プロバイダーを探して再利用し、未作成なら IaC で作成します。
検出結果が空になるのは一覧取得に成功して該当プロバイダーが存在しない場合だけです。

```sh
(
  set -euo pipefail
  oidc_arn=$(aws iam list-open-id-connect-providers \
    --query 'OpenIDConnectProviderList[].Arn' --output json | \
    jq -er 'map(select(endswith(":oidc-provider/token.actions.githubusercontent.com"))) | .[0] // ""')
  aws cloudformation deploy \
    --stack-name landing-page-production \
    --template-file infra/site.yaml \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
      HostedZoneId="$SITE_HOSTED_ZONE_ID" \
      GitHubRepository=the3-inc/landing-page \
      GitHubOidcProviderArn="$oidc_arn" \
    --tags Project=landing-page Environment=production ManagedBy=CloudFormation
  aws cloudformation describe-stacks \
    --stack-name landing-page-production \
    --query 'Stacks[0].Outputs' --output table
)
```

上のブロックは Bash / Zsh で実行します。
証明書の検証と CloudFront の反映が完了するまで待ちます。
**この時点で DNS も切り替わりますが、初回タグのデプロイまではページを返せません。**

IaC が新規作成した OIDC プロバイダーはアカウント共通リソースとして削除時も保持します。
スタック更新時には、前回使った `GitHubOidcProviderArn` を維持してください。
初回に空で作成した場合、更新では `GitHubOidcProviderArn=""` を明示します。
上の自動検出ブロックは初回専用です。更新時に自分の作成したプロバイダーの ARN を渡すと、
条件が変わり、既存リソースの保持・管理範囲が変わるためです。

S3 バケット名と IAM ロール名は AWS が生成します。バケットはこのサイト専用です。
スタック削除時も S3 とオブジェクトを保持します。S3 のバージョニングを有効にしているため、
古いオブジェクトや過去バージョンの保管費用が蓄積します。必要になった時点で保持期間を決めます。
CloudFront、S3、Route 53 の利用料金が発生します。

## GitHub 設定

IaC 完了後、GitHub Environment と変数を CLI で登録できます。
`gh` は `the3-inc/landing-page` の設定を変更できるアカウントで認証してください。

```sh
(
  set -euo pipefail
  gh api --method PUT repos/the3-inc/landing-page/environments/production
  outputs=$(aws cloudformation describe-stacks \
    --stack-name landing-page-production --query 'Stacks[0].Outputs' --output json)
  gh variable set AWS_REGION --repo the3-inc/landing-page --env production --body us-east-1
  for pair in SITE_BUCKET:SiteBucket DISTRIBUTION_ID:DistributionId AWS_ROLE_ARN:DeployRoleArn; do
    key=${pair%%:*}
    output=${pair#*:}
    value=$(printf '%s' "$outputs" | jq -er --arg key "$output" \
      '.[] | select(.OutputKey == $key) | .OutputValue')
    gh variable set "$key" --repo the3-inc/landing-page --env production --body "$value"
  done
)
```

登録する変数は以下です。

| 変数 | 値 |
| --- | --- |
| `AWS_REGION` | スタックを作成したリージョン |
| `SITE_BUCKET` | Output `SiteBucket` |
| `DISTRIBUTION_ID` | Output `DistributionId` |
| `AWS_ROLE_ARN` | Output `DeployRoleArn` |

公開を有効にする前に以下を設定します。YAML を追加するだけではこれらの保護は有効になりません。

- `main` の Ruleset: PR と `CI / validate` 相当の実際のステータスチェックを必須にする。
- `v*` タグの Ruleset: 更新・削除を禁止し、作成者をリリース担当者に限定する。
- `production` の Deployment branches and tags: `main` ブランチと `v*` タグのみ許可する。
  `main` は手動の切り戻しワークフローを実行するために必要です。
- 必要な承認者を Environment の required reviewers に設定する。
  利用プランによって設定できる保護が異なるため、実際の設定画面で確認する。

Environment の OIDC subject にはタグやブランチ名が含まれません。
Environment の許可 ref とタグ作成権限が AWS 認証の保護の一部になります。
GitHub 側で OIDC subject をカスタマイズしている場合は、実際の subject に合わせて
`infra/site.yaml` の信頼ポリシーを変更してください。

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
CloudFront の全パスを無効化し、完了を待った後、公開 URL の `/`・`/company/`・`/contact/` が
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

## リソースタグと範囲

AWS リソースには `Project=landing-page`、`Environment=production`、
`ManagedBy=CloudFormation` を付けます。リリースタグはソースコードの版、
リソースタグは費用集計・管理対象の識別に使い分けます。
個々のリリースでインフラタグを書き換えず、デプロイ実行サマリーで公開版を追跡します。

公開ドメインは `the3.co.jp` のみです。`www` とステージング環境は含みません。
CloudFront Function は末尾 `/` の URI に `index.html`、拡張子のない URI に `/index.html` を付けます。
存在しないページをトップページに置き換えません。
公開後の通常リリース・切り戻しはタグの workflow だけで行い、IaC の再実行は不要です。
インフラ変更がある場合のみ、管理用 AWS 認証で CloudFormation を更新します。

参照: [AWS OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)、
[GitHub OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)、
[AWS CLI sync](https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html)。

独自ドメインの参照: [ACM リージョン要件](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)、
[CloudFormation 証明書の自動 DNS 検証](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-certificatemanager-certificate.html)。
