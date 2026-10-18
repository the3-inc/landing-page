# インフラの管理先

AWS定義と構築手順はprivateの [infra](https://github.com/the3-inc/infra) へ移しました。閲覧には組織のアクセス権が必要です。
会社サイトとschedulaデモは同じpublic-web root、共通OIDCと既存3識別子は同repoのfoundationが管理します。

このrepoは会社サイト・商品紹介と、その公開workflowだけを管理します。
会社・製品間のSSM契約、登録フラグ、デモリンクの公開フラグは不要です。
会社用5変数をproductionへ受け取り、初回も通常更新も会社タグ`v*`のworkflowで公開します。infraは会社コンテンツをS3へ配置しません。

既存AWS/stateがある場合、定義を削除した旧rootでapplyせず、infraの移管手順で所有権を移します。
コード移動だけで実AWSやstateは変わりません。[サイト公開手順](../docs/site-deployment.md)を参照してください。
