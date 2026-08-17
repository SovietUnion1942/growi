# Research & Design Decisions

## Summary
- **Feature**: `user-badges`
- **Discovery Scope**: Extension（既存の GROWI コアシステムへの機能追加。新規外部依存なし）
- **Key Findings**:
  - `apps/app/src/server/service/activity.ts` の `ActivityService` が `crowi.events.activity`(`'updated'`) を単一のファンアウト起点として、Contribution 集計・InAppNotification 生成の両方を駆動している。バッジ付与もこのイベントに独立したリスナーとして乗るのが最も既存パターンに忠実。
  - 単一ページ更新時、`PageEvent` は発火しない。`update-page.ts` は `shouldGenerateUpdate()` の条件を満たした場合のみ `activityEvent.emit('update', ...)` を発火する(5分間の同一ユーザー抑制ロジックあり)。これは自動付与のカウントにも自然に継承される抑制であり、バグではなく既存の意図된挙動として設計に明記する。
  - User モデルには既に `imageUrlCached` という「表示用に非正規化してキャッシュしたフィールド」の前例がある。バッジのアバター併記表示もこのパターンを踏襲することで、17 箇所以上ある `UserPicture` 呼び出し元それぞれに N+1 フェッチを追加せずに済む。
  - 既存の Contribution モデル(`ContributionGraphActions`)は `ACTION_PAGE_CREATE/UPDATE/DUPLICATE/REVERT` に加え `ACTION_COMMENT_CREATE` も含む。要件 2.6(自動付与はページ作成・更新のみに限定しコメント等を含めない)と直接衝突するため、Contribution モデルの再利用は不採用とした(詳細は Decision 参照)。

## Research Log

### Mongoose vs Prisma for new models
- **Context**: GROWI は Mongoose から Prisma への移行を段階的に進めている。新規モデルをどちらで書くべきか確認が必要だった。
- **Sources Consulted**: `apps/app/src/features/contribution-graph/server/models/contribution-model.ts`(2026-04-13 追加、直近の新規小規模モデル)、`.claude/skills/mongoose-to-prisma/SKILL.md`
- **Findings**: 直近の新規モデルは素の Mongoose(`getOrCreateModel` パターン)で書かれている。Prisma への移行は「まず Mongoose で作り、後で専用スキルを使って移行する」という意図的な二段階の規約になっている。
- **Implications**: `BadgeType`/`UserBadge` は `getOrCreateModel<Doc, Model>()` パターンの素の Mongoose モデルとして実装する。Prisma への移行は将来の別作業とする。

### PageEvent と単一ページ更新の関係
- **Context**: 自動付与のトリガーをどこに置くか(`PageEvent` か `Activity` ログか)を判断するため。
- **Sources Consulted**: `apps/app/src/server/routes/apiv3/page/update-page.ts`、`apps/app/src/server/service/activity/update-activity-logic.ts`
- **Findings**: 単一ページ更新時に `pageEvent` の emit は一切ない。実際に発火するのは `activityEvent.emit('update', ...)` のみで、`shouldGenerateUpdate()` により同一ユーザーの5分以内の連続保存は抑制される。
- **Implications**: バッジの自動評価トリガーは `crowi.events.activity` の `'updated'` イベントに乗せる。ページ作成(`ACTION_PAGE_CREATE`)・更新(`ACTION_PAGE_UPDATE`)のみを対象アクションとしてフィルタする。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Contribution モデル再利用 | 既存の日次カウンタ(`Contribution.count`)を合算して累積貢献数とする | 実装コストが最小、既にリアルタイムで加算されている | `ContributionGraphActions` にコメント投稿等も含まれ、要件 2.6(ページ作成・更新のみ)と一致しない。将来 contribution-graph 側の集計範囲が変わるとバッジのカウントも意図せず変化する隠れた結合が生じる | 不採用 |
| Activity/Prisma への直接カウントクエリ | `prisma.activities.count({ where: { userId, action: { in: [...] } } })` で必要なアクションのみ集計 | 対象アクションを明示的に制御でき、要件 2.6 を正確に満たす。contribution-graph の将来変更から独立 | 新規の小さな集計関数を1つ書く必要がある | 採用 |
| `ActivityService` 内にリスナーを追加 | `activity.ts` の `initActivityEventListeners` 内に badge 評価呼び出しを追記 | 既存のフックに相乗り | 既存コアファイルへの変更が必要になり、バッジ機能と無関係な既存リスナーとの結合が生まれる(責務境界があいまいになる) | 不採用 |
| `BadgeGrantService` が独自に `crowi.events.activity` を購読 | `InAppNotificationService` と同様、コンストラクタで自身のリスナーを登録 | `activity.ts` を変更せずに済む。責務境界が明確(EventEmitter は複数リスナーを許容) | 特になし | 採用 |

