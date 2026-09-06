# Research & Design Decisions

## Summary
- **Feature**: `home-page-v3`
- **Discovery Scope**: Extension（v2 `home-page-widgets` の拡張。新ウィジェット3種＋ウィジェット設定＋見た目）
- **Key Findings**:
  - 個人別設定は既存の `UserUISettings`（1利用者1ドキュメント、SSRハイドレート済み）に構造化フィールドを1つ足すのが最も軽い。専用コレクションは不要。
  - 「パス配下の最近更新ページ（viewer 権限フィルタ済み・件数制限）」の単一メソッドは存在しない。v2 の `findWipPagesByUser` と同型で `page-listing` サービスに新規追加する。パス前方一致の正規表現は `escapeStringForMongoRegex`（`@growi/core/dist/utils`）でエスケープする（`RegExp.escape` は非ASCII空白で MongoDB PCRE2 が壊れる）。
  - 直近の通知・出欠未回答・部のイベントは、いずれも既存の仕組み（`useSWRxInAppNotifications`、`attendance-status` エンドポイント、イベントページ本文のパース）を再利用できる。フィードウィジェットはこれらを束ねる1つのウィジェットとする。
  - Classroom 連携そのものは外部エージェントが担い、同期先は `/Classroomの投稿一覧/お知らせ` 配下のハードコードパス。ウィジェットはその配下のページを読むだけ。取得元パスはウィジェット側の設定（既定＝その既知パス）とする。
  - 管理画面の設定は v2 の `customize:*` 4層パターン（`config-definition.ts` → `apiv3/customize-setting.js` → `AdminCustomizeContainer.js` → `CustomizeXSetting.tsx`）をそのまま踏襲。配列/オブジェクト型の設定キーは `defineConfig` で既にサポートされている。
  - `react-dnd` の `DragAndDropWrapper` はブックマーク専用の型に結合しており、並び替え永続化の参考実装はコメントアウト済み。7項目の並び替えには上下ボタンの方が明確・アクセシブルで軽い。

## Research Log

### 個人別 UI 設定の保存先
- **Context**: 要件6（個人別ウィジェット設定の永続化）。
- **Sources**: `apps/app/src/server/models/user-ui-settings.ts`、`apps/app/src/server/routes/apiv3/user-ui-settings.ts`、`apps/app/src/pages/basic-layout-page/get-server-side-props/user-ui-settings.ts`、`apps/app/src/client/services/user-ui-settings.ts`、比較対象 `apps/app/src/server/models/editor-settings.ts` + `stores/editor.tsx`。
- **Findings**:
  - `UserUISettings` は `user` unique ref の1ドキュメント。スカラー UI 設定（`currentSidebarContents` 等）を持ち、`aiChatSelectedModelKey` のように後から追加されている。
  - 更新は `PUT /_api/v3/user-ui-settings`（body `{ settings: Partial<IUserUISettings> }`）。ハンドラは `updateData` オブジェクトで許可フィールドをハードコードしているため、新フィールド追加は「スキーマ／インターフェース／バリデータ配列／ハンドラの許可リスト」の4箇所。
  - SSR ハイドレート済み: `getServerSideUserUISettingsProps` → prop `userUISettings` → `useHydrateBasicLayoutConfigurationAtoms`。`/home` ページも `getServerSideBasicLayoutProps` 経由でこれを受け取っている。
  - クライアント書き込み: `updateUserUISettings(partial)` / デバウンス版 `scheduleToPut(partial)`（1500ms、`{...bulk, ...settings}` の**浅い**マージ）。
  - `editor-settings` は専用コレクション＋`/personal-setting/editor-settings` ルート＋クライアント SWR（SSR なし）。データが大きい・独立クエリ・username キーのときのパターン。
- **Implications**: `UserUISettings` に構造化フィールド `homeWidgetPreferences` を1つ追加する。SSR ハイドレートに相乗りできるので初回描画時のレイアウトシフトが無い。浅いマージ制約のため、部分更新でもウィジェットマップ全体を送る。

