# 会社サイトと製品Webの所有・デザイン・URL方針

会社・製品のWebを変更する担当者が、編集先、共通に保つ部分、公開前の確認対象を判断するための文書です。
紹介ページは会社サイト、デモ・技術文書・操作画面は製品側が所有します。共通デザインと公開URLの約束を設け、各リポジトリから独立して公開します。

方針は2026-10-19の合意を記録しています。後半の実装照合は同日のスナップショットであり、本番の配備状態を示すものではありません。

## 所有と公開の単位

同じ利用目的を持ち、一緒に変更・公開する画面を一つのフロントエンドで管理します。URLの階層とリポジトリの階層を一致させる必要はありません。

| 対象 | コード・内容・公開の担当 | 変更時に守ること |
| --- | --- | --- |
| 会社情報、製品一覧、製品紹介 | landing-page | 会社共通レイアウトと導入相談への導線を保つ |
| デモ、教材、技術文書、公開API | schedulaなどの製品リポジトリ | エンジンと説明・操作の整合を確認する |
| 利用アプリ | schedula-appなどのアプリリポジトリ | 日常の操作・保存など、アプリの利用目的を優先する |
| 配信先、公開パス、経路の優先順位 | infra | 会社・製品の成果物を正しい配信先へ接続する |

製品の仕様と技術文書の正本は製品側に置きます。会社サイトの紹介はその要約であり、機能、ライセンス、提供状況が変わるときは、製品側の変更担当が紹介ページの更新要否も確認します。
会社・製品の公開workflowが相手の公開やTerraform applyを呼び出す構成にはしません。更新途中と切り戻し時も、公開済みのリンク先と画面・APIの互換性を保ちます。

## デザインを共通にする範囲

会社サイト内の紹介ページは、`SiteLayout.astro`と`global.css`をそのまま使います。
製品のデモ・技術案内は製品ナビゲーションを持ち、製品紹介へ戻れるようにします。会社と同じヘッダーのHTMLやメニュー構成までは要求しません。

| 共通に保つもの | 製品ごとに変えてよいもの |
| --- | --- |
| 会社名・会社ロゴの表記と扱い、会社との関係が分かる表示 | 製品名、製品ロゴ、アクセントカラー |
| 日本語を読みやすく表示する文字の基準、余白の考え方 | 用途に応じた文字サイズ、画面密度、レイアウト |
| キーボード操作、フォーカス表示、本文への移動、動きを減らす設定 | メニュー項目、操作の順序、製品固有のボタン・結果表示 |
| 製品紹介へ戻るリンクと導入相談への導線 | 会社サイトと異なる製品用ヘッダー・フッター |

会社側のブランド素材は[デザイン素材](brand-assets.md)、実装は`src/styles/global.css`を参照します。既存の製品色や明るさのテーマが違うだけで不具合とは判断しません。
製品側では、例えば「the3合同会社の製品」の表示と会社サイトへのリンクで関係を示し、製品ロゴを会社ロゴに置き換えることは求めません。

共通部分をコードで配布するときは、必要なCSS・画像などを小さくまとめ、各利用側が版を固定してビルドへ取り込みます。実行時に他サイトの最新ヘッダーやCSSを取得する構成は採用しません。
現時点で共通パッケージの新設は必須にしません。共有する値と操作基準を先に明文化し、複数サイトで同じ変更が繰り返し必要になったときに抽出します。
全画面へヘッダー変更を必ず同時反映する要件が生じた場合は、共有部品の導入だけでは足りないため、ビルド・公開単位をまとめるかを再検討します。

## 公開URLの約束

| 公開URL | 内容の担当・配信先 |
| --- | --- |
| `/`、`/company/`、`/contact/`、`/products/` | landing-page・会社S3 |
| `/products/schedula/` | landing-page・会社S3 |
| `/products/schedula/demo/`配下 | schedula・製品S3 |
| `/products/schedula/docs/`配下 | schedula・製品S3 |
| `/products/schedula/assets/`配下、`/products/schedula/license.txt` | schedula・製品S3 |
| `/products/schedula/api/`配下 | schedula・公開API |
| `https://schedula.the3.co.jp` | schedula-appの利用アプリ用。今回の会社・デモ配信の構築対象外 |

infraは公開パスと配信先の対応を所有し、製品側は割り当てられた配下のページ・ファイル・内部遷移を所有します。個々の教材や文書を追加するたびにinfraの経路を追加する構成にはしません。
公開用のベースパスとAPIパスは製品内の一か所の定義から導出し、HTML・JS・生成先・検査が同じ値を使うようにします。複数言語にまたがる場合はビルド時の埋め込みなどを使い、実行時の経路登録サービスは増やしません。
会社サイトへのリンクは会社URL、製品内部のリンクは製品のベースパスとして区別します。例えば会社トップへの`https://the3.co.jp/`を、製品紹介の`/products/schedula/`へ変換してはいけません。

