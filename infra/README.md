# AWS 配信とリリース

Astro の `dist/` を非公開 S3 に配置し、CloudFront の HTTPS URL から配信します。
S3 への読み取りは対象 CloudFront の OAC に限定します。
デプロイロールは、このリポジトリの GitHub Environment `production` からの
OIDC 認証だけを受け付けます。AWS アクセスキーは登録しません。

## 初回の AWS 設定

AWS アカウントと作成先リージョンを決め、AWS CLI v2 に管理用の認証を設定します。
以下は管理者が一度だけ実行する手順です。アプリのデプロイロールには
インフラの作成・変更権限を与えません。

1. 対象アカウントに GitHub OIDC プロバイダーがあれば再利用します。
   なければ IAM で URL `https://token.actions.githubusercontent.com`、
   Audience `sts.amazonaws.com` のプロバイダーを作成します。
   このアカウント共通リソースはサイト用スタックに含めません。
2. アカウントを確認してから CloudFormation スタックを作成します。

```sh
export AWS_PROFILE=your-admin-profile
export AWS_REGION=ap-northeast-1
aws sts get-caller-identity

# 実際のアカウント ID に置き換える
aws cloudformation deploy \
  --stack-name landing-page-production \
  --template-file infra/site.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    GitHubRepository=the3-inc/landing-page \
    GitHubOidcProviderArn=arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com \
  --tags Project=landing-page Environment=production ManagedBy=CloudFormation

aws cloudformation describe-stacks \
  --stack-name landing-page-production \
  --query 'Stacks[0].Outputs' --output table
```

S3 バケット名と IAM ロール名は AWS が生成します。バケットはこのサイト専用です。
スタック削除時も S3 とオブジェクトを保持します。S3 のバージョニングを有効にしているため、
古いオブジェクトや過去バージョンの保管費用が蓄積します。必要になった時点で保持期間を決めます。
CloudFront、S3 ともに利用料金が発生します。

## GitHub 設定

Settings → Environments で `production` を作り、Environment variables に設定します。

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

タグの push で `Deploy production` が起動します。タグ形式と `origin/main` に含まれる
コミットであることを確認し、lint・テスト・ビルド成功後に AWS を更新します。
GitHub Actions の `GITHUB_TOKEN` で作ったタグでは通常別ワークフローが起動しないため、
この手順はリリース担当者がローカルから実行してください。

ハッシュ付き `_astro/` アセットを先に配置し、次にページを同期します。
以前の `_astro/` は保持し、それ以外の不要ファイルは削除します。
CloudFront の全パスを無効化し、完了を待った後、実行サマリーにタグ・コミット・無効化 ID を記録します。
デプロイ後は Output `SiteUrl` を開き、表示・リンクを確認してください。
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

初期構成は CloudFront 標準ドメインと現在のホームページ `/` 向けです。
独自ドメイン・ACM・DNS・ステージング環境は含みません。
Astro の `/about/` のような下層ページを追加する場合、非公開 S3 はディレクトリの
`index.html` を自動解決しないため、その時点で CloudFront の URL 書き換えを追加してください。

参照: [AWS OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)、
[GitHub OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)、
[AWS CLI sync](https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html)。