## Design Decisions

### Decision: 累積貢献数のカウント方式
- **Context**: 要件 2.1〜2.6 は「ページ作成・更新のみ」を対象とした累積カウントとしきい値到達判定を要求する
- **Alternatives Considered**:
  1. 既存 Contribution モデルの `count` を合算 — 対象アクション範囲が要件と一致しない
  2. Activity(Prisma)への直接カウントクエリ — 対象アクションを正確に絞れる
- **Selected Approach**: `prisma.activities.count({ where: { userId, action: { in: [ACTION_PAGE_CREATE, ACTION_PAGE_UPDATE] } } })` による直接カウント
- **Rationale**: 要件 2.6 の除外条件を正確に満たし、contribution-graph 機能の将来的な集計範囲変更から独立させられる
- **Trade-offs**: Contribution モデルのようにあらかじめ日次集計されたキャッシュを使わない分、都度カウントクエリが走る。ただし `userId + action` にインデックスがあれば軽量
- **Follow-up**: `activities` コレクションの `userId + action` 複合インデックス有無を実装時に確認する

### Decision: バッジのアバター併記表示にキャッシュフィールドを導入
- **Context**: `UserPicture` は 17 箇所以上で使われており、各箇所が個別にバッジ情報をフェッチすると N+1 が発生する
- **Alternatives Considered**:
  1. 各 `UserPicture` 呼び出し元でバッジを個別フェッチ — N+1、実装箇所が多く保守コストが高い
  2. User ドキュメントにバッジ要約を非正規化キャッシュする — 既存の `imageUrlCached` と同じパターン
- **Selected Approach**: `User.badgeSummaryCached`(バッジ系統ごとの最高レベルの `{iconKey, name, level}` 配列)を追加し、バッジ付与時に `BadgeGrantService` が更新する
- **Rationale**: `imageUrlCached` という既存の前例に忠実で、既存 17 箇所の呼び出し元がバッジ表示のために追加フェッチを実装する必要がなくなる
- **Trade-offs**: User ドキュメントの書き込み責務が1つ増える(本 spec がこのフィールドの唯一の書き込み者であることを Boundary Commitments で明示する)
- **Follow-up**: 系統数が多いユーザーが将来出た場合の表示上限は Open Questions を参照

### Decision: バッジ種類の削除はソフトデリート
- **Context**: 要件 1.5 は「削除後も既存付与バッジの記録は表示され続ける」ことを要求する
- **Alternatives Considered**:
  1. `BadgeType` ドキュメントの物理削除 — `UserBadge.badgeType` 参照が孤立し、既存付与バッジの名前・アイコンが解決できなくなる
  2. `isDeleted`/`deletedAt` によるソフトデリート
- **Selected Approach**: ソフトデリート。新規付与の選択肢からは除外されるが、ドキュメント自体は保持する
- **Rationale**: 要件 1.5 を素直に満たす唯一の方法
- **Trade-offs**: なし(標準的なパターン)