### パス配下の最近更新ページ取得
- **Context**: 要件2（Classroom最新投稿ウィジェット）、要件3.5（ピン留めの権限フィルタ）。
- **Sources**: `apps/app/src/server/service/page-listing/page-listing.ts`（`findWipPagesByUser`、`findChildrenByParentPathOrIdAndViewer`）、`apps/app/src/server/models/page.ts`（`findRecentUpdatedPages(path, user, options)`）、`apps/app/src/server/routes/apiv3/pages/index.js`（`GET /pages/recent`）、`apps/app/src/server/service/attendance-reminder.ts`（前方一致正規表現の例）。
- **Findings**:
  - 「パス前方一致 ＋ 更新日時降順 ＋ viewer フィルタ ＋ 件数制限」の単一メソッドは無い。
  - `findWipPagesByUser` が最良のテンプレート: `new PageQueryBuilder(Page.find(cond))` → `await builder.addViewerCondition(viewer)` → `.select(...).lean()`。
  - `Page.findRecentUpdatedPages` は `path` 引数と viewer フィルタ・`sort:'updatedAt'` 降順・limit を既に持つが、常に `'/'` で呼ばれている。前方一致で流用できる可能性がある（`isRegExpEscapedFromPath` オプションあり）。
  - `attendance-reminder.ts` に前方一致＋エスケープの実例: `Page.find({ path: new RegExp('^' + escapeStringForMongoRegex(prefix)), isEmpty: { $ne: true } })`。
- **Implications**: `PageListingService.findRecentPagesUnderPath(pathPrefix, viewer, limit)` を `findWipPagesByUser` と同型で新規追加。パス resolve（複数パス→権限フィルタ済みメタ）は別メソッド `resolvePagesByPaths(paths, viewer)`。

### 直近の通知フィード
- **Context**: 要件4.2（自分宛の直近の通知）。
- **Sources**: `apps/app/src/stores/in-app-notification.ts`、`apps/app/src/server/routes/apiv3/in-app-notification.ts`。
- **Findings**: `useSWRxInAppNotifications(limit, offset?, status?)` → `GET /in-app-notification/list?limit=`。`loginRequiredStrictly`（利用者本人）。返り値 `PaginateResult<IInAppNotificationHasId>`、各 doc は `user / targetModel / target(populate) / action / status / actionUsers / createdAt / snapshot`。「最新N件だけ」の専用エンドポイントは無く `/list` に `limit` を渡す。
- **Implications**: フィードウィジェットの通知セクションはこのフックをそのまま利用（新規バックエンド不要）。

### 部のイベントのパース
- **Context**: 要件4.1（部の今後のイベント）。
- **Sources**: `apps/app/src/server/service/attendance-reminder.ts`（`parseEvents`、`EVENTS_PAGE_PATH`、`fetchUpcomingEvents`）、`apps/app/src/features/page-markdown/`（`.md` エンドポイント）、`apps/app/src/features/page-markdown/utils/page-markdown-url.ts`。
- **Findings**:
  - `parseEvents(body: string): { date: string; title: string }[]` は純粋な文字列パース（mongoose 依存なし）だがモジュールローカル const で未エクスポート。`EVENTS_PAGE_PATH = '/イベント/決定済みイベント保管場所'` も未エクスポート const。
  - 生 markdown 取得エンドポイントが存在: `GET /{pagePath}.md`（catch-all、`/_api/v3` ではない）。viewer 認可は通常のページ表示と同じ（ゲスト可）。`toPathMdUrl(pagePathUrl)` でURL生成。返り値本文の末尾にナビゲーションフッターが付くが、日付行のみをマッチするパーサは影響を受けない。
- **Implications**: `parseEvents` とイベントページパス const をクライアントセーフな共有ユーティリティに切り出す。ウィジェットは `.md` エンドポイントでイベントページ本文を取得し、クライアント側でパース＋今後N日/N件にフィルタ。新規サーバーエンドポイント不要。

### 出欠未回答の判定
- **Context**: 要件4.3。
- **Sources**: `apps/app/src/server/routes/apiv3/personal-setting/attendance-status.ts`、`apps/app/src/stores/attendance-status.ts`。
- **Findings**: `GET /_api/v3/personal-setting/attendance-status` → `{ answered: boolean }`（`loginRequiredStrictly`）。回答先パスは `stores/attendance-status.ts` のクライアント const `ATTENDANCE_PAGE_PATH = '/出欠確認投票ページ'`。
- **Implications**: フィードウィジェットの出欠セクションは `answered` を読み、false なら回答先へのリンクを表示。既存の `AttendanceReminderModal`（`BasicLayout` 直下）とは独立に共存する。

