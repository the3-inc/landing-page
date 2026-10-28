# the3の共有デザイン基盤

色・フォント・基本操作・会社ロゴを共有します。ページ構成、製品ナビゲーション、表、フォーム、業務上の状態色は利用側が管理します。JavaScript・Tailwind・Astroへの実行時依存はありません。

## 読み込み

`base.css`は`tokens.css`を相対importします。通常のHTMLでは`base.css`を自サイトから配信し、両CSSを同じディレクトリへ置きます。Tailwindでは`@import "@the3/brand/base.css" layer(base);`として利用し、既存のテーマ名を共有変数へ対応付けます。

```css
@import "tailwindcss";
@import "@the3/brand/base.css" layer(base);
@theme {
  --color-forest: var(--the3-accent);
  --color-ink: var(--the3-ink);
  --font-sans: var(--the3-font-sans);
}
```

`--the3-accent/on-accent/ink/paper/muted/line/surface`、`--the3-font-sans`、`--the3-space-sm/md/lg`、`--the3-radius`、`--the3-artwork-filter`と既存の`.the3-*`クラスは旧`@the3/brand-preset` v0.2.0から維持します。`--the3-brand/on-brand/text/background/border`は同じ値を意味名で参照する別名です。正確な名前は`tokens.css`を参照してください。既存のフォーム・ページ配置の共有クラスも互換性のため含めます。新しい画面機能は追加しません。

`html`の`data-theme="light"`でライト、`data-theme="dark"`でダーク、属性を省略するとシステム設定に追従します。テーマ操作用JavaScriptは含みません。`.the3-skip-link`のリンク先に`id="main"`を設けてください。フォーカスと動きを減らす設定も共有します。製品の画面密度・業務状態色は製品側で管理します。

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
