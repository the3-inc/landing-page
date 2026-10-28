# 旧共通プリセットの配布と製品への導入

この文書は`brand-preset-v0.2.0`以前の互換手順です。現在の正本・新規導入・発行は[共有デザインパッケージ](design-package.md)を参照してください。旧Releaseと旧アーカイブ用インストーラーは維持します。

会社サイト・製品LP・デモ・技術案内で同じデザイン言語を使うための、グローバルCSSライブラリの配布手順です。
管理・配布元はこの `the3-inc/landing-page` リポジトリです。別のリポジトリやnpmレジストリは新設しません。

## 管理と配布の単位

`packages/brand-preset/package.json` のバージョンと `brand-preset-vX.Y.Z` タグを対応させ、GitHub Releasesへ
`.tgz` と `SHA256SUMS` を公開します。会社サイトの `v*` タグとは別で、プリセットの公開で会社サイトは公開されません。
通常の製品ビルドは、利用側で固定・保存したCSSだけを使います。配布元への通信やGitHubの認証をビルドに追加しません。

色、本文書体、テーマ、余白、フォーム、フォーカス、ボタン、リンク、ヘッダーの基本配置、ページの見出し・区切り線はプリセットで管理します。
製品名、図解、画面密度、ナビゲーション、業務機能と公開処理は各製品で管理します。
会社サイトの `global.css` 全体や `SiteLayout.astro` を他製品へコピーしないでください。

## 新製品へ導入する

Pythonだけで構築する製品・通常のHTMLでも同じ配布物を利用できます。以下は `0.2.0` を取り込む例です。Releaseに掲載された版とSHA-256を確認してから実行してください。
GitHub CLIの認証は取得時だけ必要になる場合があります。公開リポジトリのRelease URLから直接取得することも可能です。

配布元のcheckoutがなければ、まず取得します。既存checkoutがある場合はそちらを使えます。

```sh
gh repo clone the3-inc/landing-page /tmp/the3-design-source -- --branch brand-preset-v0.2.0 --depth 1
```

未使用のディレクトリへ配布物を取得します。`latest` や固定しないブランチは使いません。

```sh
mkdir /tmp/the3-brand-0.2.0
gh release download brand-preset-v0.2.0 --repo the3-inc/landing-page \
  --pattern the3-brand-preset-0.2.0.tgz --pattern SHA256SUMS \
  --dir /tmp/the3-brand-0.2.0
```

製品のcheckoutで次を実行します。`--destination` は製品が管理する静的素材の場所へ置き換えます。
Pythonの標準ライブラリだけで実行できるため、製品にNode.jsや追加のPython依存を導入する必要はありません。

```sh
preset_sha256=$(cut -d ' ' -f 1 /tmp/the3-brand-0.2.0/SHA256SUMS)
python3 /tmp/the3-design-source/scripts/install_brand_preset.py \
  /tmp/the3-brand-0.2.0/the3-brand-preset-0.2.0.tgz \
  --sha256 "$preset_sha256" --destination web/vendor/brand-preset
```

このツールはアーカイブのSHA-256、ファイル一覧、パッケージ名とバージョンを検査してから書き込みます。
固定情報は `preset.lock.json` に保存します。版、配布タグ、アーカイブのSHA-256、各ファイルのSHA-256を含みます。
既存の独自ファイルや手編集されたプリセットは上書きしません。正常な更新と切り戻しはディレクトリ単位で入れ替えます。

**展開された4ファイルと `preset.lock.json` を製品のGitへコミットします。**
取得作業を通常のCI・Dockerビルドへ追加しないでください。固定情報とCSSを同じ変更としてレビューします。

**最初のコミット前に、製品の `.gitattributes` へ次を追加してください。**
取り込み先を変更した場合はパスも合わせます。Gitの改行変換でCSSやREADMEが書き換わるとSHA-256が一致しなくなるため、
このディレクトリは配布時のバイト列を保持します。`core.autocrlf=true` の環境でも同じ固定情報を利用できます。

```gitattributes
web/vendor/brand-preset/** -text
```

HTMLから使う場合は、2つのCSSの相対位置を維持して配信します。

```html
<html lang="ja">
  <head>
    <link rel="stylesheet" href="/brand-preset/base.css" />
    <link rel="stylesheet" href="/styles/global.css" />
  </head>
  <body>
    <a href="/contact/" class="the3-button">導入を相談する</a>
  </body>
</html>
```

会社サイトと同じOSテーマへ追従するため、通常は `data-theme` を省略します。固定テーマが必要な画面では理由と適用範囲を明示し、遷移時の連続性を確認します。
既存の製品CSSの配色を共通値へ接続する場合は、値の再記述ではなく `var(--the3-accent)`、`var(--the3-ink)`、
`var(--the3-paper)`、`var(--the3-font-sans)` などを参照します。注意・エラー等の意味を持つ色までアクセントへ統一しません。

ビルド時にCSSをまとめる製品は、出力に必要なCSSを含め、`@import` の参照先が実在することを確認します。
取り込んだファイルのSHA-256を固定情報と照合し、不一致ならビルドを失敗させます。
HTMLの言語・viewport、本文へ移動するリンク、会社・製品紹介・相談へ戻る導線も各製品で用意します。