### 管理画面の設定追加（構造化値）
- **Context**: 要件3.1-3.2、要件5。
- **Sources**: v2 の追加分（`CustomizeHomeNoticeSetting.tsx`、`AdminCustomizeContainer.js`、`customize-setting.js` の `PUT /customize-home-notice`、`config-definition.ts`）、既存の配列型設定（`markdown:xss:tagWhitelist` `defineConfig<string[]>`、`ai:allowedModels` `defineConfig<AllowedModel[]>`）。
- **Findings**: `Customize.jsx` は `<CustomizeXSetting />` を並べるだけ。`AdminCustomizeContainer` は unstated-next で `currentX` state＋手書きの `changeX`/`updateX` ペア。設定キーは `customize:*` 許可リスト配列に登録＋`defineConfig` エントリ。オブジェクト/配列型は `defineConfig<T>({ defaultValue })` でそのままサポート。
- **Implications**: 新規キー3つ（`customize:homeWidgets` オブジェクト、`customize:homePinnedPages` 配列、`customize:homeClassroomPathPrefix` 文字列）を同じコンテナに追加。新規 `CustomizeHomeWidgetsSetting.tsx`（並び替え＋表示トグル＋展開式の個別オプション）＋新規 `PUT /customize-setting/home-widgets`（3キーをまとめて更新、監査アクティビティ発火）。専用管理ページは不要。

### 並び替え UI
- **Context**: 要件5.1（管理者の並び順設定）、要件6.1（利用者の並び替え）。
- **Sources**: `apps/app/src/client/components/Bookmarks/DragAndDropWrapper.tsx`、`BookmarkFolderTree.tsx`。
- **Findings**: `DragAndDropWrapper` は `react-dnd` の薄いラッパーだが `DragItemDataType`（ブックマーク形状）に結合、`onDropItem` に位置情報が無い、`DndProvider` 祖先が必要、`BookmarkFolderTree` の並び替え永続化ハンドラはコメントアウト済み。
- **Implications**: 7項目の並び替えには DnD ライブラリを持ち込まず、上下移動ボタン＋表示トグルで実装（アクセシブル・provider 不要・管理画面と /home の両方で同じ部品）。

### `/home` 予約パス化
- **Context**: 要件9.1。
- **Sources**: `packages/core/src/utils/page-path-utils/index.ts`（`restrictedPatternsToCreate`）。
- **Findings**: `restrictedPatternsToCreate` はフラットな正規表現配列。既存の1行 `/^\/(installer|register|login|...|attachment)(\/.*|$)/` の選択肢に `home` を足すだけ。`isCreatablePage(path)` がこの配列を参照する単一ソース。v2 は `/home` を Next ページとして出しただけでこの配列には未追加。
- **Implications**: 選択肢に `home` を1語追加。加えて起動時チェックで既存の `/home` wiki ページがあれば警告ログ（自動削除はしない）。

### SSR プロップの組み立て
- **Context**: 要件5.3、5.5（サイト共通設定を初回描画に反映）。
- **Sources**: `apps/app/src/pages/home/index.page.tsx`（`getServerSideProps` の `Promise.all` ＋ `mergeGetServerSidePropsResults`）、`apps/app/src/features/home/server/get-home-notice.ts`。
- **Findings**: v2 は「単一のお知らせ設定は SSR（config 読み取り）、各ウィジェットのデータは各自クライアント SWR」の混在。`Promise.all` に `getServerSideXProps` を1つ足すだけで拡張できる。
- **Implications**: サイト共通ウィジェット設定＋ピン留め生リスト＋Classroom パスは SSR（`getServerSideHomeWidgetsProps`、config 読み取りのみで安価）。個人別設定は既にハイドレート済みの `userUISettings` に相乗り。各ウィジェットの中身は v2 同様クライアント SWR。

## Design Decisions

### Decision: ウィジェットは静的ディスクリプタ配列＋純粋なレイアウト解決関数
- **Context**: 要件1.4（実行時のウィジェット定義を許さない）、要件5・6（サイト共通と個人別の2層設定）。
- **Alternatives Considered**:
  1. 動的ウィジェットレジストリ（設定駆動で登録）
  2. コード上の静的ディスクリプタ配列＋「有効レイアウト」を導出する純粋関数
