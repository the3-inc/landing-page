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
- 子 Issue の登録：`gh issue create --repo <repo> --parent <parent> ...` で作成する。作成済みの子は `gh issue edit <parent> --repo <repo> --add-sub-issue <child>` で関連付ける。sub-issue が使えない場合は子の本文に `Part of #<parent>` を記す。
- 依存関係：`gh issue edit <child> --repo <repo> --add-blocked-by <blocker>` で登録する。GitHub の依存関係が使えない場合は子の本文に `Blocked by: #<blocker>` を記す。

「issue tracker に publish」は上記の手順で Issue を作成すること、「関連チケットを fetch」は対象 Issue とコメントの読み取りを指す。

## PR の扱い

**PRs as a request surface: no.**

## Wayfinding operations

- 起票前に `gh label list --repo <repo> --search wayfinder:` で地図の `wayfinder:map` と、使用する種別の `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling`、`wayfinder:task` のラベルを確認する。必要なラベルがない場合は、ラベル設定が済んでから起票する。
- 地図は1件の Issue とし、子は「操作」の子 Issue 登録と依存関係の手順で関連付ける。sub-issue が使えない場合は地図にも子 Issue のチェックリストを書く。
- `gh api --paginate 'repos/<repo>/issues/<map>/sub_issues'` で地図の子を取得する。チェックリストを使った場合はその参照をたどる。各子の状態と担当者を確認し、ブロッカーの未完了件数は `gh api repos/<repo>/issues/<child> --jq .issue_dependencies_summary.blocked_by` で確認する。本文で管理する場合は `Blocked by:` が指す Issue を確認する。
- 地図の順で、開いていてブロッカーが残っておらず、担当者がいない子を選ぶ。`gh issue edit <child> --repo <repo> --add-assignee @me` で担当し、解決時は結果をコメントして閉じ、地図の決定事項から参照する。