経路の実装方法と、内容の所有者は区別します。CloudFrontの制約に合わせて広いパターンで受け、関数で会社・製品のOriginを選択しても、最終的な配信先が上表どおりなら方針に適合します。
`/products/schedula/*`が見つかったことだけを理由に、一括転送の不具合と判断しません。APIの優先順位、Origin選択、アセット、キャッシュ・レスポンスヘッダーも合わせて検証します。

## ローカル確認と公開前の確認

製品の通常開発用サーバーと、公開用の確認環境は区別します。既存の自由JSON入力やAdapter試用を含むローカルデモを、公開版へ合わせるためだけに削除・変更しません。
公開用の確認では、会社と製品の生成物を一時ディレクトリへ、実際の公開パスのまま配置して確認します。会社の出力を製品の出力で上書きせず、APIの確認は既存の公開handler・コンテナー検証を使います。ローカル確認のために本番のOrigin・入力制限を緩めません。

各リポジトリのテストに加え、次をサイト間の接続確認として扱います。

- 製品一覧→製品紹介→デモ・技術案内→製品紹介が移動できる。
- 紹介の`#contact`が実在し、デモの教材IDが公開教材のフラグメントとして解決できる。
- CSS・JS・画像・文書・教材が割り当てられたパスに存在し、別サイトのファイルで代替されていない。
- demo/docsの末尾スラッシュ補完、未知のページ・ファイルの非成功応答、APIの経路が期待どおりである。
- 狭い画面とキーボード操作で、各サイトのナビゲーションと戻る導線を使える。

配信先の選択とURL補完はinfra、成果物内のリンクとアンカーは各コードリポジトリ、両者を合わせた公開後確認は公開担当が受け持ちます。通常の会社公開を製品の再公開に依存させず、両方が公開済みになった状態で接続を確認します。

## 実装・検証結果（2026-10-19）

以下の5点を実装しました。コード・文書・テストの変更であり、本番配備は別の操作です。

| 対応 | 実装 |
| --- | --- |
| 公開パスの集約 | schedulaの`web/paths.py`を正本とし、生成先・公開handler・smoke・配備先のprefixを参照。ブラウザーへは`data-api-base`で渡す |
| ブランドの共通部分 | デモ・技術案内に会社への絶対URLと関係表示を追加。文字のフォールバック、フォーカス表示を会社の基準に合わせ、製品色・メニュー・ロゴは維持。製品側の`docs/web-design.md`にも記録 |
| 公開パスのプレビュー | 会社側の`scripts/site_check.py --company … --product … --serve`で両生成物を一時rootへ配置。重複とsymlinkを拒否し、localhostだけで配信 |
| 継続する接続検査 | 同じscriptで往復リンク・アンカー・教材ID・静的参照を検証。会社CIで検査ツールの回帰を実行し、会社公開後は公開URLで検証。製品公開smokeは製品所有の静的参照も検証。既存の公開ブラウザーテストに会社生成物を指定できる |
| 経路の説明 | schedulaとinfraの公開手順で、Freeの広いパターンと関数によるOrigin選択、hardenedの詳細な振り分けを説明。配信設定そのものは変更不要 |

使い方は[サイト間の接続確認](site-integration.md)を参照してください。
初回は製品の公開後に会社を公開します。製品の公開検査は会社初回公開に依存せず、会社の公開検査と生成物の結合確認が両者の接続を確認します。

ローカルで会社のlint・既存6テスト・Astro型検査・5ページのビルド、接続検査の3テスト、製品の公開・ローカル導線・Web公開契約・CI選択の86テストが成功しました。
最新会社生成物と製品生成物の7ページ・参照111件を検証し、localhostへのHTTP検査でも7ページ、308補完、未知の文書の404を確認しました。
Chromiumで既存ローカルデモの回帰と、会社紹介→公開デモの実計算→紹介→技術案内→相談先の往復、320/390/1440px、キーボードの本文移動を確認しました。infraの経路テスト6件も成功しました。
GitHub CIの結果は各リポジトリのPRで確認します。本番公開・Terraform apply・実AWSの変更は、この実装検証に含めません。

## 変更前の実装との照合（2026-10-19）

以下は変更前に整理した記録です。現在の対応状況は上の「実装・検証結果」を参照してください。

### 確認した範囲

landing-pageはこの作業ツリーの`4998635ac64006b474741b4ade45c16791201bc3`を基準としています。
schedula、infra、schedula-appは取得済みの`origin/main`を読み、下記の対象ファイルをGitHub上の`main`とblob SHAで照合しました。これはファイル単位の確認であり、リポジトリ全体の最新HEADの保証ではありません。
schedulaのローカル作業ツリーは取得済みmainより7コミット古く、infraも別ブランチだったため、作業ツリーの内容だけで未実装とは判断していません。