- **Selected Approach**: 2。`HOME_WIDGET_DESCRIPTORS`（`{ key, titleI18nKey, Component, defaultVisible, defaultOrder, adminOptionsSchema? }` の固定配列）＋ `resolveEffectiveWidgetLayout(descriptors, siteConfig, userPrefs) → OrderedWidgetView[]`。
- **Rationale**: 要件が禁じる実行時定義を持ち込まず、サイト共通/個人別のマージロジックを1箇所（純粋関数、SSR・クライアント共用、単体テスト容易）に閉じ込める。
- **Trade-offs**: 新ウィジェット追加はコード変更（配列に1エントリ）。要件1.4がこれを許容。
- **Follow-up**: 解決関数のマージ規則（key ごとに userPrefs > siteConfig > descriptor default）を単体テストで固定。

### Decision: 「お知らせ・予定フィード」は3セクションを持つ1ウィジェット
- **Context**: 要件4（イベント・通知・出欠を1つのフィードで）。
- **Alternatives Considered**: 3ウィジェットに分割 / 1ウィジェット3セクション。
- **Selected Approach**: 1ウィジェット。内部に「今後のイベント」「未回答の出欠確認（あれば）」「直近の通知」の3セクション。各セクションのデータ取得は独立（1つ失敗しても他セクションは表示）。
- **Rationale**: 要件が1フィードとして扱っている。設定・並び替えの単位も1つで済む。
- **Trade-offs**: セクション単位の表示/非表示は持たない（要件外）。

### Decision: 個人別設定は `UserUISettings` の1フィールド、上下ボタンで編集
- **Context**: 要件6.1・6.2。
- **Selected Approach**: `UserUISettings.homeWidgetPreferences: Record<widgetKey, { visible: boolean; order: number }>`。/home 上の「カスタマイズ」モードで各ウィジェットカードに上下移動＋表示トグル、「初期状態に戻す」でフィールドを空にする。保存は既存の `PUT /user-ui-settings`（許可リストに1フィールド追加）にマップ全体を送る。
- **Rationale**: SSR ハイドレート済みで初回レイアウトが安定。DnD ライブラリ・provider 不要。
- **Trade-offs**: マップ全体送信（浅いマージ制約）。7項目なので問題にならない。

### Decision: 新規サーバー機能は「パス配下の最近更新」「複数パスの解決」の2メソッドに限定
- **Context**: 要件2（Classroom）、要件3（ピン留め）。
- **Selected Approach**: `page-listing` サービスに `findRecentPagesUnderPath(prefix, viewer, limit)` と `resolvePagesByPaths(paths, viewer)` を追加（いずれも `findWipPagesByUser` と同型、`PageQueryBuilder` の viewer フィルタ再利用）。対応する apiv3 ルートを `page-listing.ts` に追加。
- **Rationale**: Classroom は「既知プレフィックス配下の最近ページ」、ピン留めは「指定パス群を権限フィルタして解決」。どちらも既存の権限フィルタ機構に乗せる。イベント・通知・出欠は既存機能をクライアントから呼ぶだけで新規バックエンド不要。
- **Trade-offs**: `page-listing` サービスの責務がわずかに拡大。命名・戻り値規約を既存に合わせて影響を局所化。

## Risks & Mitigations
- Classroom 同期エージェントの同期先パスがハードコードで、ウィジェット側の既定パスとずれるとウィジェットが空になる — 既定パスをエージェントの既知パスと一致させ、管理者が上書きできるようにする。ドキュメント（研究ログ）にエージェント側パスを記録。
- `customize:homeWidgets` の JSON が壊れた場合にレイアウト解決が失敗 — 解決関数は不正な設定を無視してディスクリプタ既定にフォールバックする（fail-safe）。
- `parseEvents` を共有ユーティリティに切り出す際、サーバー側 `attendance-reminder.ts` の内部利用と二重管理になる — 切り出したユーティリティを `attendance-reminder.ts` からも import して単一ソース化する。
- `/home` に既存の wiki ページがある環境で予約パス化するとそのページが編集不能になる — 起動時チェックで警告ログのみ（破壊しない）。実運用では `/home` ページは存在しない想定。
- 個人別設定の `scheduleToPut` 浅いマージ — クライアントは編集中に有効マップ全体をローカル state で保持し、保存時にマップ全体を送る。

## References
- v2 設計: `.kiro/specs/home-page-widgets/design.md`
- Classroom 同期: `.kiro/specs/classroom-sync/`（未実装。実体は外部 `growi-docker-compose/classroom-sync-agent/`）、`apps/app/src/features/classroom-sync-trigger/`
- 生 markdown エンドポイント: `.kiro/specs/page-markdown-endpoint/`、`apps/app/src/features/page-markdown/`
- MongoDB 正規表現エスケープ: `.claude/rules/mongodb-regex.md`
