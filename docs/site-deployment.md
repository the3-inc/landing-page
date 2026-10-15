# 会社サイトを公開する

会社サイトと商品紹介はこのrepoから公開します。基盤構築はprivateの [the3-infra](https://github.com/the3-inc/the3-infra) で完了させます。
初回はinfraのbootstrapでデモを公開し、公開先を登録した後に会社サイトを公開します。
通常更新でschedulaの公開やTerraform applyを呼び出す必要はありません。

## 初回設定

Actionsを実行可能にし、production Environmentを作成します。
infraのconfigure-deployが会社用の次の5変数を登録します。SecretsではなくEnvironment variablesを使い、長期AWSキーは登録しません。

| 変数 | 内容 |
| --- | --- |
| AWS_ACCOUNT_ID | 構築先account ID |
| AWS_REGION | ap-northeast-1 |
| SITE_BUCKET | 会社専用S3 |
| DISTRIBUTION_ID | 共有CloudFront ID |
| AWS_ROLE_ARN | 会社専用公開ロールARN |

mainにPR/CIのvalidate必須化、v*タグに作成者制限と移動/削除禁止を設定します。
productionの許可refはmainとv*に限定し、必要なrequired reviewersを設定します。
デモリンク用の変数は不要です。会社公開前にデモ・技術案内が利用可能か確認します。

## タグによる公開

mainへマージし、そのcommitのmain CI成功を確認して、未使用のvMAJOR.MINOR.PATCHタグをpushします。

```sh
git fetch origin main --tags
git log -1 --oneline origin/main
git tag --list 'v*' --sort=-version:refname
# main CI成功と未使用バージョンを確認した後に実行する例
git tag -a v1.0.0 origin/main -m 'Release v1.0.0'
git push origin refs/tags/v1.0.0
```

例のタグは未使用の場合だけ使います。ローカルのタグ作成だけでは公開されません。package.jsonの版更新やGitHub Release作成は不要です。
Deploy productionはタグ形式・main履歴を検証し、必要な承認後にlint・テスト・ビルド・会社S3配置・CloudFront無効化と完了待ちを実行します。
確認対象は /、/company/、/contact/、/products/、/products/schedula/ の5ページです。
会社S3だけを同期し、デモやLambdaを更新しません。成功後はブラウザーでも確認してください。
workflowにTerraform/state/SSM/IAM/DNS/CloudFront設定の変更権限はありません。

```sh
gh run list --repo github.com/the3-inc/landing-page --workflow deploy.yml
gh run watch RUN_ID --repo github.com/the3-inc/landing-page --exit-status
```

## 切り戻しと失敗

Actions → Deploy production → Run workflowでBranch: mainと以前の既存タグを指定します。タグは移動せず、新しい修正には次の版を使います。
旧タグをlockfileで再ビルドするため、過去の同一バイトの復元は保証しません。
S3更新はファイル単位です。失敗時はログ・実URLを確認し、同じタグの再実行か旧タグの公開を行います。
会社コンテンツの切り戻しで共有経路のTerraformを戻す必要はありません。
PR/main CIはフロントエンドを検証し、TerraformとURL rewriteはinfra側CIが検証します。