| リポジトリ | 照合に使った取得済みcommit | GitHub mainとの差の扱い |
| --- | --- | --- |
| schedula | `6b15efdc0e3c00ccfd6120a1acd8b87f671a1be5` | ビルド、HTML、CSS、JS、ローカルserver、公開テスト、smoke、公開手順は一致。公開workflowだけGitHub mainの内容を優先 |
| infra | `04e76064e62ff3a6c4b5d2800793f8814fa5ef5b` | routing、2つのCloudFront関数、経路テストは一致。`company.tf`だけGitHub mainの内容を優先 |
| schedula-app | `ef1e55d3af342caf696b6c4f95e60b9811663a25` | `front/index.html`、`front/style.css`、`front/vite.config.ts`は一致。公開基盤・全画面の監査は対象外 |

GitHub mainを優先したファイルのblob SHAは、schedulaの`.github/workflows/deploy-demo.yml`が`918dbc1ad974d593b2ce6dd2167da27ec33efb95`、infraの`public-web/company.tf`が`d3734651a9f1d72e13dfc0e216992c765dd95142`です。

### すでに方針を満たす実装

| 対象 | 確認した実装 | 判断 |
| --- | --- | --- |
| 紹介ページの所有 | `src/pages/products/schedula.astro`が共通`SiteLayout.astro`を利用 | landing-pageに維持。移管不要 |
| デモ・文書の独立公開 | schedulaの`web/build.py`と`deploy-demo.yml`が製品S3・APIを更新。会社側workflowは会社S3を更新 | workflowの統合や会社ヘッダーの移植は不要 |
| 戻る・相談する導線 | 元HTMLの`/`と`/#contact`が公開ビルドで`/products/schedula/`と`/products/schedula/#contact`へ変換される | 導線は実在する。新設不要 |
| アセットの分離 | `web/build.py`が内容hash付きJS/CSSを製品の`assets/`へ出力 | `/_astro/`との統合や配信先変更は不要 |
| 配信先とURL補完 | infraのFree構成は関数で会社・製品Originを選択。hardened構成は詳細なパターンを使用。APIは先に扱う | 所有方針と適合。全面的な経路変更は不要 |
| 個別の検証 | 会社の本文・リンク文字列テスト、製品の出力リンク・文書テスト、infraの経路テスト、公開後のページ応答とAPI smokeがある | 既存検証を再利用する |
| 製品固有のデザイン | デモ・文書は独自CSSと製品ナビ、アプリは作業用の画面・配色を持つ | 色・密度・ヘッダーの相違自体は修正対象にしない |

### 変更が必要な箇所

以下は変更前の実装作業の整理です。対応結果と検証は上の「実装・検証結果」に記載しています。

| 変更対象・担当 | 現状と不足 | 必要な変更 | 完了の確認 |
| --- | --- | --- | --- |
| 公開ベースパス・schedula | `web/build.py`の`BASE`、`web/handler.py`の`PREFIX`、`demo/features.js`のAPI URLが別々に固定されている | 製品内の公開パス定義から生成・参照する。既存ローカルURLは維持する | 生成HTML・JS、handler、smokeのパスが一致し、既存公開範囲のテストが通る |
| ブランドの共通部分・schedulaとlanding-page | 会社・製品に個別の文字・配色・余白・フォーカス定義がある。製品の`demo/index.html`・`demo/guide.html`には会社との関係を示す表示がない | 本文書の共通範囲を製品のデザイン手順にも記録し、両HTMLに会社との関係と会社URLを示す。`demo/landing.css`・`demo/style.css`を会社の`src/styles/global.css`と共通基準に照らして調整する | 会社へのリンクが製品URLへ変換されず、キーボード・狭い画面・動きを減らす設定で使える。製品色の全面変更は不要 |
| 公開パスでのローカル確認・各フロント担当 | 通常開発では会社が4321、製品の`demo/server.py`は`/demo/`・`/docs.html`など。公開prefixへ変換した会社・製品の組を確認する手順がない | `docs/site-deployment.md`と製品の`docs/web-deployment.md`から参照できる、両成果物を一時rootへ組み合わせた静的確認の手順を追加する | 紹介→デモ→文書→紹介と相談先アンカーを、公開前に確認できる |
| サイト間の接続テスト・landing-pageとschedula | 会社の`tests/site.test.ts`は製品リンクの文字列を検査し、製品の`tests/test_public_demo.py`は会社所有のルートを許容する。戻り先のアンカーや、会社から参照する教材IDの実在を両成果物で照合していない | 既存テストを基に、生成物の往復リンク・アンカー・アセットを検査する。両公開workflowの公開後検査にも静的参照先を加える | 片側だけのURL・アンカー変更で接続確認が失敗し、通常公開は相手repoの再公開を呼ばない |
| 経路の説明・schedula | `docs/web-deployment.md`は広い`products/schedula/*`の一括転送をしないと説明する一方、infraのFree構成にはそのパターンと関数によるOrigin選択がある | パターンと最終的な配信先の違いを説明し、Free/hardenedの両構成をinfraの実装に対応付ける | 紹介を会社へ、製品の静的配下を製品へ送る既存テストと説明が一致する |