### Decision: アイコンは許可された表現方式に限定する(画像アップロード不可)
- **Context**: バッジ種類の「アイコン」入力をどう受け取るか。自由な画像アップロードは要件に含まれていない
- **Alternatives Considered**:
  1. 任意の画像ファイルをアップロード — ストレージ・XSS/検証コストが増え、要件にない機能拡張になる
  2. Material Symbols のアイコン名、または単一の絵文字文字列に限定
- **Selected Approach**: `iconKey` は許可リスト(Material Symbols アイコン名の正規表現、または単一絵文字)でのみ受理する
- **Rationale**: Simplification の原則に従い、要件にない「ファイルアップロード」機能を持ち込まない。GROWI の他の UI 要素(管理ナビゲーション等)も Material Symbols を使っており一貫する
- **Trade-offs**: バッジ種類ごとに完全にオリジナルな画像は使えない。将来必要になれば別途拡張する

### Decision: 手動バッジの剥奪は論理削除、一意インデックスは剥奪済みレコードを除外する部分インデックスに変更
- **Context**: 要件7は手動区分バッジの剥奪を求めるが、記録は監査目的で完全に消去してはならない(要件7.6)。既存の `(user, badgeType, level)` 一意複合インデックスをそのまま維持すると、剥奪後に同一バッジを再付与しようとした際、剥奪済みレコードとの重複キーエラー(`E11000`)で再付与がブロックされてしまう
- **Alternatives Considered**:
  1. 剥奪時に既存レコードを削除せず `revokedAt`/`revokedBy` のみ設定し、一意インデックスはそのまま維持 — 再付与時に `E11000` で失敗し、要件が求めていない「再付与不可」という副作用を生む
  2. 剥奪時に対象レコードを物理削除 — 要件7.6(物理削除しない)に反する
  3. 剥奪済みレコードを保持しつつ、一意インデックスを `partialFilterExpression: { revokedAt: null }` の部分インデックスに変更する
- **Selected Approach**: 3. 部分一意インデックスを採用。剥奪済みレコードはインデックスの対象外となるため、再付与時は新しい `UserBadge` ドキュメントが作成され、剥奪前のレコードは監査記録としてそのまま残る
- **Rationale**: MongoDB の部分インデックスは標準機能であり、追加のアプリケーション層ロジック(削除してから再作成、等)を必要としない。「有効な付与は高々1件」という不変条件と「剥奪記録は消さない」という要件を両立できる
- **Trade-offs**: 同一 `(user, badgeType, level)` について複数の `UserBadge` ドキュメントが将来的に共存しうる(1件が有効、他は剥奪済み)。一覧取得時は `revokedAt` で有効/剥奪済みを判別する必要がある(`GrantedManualBadgeList` はこれを前提に設計する)
- **Follow-up**: なし。手動区分は `level: null` の単一バッジのため、実運用で同一ユーザーへの再剥奪→再付与が繰り返される頻度は低いと想定

## Risks & Mitigations
- 自動付与のリアルタイム評価とバッジ種類のしきい値変更後の再評価(resweep)が同時に走ると、`UserBadge` への重複書き込みが発生しうる — `(user, badgeType, level)` の一意複合インデックスで重複を防ぎ、重複キーエラーは無視して冪等に扱う
- 自動付与パス(リクエストコンテキストなし)から Activity レコードを作成する具体的な内部関数(`Activity.createByParameters` 等)は実装時に確認が必要 — Open Question として残す
- resweep を fire-and-forget で実行するため、対象ユーザー数が多い場合に処理が長時間バックグラウンドで走る可能性がある — v1 では許容し、必要であれば専用の `CronService` ベースのバッチに切り出す余地を残す

## References
- `apps/app/src/features/contribution-graph/` — 集計・表示パターンの直接的なリファレンス実装
- `apps/app/src/client/components/Admin/UserGroup/` — 管理画面 CRUD の直接的なリファレンス実装
- `apps/app/.claude/rules/activity-recording.md` — Activity 記録の既存規約
