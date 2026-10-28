# the3の共有デザイン基盤

色・フォント・基本操作・会社ロゴを共有します。ページ構成、製品ナビゲーション、表、フォーム、業務上の状態色は利用側が管理します。JavaScript・Tailwind・Astroへの実行時依存はありません。

## 読み込み

`tokens.css` → `base.css` → 利用側のCSSの順に読み込みます。CSSのレイヤー順は`the3-tokens, the3-base`です。Tailwindを使う場合は、そのimportより先にこの順を宣言してから共有CSSをimportし、利用側の`@theme inline`で既存の色名を`--the3-*`へ接続します。

```css
@layer the3-tokens, theme, base, the3-base, components, utilities;
@import "tailwindcss";
@import "@the3/brand/tokens.css";
@import "@the3/brand/base.css";
@theme inline {
  --color-paper: var(--the3-background);
  --color-ink: var(--the3-text);
  --font-sans: var(--the3-font-sans);
}
```

通常のHTMLでは、展開したファイルを自サイトから`link rel="stylesheet"`で配信します。`base.css`はbody、フォーム等のフォーカス、`.the3-skip-link`、動きを減らす設定に適用されます。本文スキップ先には`id="main"`を設けてください。

`html`の`data-theme="light"`でライト、`data-theme="dark"`でダーク、属性を省略するとシステム設定に追従します。テーマ操作用JavaScriptは含みません。フォーム・表を含む全画面で確認するまで、製品側はライト固定にしてください。

共有変数は`--the3-brand`、`--the3-on-brand`、`--the3-text`、`--the3-background`、`--the3-muted`、`--the3-border`、`--the3-surface`、`--the3-font-sans`、`--the3-line-height`、`--the3-space-sm/md/lg`、`--the3-radius`、`--the3-border-width`、`--the3-focus-color`、`--the3-focus-width/offset`、`--the3-artwork-filter`です。製品独自のアクセントや状態色は別の変数として定義します。既定値の上書きは利用側CSSで行いますが、フォーカスを消さないでください。

## 取得・更新

正本は`the3-inc/landing-page`の`packages/brand/`です。タグは`design-vMAJOR.MINOR.PATCH`、配布物はGitHub Releaseの`the3-brand-VERSION.tgz`、`SHA256SUMS`、`release.json`です。`release.json`に元コミット、未コミット変更の有無、各ファイルのSHA-256を記録します。同じ版を差し替えず、新しい版を発行します。

```sh
gh release download design-v1.0.0 --repo the3-inc/landing-page --dir /tmp/the3-design-1.0.0
cd /tmp/the3-design-1.0.0
shasum -a 256 -c SHA256SUMS
```

取得には配布元への読み取り権限が必要です。Node.js利用側は確認済みのtgzをリポジトリへ保存し、`pnpm add ./vendor/the3-brand-1.0.0.tgz`で導入できます。通常のHTML/Python利用側は必要ファイルと`release.json`を固定保存します。通常のビルドや閲覧時には他リポジトリへ接続しません。更新PRで版・元コミット・checksum・表示差分を確認し、切り戻しは前版の固定ファイルへ戻します。

ローカルの`pnpm pack:design`は未コミットのパッケージからも検証用配布物を作れます。その場合`release.json`の`source_state`は`working-tree`となり、正式Releaseとは区別します。正式発行はmainのCI成功後に専用workflowで行います。

## ロゴと配布条件

会社ロゴの正本は`assets/the3-symbol.svg`です。縦横比を保ち、製品ロゴの代わりには使いません。ファビコン・会社表示などに使い、装飾画像は空のalt、会社へのリンクには会社名の読み上げを付けます。既存の会社公開URL用コピーはビルド時に正本から生成します。

公開パス・変数・テーマ指定の削除や互換性を壊す変更はmajor、追加はminor、互換修正はpatchを上げます。ライセンスは`UNLICENSED`です。npm registryへの公開は行いません。利用・再配布条件は`LICENSE`を確認してください。
