# 会社サイトを公開する

会社サイトと商品紹介はこのrepoから公開します。基盤構築はprivateの [infra](https://github.com/the3-inc/infra) で完了させます。
infraのbootstrapは準備中APIを含む配信基盤までを構築し、会社サイトやデモの実コンテンツを配置しません。
公開先の登録後、初回も通常更新もこのrepoの`v*`タグworkflowで公開します。schedulaの公開やTerraform applyは呼び出しません。

## 初回設定

infraのbootstrap/apply前にActionsを実行可能にし、production Environmentと保護設定を作成します。infra担当者はこのrepoのEnvironment変数を書き込める`gh`認証を用意します。
infraのbootstrap最終apply・通常apply成功後、最新outputから会社用の次の5変数を自動同期します。同期だけが失敗した場合は、再applyせずinfraの`configure-deploy`で再試行します。SecretsではなくEnvironment variablesを使い、長期AWSキーは登録しません。

| 変数 | 内容 |
| --- | --- |
| AWS_ACCOUNT_ID | 構築先account ID |
| AWS_REGION | ap-northeast-1 |
| SITE_BUCKET | 会社専用S3 |
| DISTRIBUTION_ID | 共有CloudFront ID |
| AWS_ROLE_ARN | 会社専用公開ロールARN |

mainにPR/CIのvalidate必須化、v*タグに作成者制限と移動/削除禁止を設定します。
productionの許可refはmainとv*に限定し、必要なrequired reviewersを設定します。
デモリンク用の変数は不要です。デモ・技術案内の初回公開はschedula自身の`web-v*`タグworkflowで行います。会社公開前に紹介するリンク先が利用可能か確認します。

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
Deploy productionは必要な承認後にタグ形式・main履歴と対象commitの最新main push CI成功を検証し、lint・テスト・ビルド・会社S3配置・CloudFront無効化と完了待ちを実行します。
対象commitのmain CIが未実行・実行中・失敗の場合は、S3を更新する前に停止します。CI成功を確認してからデプロイを再実行してください。
確認対象は /、/company/、/contact/、/products/、/products/schedula/ の5ページです。
会社S3だけを同期し、デモやLambdaを更新しません。成功後はブラウザーでも確認してください。
workflowにTerraform/state/SSM/IAM/DNS/CloudFront設定の変更権限はありません。

5ページの応答確認に続いて、`scripts/site_check.py --url https://the3.co.jp`で会社・製品間の往復リンク、アンカー、静的参照先も検査します。初回はデモ・技術案内を先に公開してください。
検査スクリプトは最初にcheckoutするmainからrunnerの一時領域へ保存し、公開対象タグへのcheckout後も使います。スクリプト追加前のタグへ切り戻す場合も接続検査を実行します。
公開前の生成物による確認と公開後の再確認は[サイト間の接続確認](site-integration.md)を参照してください。

```sh
gh run list --repo github.com/the3-inc/landing-page --workflow deploy.yml
gh run watch RUN_ID --repo github.com/the3-inc/landing-page --exit-status
```

## 切り戻しと失敗

Actions → Deploy production → Run workflowでBranch: mainと以前の既存タグを指定します。タグは移動せず、新しい修正には次の版を使います。
productionの許可refにはブランチmainとタグv*の両方が必要です。手動実行も、指定した既存タグのcommitにmain push CIの成功履歴が必要です。
旧タグをlockfileで再ビルドするため、過去の同一バイトの復元は保証しません。
S3更新はファイル単位です。失敗時はログ・実URLを確認し、同じタグの再実行か旧タグの公開を行います。
会社コンテンツの切り戻しで共有経路のTerraformを戻す必要はありません。
PR/main CIはフロントエンドを検証し、TerraformとURL rewriteはinfra側CIが検証します。

## アクセス解析と問い合わせフォーム

[GA4の設定・イベント定義・受付先の契約・受入確認](analytics.md)に従う。
`PUBLIC_GA4_MEASUREMENT_ID`は両repoで同じRepository variableを使う。受付サービス選定後に`PUBLIC_CONTACT_ENDPOINT`をproduction Environment variableへ登録する。AWS公開先の5変数とは別に管理し、infraの自動同期対象には加えない。
