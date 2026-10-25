# the3 共通デザインプリセット

会社と製品で共有する色・本文書体・余白・テーマ・フォーカス表示・主要ボタンの正本です。
Astro・Tailwind・Reactなどに依存しないCSSを、このリポジトリのGitHub Releasesから配布します。

- 管理場所: `the3-inc/landing-page` の `packages/brand-preset/`
- パッケージ名: `@the3/brand-preset`
- バージョン: `package.json` の `version`
- 配布タグ: `brand-preset-v0.1.0` の形式
- 配布物: `the3-brand-preset-0.1.0.tgz` と `SHA256SUMS`
- 会社サイト: 同じリポジトリの `base.css` を直接import
- 製品: 配布版とSHA-256を固定し、自身の成果物へ取り込む

[配布・新製品への導入・更新・切り戻し手順](https://github.com/the3-inc/landing-page/blob/brand-preset-v0.1.0/docs/brand-preset-distribution.md)を参照してください。
`private: true` はnpmレジストリへの誤公開を防ぐ設定です。GitHub Releaseのアーカイブ配布・インストールには影響しません。

## CSSの入口

```css
/* 本文の既定、テーマ、フォーカス、主要ボタンを利用 */
@import "@the3/brand-preset/base.css";

/* 既存の画面構成を保ち、値だけを利用する場合はこちら */
/* @import "@the3/brand-preset/tokens.css"; */
```

パッケージ名の解決はビルドツールが担当します。プレーンHTMLでは展開した2つのCSSを同じディレクトリに置き、
`base.css` を `link` 要素で読み込みます。Node.jsを使わない製品向けの取得・検証ツールも配布元に用意しています。

`base.css` は本文の色・背景・書体・marginの既定、選択色、フォーカス、スクロール設定を持ちます。
ボタンは `class="the3-button"` で利用します。ヘッダーやページレイアウト、本文の文字サイズ、機能、認証、計測、公開処理は含みません。

既定はOSのテーマへ追従します。固定する場合は `html` の `data-theme="light"` / `"dark"` を使います。
テーマ切り替えUIや保存処理は各製品が担当します。アクセントを上書きする場合は、各テーマの `--the3-accent` と
`--the3-on-accent` を組にして設定し、文字・ボタン・フォーカスのコントラストを確認してください。

会社のヘッダー・会社ロゴの扱いは会社サイト、製品の機能・図解・メニュー・画面密度は製品側で管理します。
会社ロゴの正本と使用方針は、このリポジトリの `docs/brand-assets.md` にあります。
稼働中の会社サイトの「最新CSS」へ依存せず、テンプレートを再コピーして更新する運用にも戻しません。
