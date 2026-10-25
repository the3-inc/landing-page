# the3 共通CSSライブラリ

会社サイトと各製品リポジトリのLP・デモ・技術案内で共有する、グローバルCSSの正本です。
Astro・Tailwind・Reactなどに依存せず、`packages/brand-preset/`から`@the3/brand-preset`として配布します。
デモ用の素材やページテンプレートではありません。

## 読み込み

```css
@import "@the3/brand-preset/base.css";
```

プレーンHTMLは、展開した`base.css`と`tokens.css`を同じディレクトリに置き、全ページから読み込みます。
製品固有CSSはその後に読み込みます。LP用CSSをデモや技術案内から読み込む必要はありません。

```html
<link rel="stylesheet" href="/brand-preset/base.css" />
<link rel="stylesheet" href="/styles/global.css" />
```

TailwindではPreflightの後に`base.css`を`layer(base)`へimportします。
値だけが必要な既存画面では`tokens.css`のみを使えますが、会社・製品のWebページは`base.css`を共通の入口にします。

## 共通にするもの

- `--the3-*`: 色、本文書体、余白、角丸、ライト・ダークテーマ。
- グローバルな既定: 本文、box-sizing、見出しの書体・行間、リンク、フォーム、選択色、フォーカス、動きを減らす設定。
- `the3-button`と`the3-button-compact`: 主要操作。後者は前者と併用する、操作画面向けの44px以上のボタン。
- `the3-container`、`the3-site-header`、`the3-skip-link`: ページの幅、ヘッダーの配置・配色、本文への移動。
- `the3-page-shell`、`the3-page-heading`、`the3-page-kicker`、`the3-page-title`、`the3-page-lead`: ページの余白と見出し。
- `the3-page-section`、`the3-section-title`、`the3-section-body`、`the3-text-link`、`the3-details-list`、`the3-page-cta`: 区切り線、本文と導線の基本スタイル。

共通クラスは`the3-`で始め、製品の既存クラスとの衝突を抑えます。
会社サイトもこの実装を使います。値や基本スタイルを各サイトで再定義せず、製品固有の構成・図解・画面密度・状態色だけを製品側に残します。
会社ロゴ・製品名・メニュー内容・機能・認証・計測・テーマ切り替えUIは含みません。

既定はOSのテーマへ追従します。`html[data-theme="light"]` / `"dark"`で固定できますが、
通常の会社・製品間の遷移では同じテーマ方針を使います。独自の背景やテーマ固定でページ全体の見た目を変えないでください。
注意・エラー・役割など、意味を持つ色は各製品で文字色と背景色を組にし、両テーマで確認します。

## 配布と更新

GitHub Releasesの`brand-preset-vX.Y.Z`から`.tgz`と`SHA256SUMS`を配布し、各製品は版とSHA-256を固定して取り込みます。
製品側の保管場所は`web/vendor/brand-preset/`など、全Webページから共有できる場所にします。
`demo/`の下へ置いたり、ページごとに複製したり、稼働中の会社サイトから最新CSSを取得したりしません。
`private: true`はnpmレジストリへの誤公開を防ぐ設定で、アーカイブ配布には影響しません。

[導入・更新・切り戻し手順](https://github.com/the3-inc/landing-page/blob/main/docs/brand-preset-distribution.md)を参照してください。
0.2.0はグローバルなフォームの既定と共通クラスを追加するため、既存製品は取り込み後に両テーマと操作画面を確認してください。
