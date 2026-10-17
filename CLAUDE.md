# Todo（やること）

共通ルールの正本は `hoshi2/bob-bridge`。作業前に `../bob-bridge/AGENTS.md` を読み、その順番で `rules/` と `context/projects.md` を読む。

- この repo は **Public**。鍵・やることの中身・個人情報を commit しない
- 1枚の `index.html`。依存ライブラリなし・ビルド不要のまま保つ
- 色・字体は ぼぶる（`hoshi2/bobru`）の `:root` と同じ。変えるときは両方そろえる
- 同期の仕組み（`mergeDB`、`_m`、`deleted` の墓標、Firestore collection `todo`）は README の「データの扱い」が仕様。変えるときは `tests/run.mjs` も直す
- 編集は原則 Mac。Issue は bob-bridge
