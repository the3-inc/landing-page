# schedulaの公開デモを会社サイト配下へ登録する

商品紹介は `/products/schedula/`、デモは `/products/schedula/demo/`、技術案内は `/products/schedula/docs/`、APIは `/products/schedula/api/*` とする。
利用アプリは `schedula.the3.co.jp` に独立配信する。このPRでアプリ基盤やAWSの適用は行わない。

## 所有するリソース

会社のcompany rootが共有CloudFrontの全Origin / Behavior・OAC・WAF・配信ポリシー・接続先のSSM契約を管理する。
schedula側rootはデモ用S3 / bucket policy・Lambda / 呼出し許可・ECR・公開ロール・ログ・配信元のSSM契約を管理する。
CloudFrontの設定はDistribution単位で置き換わるため、schedula側のstateへ同じDistributionを取り込まない。
通常のデモ更新はS3とLambda aliasだけを更新し、会社のapplyや無効化権限を必要としない。

## SSM契約

すべて東京の `String` 内のJSON。foundationの既存3識別子は変更しない。

会社が `/the3/production/company/v1/edge` を公開する。

```json
{
  "schema_version": 1,
  "aws_account_id": "123456789012",
  "host": "the3.co.jp",
  "distribution_arn": "arn:aws:cloudfront::123456789012:distribution/E123EXAMPLE"
}
```

schedulaが `/the3/production/products/schedula/v1/origins` を公開する。

```json
{
  "schema_version": 1,
  "aws_account_id": "123456789012",
  "region": "ap-northeast-1",
  "static_origin_domain": "the3-schedula-demo-production-test.s3.ap-northeast-1.amazonaws.com",
  "function_url_domain": "example.lambda-url.ap-northeast-1.on.aws",
  "function_alias_arn": "arn:aws:lambda:ap-northeast-1:123456789012:function:the3-schedula-demo-production:live"
}
```

例のID・domainは実値ではない。各rootのresourceから生成する。
会社のIaC主体に製品契約のGetParameter、schedulaのIaC主体に会社契約のGetParameterを許可する。
書込は各所有rootだけ、通常公開ロールには両契約の読取・更新を許可しない。他stateの参照権限も与えない。
schema・account・region・配信元domain・専用Lambda aliasを検証し、誤った値をplan時に拒否する。

## 初回登録

1. `enable_schedula=false` のままcompanyを構築する。会社Distributionとedge契約を先に作り、製品契約はまだ参照しない。
2. schedula側で会社契約を読み、デモ用S3・ECRを構築、検証したイメージを投入してLambda・live alias・Origin許可・製品契約を作る。
3. 会社側のtfvarsを `enable_schedula=true` にしてplan / showで確認する。二つのOrigin・8経路・OAC・API用WAF以外に意図しない変更がないことを確認してapplyする。
4. schedula側でWebタグから配備し、3教材・技術文書・API署名・直接Origin拒否を確認する。
5. 会社側production Environmentの変数 `PUBLIC_SCHEDULA_DEMO=true` を設定し、新しい会社タグで紹介ページのデモ・文書リンクを有効にする。

このPRでは上の適用・変数設定・タグ操作を実行しない。紹介文は追加するが、変数未設定ではデモリンクを出さず「公開準備中」と表示する。
SSM契約が存在しないまま登録を有効にするとplanが失敗する。明示的な登録なしに、新しいSSM値だけで経路を自動変更しない。

## パスとキャッシュ

商品紹介は会社S3、`demo` / `demo/*` / `docs` / `docs/*` / `assets/*` / `license.txt` はデモS3、`api` / `api/*` はLambdaへ流す。
上記はすべて `/products/schedula/` 配下。`/products/schedula/*` の一括転送は設定しない。
S3キーは公開パスと一致させ、Origin pathは追加しない。APIへディレクトリrewriteを付けない。
静的Functionはdemo / docsの末尾slashを308で補い、ディレクトリ末尾へindex.htmlを付ける。
HTML・教材・文書・APIはCachingDisabled、hash付きassetsだけ長期キャッシュする。
LambdaはAWS_IAMとOAC always、Hostを転送せず本文hash・教材ID・Origin・Content-Typeだけを転送する。
公開クライアントは送信本文のUTF-8バイト列から `X-Amz-Content-Sha256` を生成する。

WAFはAPIパスだけにIP単位60回/5分・全体300回/5分の提案上限を設定する。sampled requestは無効で、本文をログに保存しない。
これは費用の絶対上限ではない。実公開前に混雑時の動作・費用予算・通知先を確認する。
会社の `/*` 無効化はデモにも影響するが、会社workflowは会社S3だけを同期し、デモのファイルを削除しない。
デモ配信元を置換するときは新旧を併存させ、会社経路を切り替えてから旧配信元を削除する。
会社のコンテンツ切り戻しと、経路を削除するTerraformの切り戻しは区別する。

## 検証

既存のCIはAWS認証なしでfmt / validate / provider mock planとAstroの型・コンテンツ・URL処理を確認する。
未登録の初回plan、登録時の経路・cache・OAC・WAF、他account / 不正domain / 誤alias / 未知schemaの拒否をテストする。
mock成功は実AWSの権限・DNS・CloudFront転送の成功を保証しない。公開時には会社の既存3ページと商品2ページ、デモ・技術案内・APIを実URLで確認する。
