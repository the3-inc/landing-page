# デザイン素材

- トップページの理念説明: `public/images/value-growth.png`（2029 × 775、背景透過PNG）。価値を加える2つの「＋」と階段状に続く線。2026-10-20のリニューアルで冒頭から「一つの価値が、次の価値へ。」の説明の下へ移動。文章と重ねず、全体を切らずに表示する。
- 単独ロゴ: `public/brand/the3-symbol.png`（1254 × 1254、背景透過PNG）。直近のデザイン2案の3本の曲線を単独化。ページ上の `the3.` の文字とは別の素材。
- ベクターロゴ: 正本は `packages/brand/assets/the3-symbol.svg`、`public/brand/the3-symbol.svg`は起動・ビルド時に生成する互換コピー（viewBox 1254 × 1254）。上記PNGの輪郭をトレースした、3色・5パスのSVG。画像の埋め込みはなく、拡大・色の編集に対応。全ページのヘッダー・フッター・ファビコンと、会社案内の見出しに使用。

2026-10-19、組み込みの ImageGen で生成。PNGはベクターデータではありません。

SVGはVTracerで曲線に変換し、深緑 `#173f35`・セージ `#88ac91`・黄土 `#c8ab4d` の単色に整理しました。PNGの微細な色むらやグラデーション、透過縁の粒子は残していません。変換ツールは一時フォルダでのみ使用し、サイトの依存関係には追加していません。

## 単独ロゴの生成指示

参照画像: 採用したデザイン2案（`exec-4314bd64-c19f-42cb-96b5-2bc9e7e98785.png`）。`transparent_background: true`。

```text
Use case: logo-brand, background-extraction. Asset type: final standalone company symbol on genuine alpha transparency. Input image 1 is the APPROVED shape reference: the large three-curved-stroke emblem on the right side of the website mockup. Extract and refine ONLY this emblem into a clean standalone logo. Preserve its exact distinctive asymmetric silhouette, tapering, curve directions, stroke meeting points, and large open triangular negative-space center: dark forest green upper curved stroke arching from upper right down left then sweeping to center-right; sage green lower-left curve rises to meet it and sweeps along the bottom; muted warm ochre curve joins at the right and extends into a tapering lower-right tip. Three strokes, three open ends; no additional loops or branches. Match the reference colors forest #173f35, sage #88ac91, ochre #c8ab4d as closely as possible. This symbol embodies the3's company philosophy: different contributions connect and create socially valuable things. Do NOT redesign into a generic Celtic knot, triquetra, recycling symbol, infinity loop or numeric 3. Remove ALL website content, lettering, headlines, navigation, background, captions and shadow. No wordmark or text. Clean smooth opaque flat-color fills, carefully antialiased edges, no grain, no green fringe, no watercolor, no gradients, no texture, no bevel, no 3D. Preserve a true transparent alpha background, do not simulate transparency with a checkerboard. Output one centered logo symbol on a square 1536x1536 transparent canvas with approximately 10% clear margin; keep full shape including tips visible, preserve aspect ratio and do not crop. This is a production asset, not a website screenshot, mockup, logo presentation sheet, variants board, or promotional image.
```

生成結果の実寸は1254 × 1254です。透過チャンネルに透明・不透明の両方があることを検証済みです。
