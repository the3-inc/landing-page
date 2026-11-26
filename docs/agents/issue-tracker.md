# Issue tracker

Issue の登録先は `the3-inc/landing-page`。CLI 操作では `--repo the3-inc/landing-page` を指定する。

## 操作

以下の `<repo>` には上記のルールで決めた登録先を指定する。

- 作成：`gh issue create --repo <repo> --title "..." --body-file <file>`
- 読み取り：`gh issue view <number> --repo <repo> --json number,title,body,labels,comments,assignees`
- 一覧：`gh issue list --repo <repo> --state open`。必要に応じて状態やラベルで絞る。
- コメント：`gh issue comment <number> --repo <repo> --body-file <file>`
- ラベル：`gh issue edit <number> --repo <repo> --add-label "<label>"` または `--remove-label`
- 終了：理由をコメントしてから `gh issue close <number> --repo <repo>`。

「issue tracker に publish」は上記の手順で Issue を作成すること、「関連チケットを fetch」は対象 Issue とコメントの読み取りを指す。

## PR の扱い

**PRs as a request surface: no.**

## Wayfinder

- 地図は `wayfinder:map` を付けた Issue に、子チケットは GitHub の sub-issue にする。sub-issue を利用できない場合は、地図のチェックリストから子 Issue を参照する。
- 子 Issue の依存関係は GitHub の Issue dependencies で記録する。利用できない場合は子の本文冒頭に `Blocked by: #<number>` と記す。
- 子には作業種別に対応する `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling`、`wayfinder:task` のラベルを付ける。
- 未完了の依存先も担当者もいない項目を地図の順に選び、`gh issue edit <number> --repo <repo> --add-assignee @me` で担当する。解決時は結果をコメントして閉じ、地図の決定事項から参照する。