## 配布元リポジトリの会社サイトでの利用

会社サイトも公開済みの0.2.0を利用します。`package.json`の`@the3/brand-preset`に
`https://github.com/the3-inc/landing-page/releases/download/brand-preset-v0.2.0/the3-brand-preset-0.2.0.tgz`を指定し、
`pnpm-lock.yaml`のintegrityで配布物を固定します。`src/styles/global.css`はパッケージの`base.css`を`layer(base)`へimportします。
`packages/brand-preset/`は配布元のソースで、会社サイトからの直接参照や利用側へのCSSコピーには使いません。
会社のヘッダー・フッターも共通の配置クラスを使い、製品固有ではない基本スタイルを重ねて定義しません。
重複するCSS、後から常に上書きされる宣言、参照されなくなったセレクターは積極的に削除します。
共通スタイルは共通クラスを使い、ページ固有の差分だけを残します。削除時は動的に生成される要素も照合し、両テーマ・画面幅・操作の表示を確認します。

配布元ソースの更新と会社サイトの採用は分け、新しいReleaseの公開後に依存URLとlockfileを更新します。
会社・製品とも同じ版を採用し、両テーマと狭い画面を確認します。通常の会社ビルドへ独自の取得scriptは追加しません。

## 製品リポジトリでの配置

```text
web/
  vendor/brand-preset/   # 配布版のCSSと固定情報。全Webページで一つだけ保持
  styles/global.css     # 製品の名前・メニュー・共通構成。共通値を参照
  styles/landing.css    # 製品LPだけの構成（必要な場合）
demo/
  style.css             # 操作パネル・結果表などデモ固有の構成
```

LP・デモ・技術案内はそれぞれプリセットと製品の`global.css`を直接読み込みます。
デモがLPのCSS全体へ依存したり、製品ごとに別のボタン・背景・書体を定義したりしません。
`base.css`がグローバルCSSの入口で、既存の`tokens.css`も引き続き利用できます。

schedulaもこの配置を使います。通常のデモserverは`/brand-preset/base.css`と`/styles/global.css`を配信し、
公開ビルドはプリセットの整合を検査してから共通CSSを内容hash付きアセットへまとめ、デモと技術案内の両方から参照します。
会社側の製品紹介とローカル製品LPも同じライブラリ・OSテーマを使います。
配布元や隣のcheckoutがなくてもビルドでき、Pythonライブラリの利用者にデザイン依存を追加しません。

0.1.0を利用中の製品では、内容を手編集せず保管場所を移動し、`.gitattributes`、HTML、ローカルserver、公開ビルド、
ソース配布の対象、検査も同じ変更で更新します。その後、新しい配布版を通常の取り込み手順で採用します。
製品ではローカルで作った候補をそのまま採用せず、公開されたReleaseから配布物を取得し直して取り込みます。
配布物と`SHA256SUMS`、固定情報のSHA-256を照合してから製品のPRをマージします。

## 更新と切り戻し

1. 配布元で変更内容とバージョンを確認し、新しい版のアーカイブと `SHA256SUMS` を取得する。
2. 同じ取り込みツールを新しいアーカイブに対して実行する。手編集を検出した場合は、差分を製品固有CSSへ移してから再実行する。
3. 更新PRで `preset.lock.json` の版・SHA-256とCSSの差分を確認する。
4. 製品の検査・ビルド、狭い画面、対応テーマ、キーボード操作、会社・製品間の往復を確認して公開する。
5. 問題があれば取り込み変更をGitで戻し、再ビルド・再公開する。過去版を再取得して同じツールで戻すこともできる。

新しいプリセットの公開だけでは、既存製品や公開済みサイトは変わりません。旧版のReleaseは削除せず、同じ版への上書き公開もしません。
配布物が置換されても、利用側の固定済みSHA-256と一致しなければ採用されません。

## 新しい版を公開する

1. `packages/brand-preset/` のソースを変更し、`package.json` のバージョンを上げる。既存の変数名・入口を壊す変更はメジャー版、追加はマイナー版、修正はパッチ版を目安にする。
2. 通常のPRで会社サイトの検査、ビルド、プリセット取り込みテストを通し、mainへ取り込む。
3. **mainの対象commitのCI成功後**、一致する専用タグを作成してpushする。初回の例は以下。

```sh
git tag brand-preset-v0.2.0 <CIが成功したmainのcommit SHA>
git push origin brand-preset-v0.2.0
```

`.github/workflows/publish-brand-preset.yml` がmainへの包含、対象commitのmain CI成功、版とタグの一致を検査します。
`npm pack` でアーカイブを作り、実際の取り込みツールで検証した後、Releaseを公開します。
同名Releaseを上書きするオプションは使いません。公開途中で失敗した場合は既存Releaseとアセットを確認してから対応し、
公開済み内容が間違っていた場合は新しいパッチ版を作ります。
公開処理を再実行する場合はworkflow dispatchで既存の専用タグを指定できます。

公開後はReleaseから配布物を取得し直し、利用側で固定した値と一致することを確認してください。
会社サイトの公開workflow、製品の公開workflow、インフラの変更は、それぞれ独立して実施します。