着手は、公開パス定義と接続テストを合わせて整え、公開パスでの確認手順、製品側のブランド表示・基準の適用を進めます。経路の説明は同じ変更時に更新します。
共有デザインパッケージ、全サイト共通ヘッダー、リポジトリ統合、サブドメインへの移管は今回の必須変更に含めません。
アプリのブランド表示・会社へ戻る導線は、本番公開設計時の確認項目とし、今回の会社・公開デモの変更に組み込みません。

### 実施した検証と残る確認

- schedulaの公開静的ビルドに成功。`tests/test_public_demo.py`の静的生成・公開文書リンクの既存2テストが成功。
- infraの`node --test tests/routing.test.cjs`は6件成功。Node上の検証であり、CloudFront runtime・実際のOrigin・本番応答を保証しない。
- 会社5ページを一時コピーでビルドし、製品2ページと接続確認。同一サイト内の参照90件、アンカーまたは教材フラグメント17件が整合。教材IDは公開`lessons.json`と照合しており、ブラウザー上のJS実行を確認したものではない。継続するCIへの追加は上表の未対応項目。
- 本文書とREADMEのローカルMarkdownリンク11件、`git diff --check`が成功。Markdownは現在のBiome検査対象外のため、文書追加に新しい検査ツールを導入していない。
- AWSの設定変更、公開、APIへの本番計算リクエスト、実ブラウザーでの表示・操作確認は今回実施していない。新たな本番検証結果として扱わない。

### 実装の参照先

- landing-page: [紹介ページ](../src/pages/products/schedula.astro)、[共通レイアウト](../src/layouts/SiteLayout.astro)、[基本スタイル](../src/styles/global.css)、[サイトテスト](../tests/site.test.ts)、[公開workflow](../.github/workflows/deploy.yml)。
- schedula: [静的ビルド](https://github.com/the3-inc/schedula/blob/6b15efdc0e3c00ccfd6120a1acd8b87f671a1be5/web/build.py)、[デモHTML](https://github.com/the3-inc/schedula/blob/6b15efdc0e3c00ccfd6120a1acd8b87f671a1be5/demo/index.html)、[文書HTML](https://github.com/the3-inc/schedula/blob/6b15efdc0e3c00ccfd6120a1acd8b87f671a1be5/demo/guide.html)、[公開テスト](https://github.com/the3-inc/schedula/blob/6b15efdc0e3c00ccfd6120a1acd8b87f671a1be5/tests/test_public_demo.py)、[公開workflow](https://github.com/the3-inc/schedula/blob/main/.github/workflows/deploy-demo.yml)、[公開手順](https://github.com/the3-inc/schedula/blob/6b15efdc0e3c00ccfd6120a1acd8b87f671a1be5/docs/web-deployment.md)。
- infra: [経路定義](https://github.com/the3-inc/infra/blob/04e76064e62ff3a6c4b5d2800793f8814fa5ef5b/public-web/routing.tf)、[Origin選択・URL処理](https://github.com/the3-inc/infra/blob/04e76064e62ff3a6c4b5d2800793f8814fa5ef5b/public-web/schedula-directory.js)、[経路テスト](https://github.com/the3-inc/infra/blob/04e76064e62ff3a6c4b5d2800793f8814fa5ef5b/tests/routing.test.cjs)、[配信定義](https://github.com/the3-inc/infra/blob/main/public-web/company.tf)。

## 方針の参考資料

以下は判断の参考であり、他組織の設計をそのまま本プロジェクトの必須要件にするものではありません。2026-10-19に確認しました。

- [Micro Frontends](https://martinfowler.com/articles/micro-frontends.html): 独立公開の利点、共有UIとサイト間の結合テスト、分割に伴う負担。
- [GOV.UK: Navigate a service](https://design-system.service.gov.uk/patterns/navigate-a-service/): 組織全体のヘッダーとサービス固有ナビゲーションの分担。
- [Atlassian: Design tokens](https://atlassian.design/tokens/design-tokens/): 共通の視覚基準とテーマによる値の変更。
- [CloudFrontのキャッシュ動作](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html): パスパターンの優先順位と配信先の選択。
