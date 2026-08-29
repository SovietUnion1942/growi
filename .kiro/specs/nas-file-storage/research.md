# Gap Analysis — nas-file-storage

作成日: 2026-08-28 / 対象要件: `requirements.md`（Requirement 1〜8）

## 1. 現状調査（Current State）

### 関連アセットと配置規約

| 領域 | 既存資産 | 位置 | 本機能での扱い |
|---|---|---|---|
| 添付ストレージ抽象 | `FileUploader` 基底 + `aws/gcs/azure/gridfs/local/none` | `server/service/file-uploader/` | **触らない**。参考にするが流用しない |
| ローカル保存パス生成 | `buildLocalStoragePath()` | `server/service/file-uploader/local-storage-path.ts` | 発想を流用（範囲外検証つき join） |
| パストラバーサル対策 | `isPathWithinBase()` / `assertFileNameSafeForBaseDir()` | `server/util/safe-path-utils.ts` | **そのまま流用**（Req 3.5 / 4.3 / 5.5 / 6.5） |
| 設定管理 | `configManager` + `config-definition.ts` の `defineConfig` | `server/service/config-manager/` | 新規キー `app:nasStorage*` を追加、`envVarName: GROWI_NAS_ROOT` 等 |
| 認証ミドルウェア | `loginRequiredFactory(crowi, isGuestAllowed?)` | `server/middlewares/login-required.ts` | `loginRequiredStrictly` 相当を全ルートに（Req 6.1） |
| グループ判定 | `UserGroupRelation` / `ExternalUserGroupRelation` モデル、vault の `reconcile-acl-evaluator` が group→user 展開の実例 | `server/models/`, `features/growi-vault/server/services/reconcile/` | 単一グループ限定判定に流用（Req 6.3） |
| multipart 受信 | `multer({ dest: `${crowi.tmpDir}uploads` })` + `multer-autoreap` | `server/routes/apiv3/attachment.js` | 同パターンで受信 → NAS ルートへ move（Req 3） |
| apiv3 ルート登録 | `router.use('/xxx', setupXxx(crowi))` を `server/routes/apiv3/index.js` に1行 | 同上 200行付近 | **既存ファイルへの改変はこの1行のみ** |
| フォークの前例（最も近い） | `features/growi-vault/` — 独自モデル/ルート/admin 画面/設定サービス/クライアントを feature 配下に完結 | `features/growi-vault/` | **構成の雛形として踏襲** |
| admin ルート登録 | `routerForAdmin.use('/vault', createVaultAdminRouterWithDeps(crowi))` | `apiv3/index.js` 131行 | 管理画面用に同様の1行（Req 1.4） |
| クライアント admin 画面 | `features/growi-vault/client/admin/VaultAdminSettings.tsx` | 同上 | 設定状態表示の雛形 |
| サイドバー導線 | `client/components/Sidebar/SidebarNav/PrimaryItems.tsx` | 同上 | ナビ項目1件追加（Req 1.2 で条件表示） |
| Next.js ページ | `src/pages/**/*.page.tsx` + `getLayout` | `src/pages/` | NAS ブラウザ画面を1ページ追加 |

### 規約（要約）

- native ESM / no-extension import / `erasableSyntaxOnly`（enum 禁止、const union で代替）
- feature は `features/{name}/{server,client,interfaces}/`、barrel `index.ts` 1本、named export
- サービスは `Crowi` クラスを import しない（インスタンスを factory 引数で受ける）
- 設定ゲートされた重い依存は遅延 import ＋ `no-eager-*-imports` drift spec。※本機能は Node 標準 `fs` のみなので重量依存なし＝この制約の新規 spec は不要見込み
- テストは co-locate（`*.spec.ts` / `*.integ.ts`）、`pnpm vitest`
- 破壊的操作（Req 5.6）はフロントの確認 UI で担保、サーバーは冪等・安全側

## 2. 要件→資産マップ（充足度）

| Req | 必要な技術要素 | 既存 | ギャップ |
|---|---|---|---|
| 1 設定/有効化 | 新規 config キー、ルート解決＋読み書き可否チェック、admin 状態表示 | `configManager`, vault admin 画面 | **Missing**: 起動時のルート健全性チェックとキャッシュ、admin API/画面（小） |
| 2 閲覧（FS が正） | `fs.readdir(withFileTypes)` + `stat`、ページング、パス検証 | `isPathWithinBase` | **Missing**: ディレクトリ列挙サービス、範囲取得 API。**Constraint**: FS が正＝DB インデックス無し（走査コストは大ディレクトリで問題化しうる → ページング必須） |
| 3 アップロード | multer 受信 → `fs.rename`/stream、サイズ上限、衝突処理、原子性 | attachment.js の multer 設定 | **Missing**: 一時ファイル→NAS への安全 move（跨device 時は copy+unlink）、衝突ダイアログ用の事前存在チェック API |
| 4 ダウンロード | `res.download` / stream、種別チェック | Express 標準 | **Missing**: なし（薄い） |
| 5 整理（mkdir/mv/rm） | `fs.mkdir`, `fs.rename`, `fs.rm({recursive})`、宛先検証、衝突検出 | `safe-path-utils` | **Missing**: 整理サービス。**Risk(Low-Med)**: `fs.rm` recursive の誤操作 → フロント確認＋サーバー側で「ルート自身/直下は保護」等のガード |
| 6 アクセス制御（一律） | 全ルートに loginRequiredStrictly、任意で単一グループ判定、全ルートで範囲検証 | login-required、vault の group→user 展開 | **Missing**: グループ限定ミドルウェア（vault のロジックを縮小移植）。共有リンクは**実装しない**だけ |
| 7 非干渉 | 既存 uploader/Attachment に一切触れない | — | **Constraint**: `apiv3/index.js` と `PrimaryItems.tsx` 以外の既存ファイルを変更しない方針を維持 |
| 8 エラー処理 | ルート断検知、EACCES ハンドリング、機微情報の非開示、ログ、隠しファイル除外 | `loggerFactory` | **Missing**: エラー正規化層（内部パスを剥がすマッパ）、`.`始まり除外オプション |

### Research Needed（設計フェーズへ持ち越し）

- **大ディレクトリの列挙性能**: 数万エントリのフォルダで `readdir`+`stat` を毎回実行する場合の応答時間。ページング境界の決め方（名前順ソートの安定性、`opendir` イテレータ利用可否）。
- **クロスデバイス move**: `GROWI_NAS_ROOT` が別マウントのとき `crowi.tmpDir`（コンテナFS）からの `fs.rename` が `EXDEV`。tmp をルート内 `.tmp/` に置く設計にするか、copy+unlink フォールバックにするか。
- **ルート健全性チェックの再評価タイミング**: 起動時のみか、操作ごとの軽量 `access()` か（Req 8.1 マウント断対応と両立させる）。
- **隠しファイル/OSメタデータ除外の既定**: `.` 始まりのみか、`@eaDir`/`.DS_Store`/`Thumbs.db` 等も既定除外リスト化するか。
- **グループ限定の設定 UI**: 既存の group selector コンポーネント（`features/growi-vault` / group-selection-ui）の再利用可否。
- **アップロード上限**: 独自 env（例 `GROWI_NAS_MAX_FILE_SIZE`）を新設。既存 `MAX_FILE_SIZE` は添付用なので**流用しない**方針の確認。
- **監査ログ（Activity）**: NAS の書き込み操作を既存 `Activity` に記録するか否か（要件外だが運用者の期待に関わる。設計で判断）。

## 3. 実装アプローチ

### Option A: 既存 file-uploader を拡張（`local` に第2ルート追加）
- ✅ 既存の delivery/削除経路を再利用
- ❌ Req 7（非干渉）と正面衝突。`getUploader` の分岐・`Attachment` 前提コードに手が入る。FS が正＝DB レス設計とも噛み合わない
- **不採用**

### Option B: `features/nas-file-storage/` に完全新規（推奨）
- 構成: `server/{config,services/{fs-store,acl,errors},routes,middlewares}` + `client/{admin,components}` + `interfaces` + `src/pages/nas/...page.tsx`
- 既存改変は **`apiv3/index.js` に2行（利用者ルート＋admin ルート）** と **`PrimaryItems.tsx` にナビ1件** のみ
- ✅ Req 7 を構造で保証、vault という前例と同型、隔離テスト容易
- ❌ ファイル数は増える（feature 標準どおり）
- **採用**

### Option C: ハイブリッド（B ＋ 将来 S3 バックエンドを差し替え可能に）
- `fs-store` を `NasStore` インターフェイスの一実装として切り、第2段階で `s3-store` を追加できる形にだけしておく
- ✅ 非スコープの S3 を「入れないが塞がない」（Req 非スコープの意図どおり）
- ❌ 初手でインターフェイス設計の手間（小）
- **設計フェーズで B に対する上乗せとして検討**

## 4. 複雑度とリスク

| 項目 | 評価 | 根拠 |
|---|---|---|
| Effort | **M（3〜7日）** | 大半は `fs` 薄ラッパ＋既存パターン踏襲。UI（ブラウザ画面）とアップロード原子性・ページングが工数の山 |
| Risk | **Medium** | 新規パターンは少ないが、(a) パストラバーサル/`fs.rm` recursive のセキュリティ境界、(b) クロスデバイス move、(c) 大ディレクトリ性能 の3点が未確定。いずれも設計で潰せる範囲 |

### セキュリティ注意（security.md 準拠で設計必須）

- すべてのパス入力を `isPathWithinBase` で検証（join 後に resolve して境界チェック）。シンボリックリンクでの脱出も考慮（`fs.realpath` 後に再検証）。
- `fs.rm(recursive)` はルート直下フォルダの保護ガード＋フロント二段確認。
- エラーメッセージから絶対パス・`errno` 詳細を除去（Req 8.2）。
- グループ限定・ログイン必須を**全ルートで**（GET 含む）。

## 5. 設計フェーズへの申し送り

- **推奨アプローチ: Option B（＋ Option C の薄いインターフェイス分離を検討）**
- 主要決定事項:
  1. 一時ファイル置き場を `${GROWI_NAS_ROOT}/.tmp/` にするか（EXDEV 回避）
  2. ディレクトリ列挙のページング契約（キー: 名前 or 更新日時、安定ソート）
  3. ルート健全性チェックの頻度（起動時キャッシュ ＋ 操作時 `access()`）
  4. 新規 env セット: `GROWI_NAS_ROOT`（必須）, `GROWI_NAS_GROUP`（任意, 単一グループ）, `GROWI_NAS_MAX_FILE_SIZE`（任意）, 隠しファイル除外の既定
  5. Activity 記録の要否
- 持ち越し調査: 上記「Research Needed」全項目
- drift spec: `fs` のみ使用のため `no-eager-*` 系の新規 spec は不要見込み（設計で最終確認）

---

## 設計フェーズ: Discovery（Light）と Synthesis 結果

作成日: 2026-08-28 / Discovery タイプ: **Light（既存システムへの拡張・新規 feature 追加）**

### Light Discovery — 統合点の確認

| 確認項目 | 結果 |
|---|---|
| feature ブートフック | `crowi/index.ts:1014` の `await initializeVaultFeature(this)` と同じ位置に 1 行追加できる |
| apiv3 登録 | `apiv3/index.js` の `router.use(...)` / `routerForAdmin.use(...)` に各 1 行 |
| 設定登録 | `config-definition.ts` の `defineConfig<string|undefined>({ envVarName })` パターン（`app:plantumlUri` 等と同型） |
| 認証 | `loginRequiredFactory(crowi)` = strict（guest 不可）。attachment.js が `loginRequiredFactory(crowi, true)` / `(crowi)` を使い分けている実例あり |
| multipart | `multer({ dest: ${crowi.tmpDir}uploads })` + `multer-autoreap`（attachment.js と同一） |
| クライアント有効判定 | `aiEnabledAtom`（`~/states/server-configurations`）と同じく `_app` のサーバー設定 props 経由で atom 供給。`PrimaryItems.tsx` が `useAtomValue` で参照する前例あり |
| グループ判定 | `features/growi-vault/server/services/reconcile/reconcile-acl-evaluator.ts` が group→user 展開の実装例。`UserGroupRelation` / `ExternalUserGroupRelation` を使用 |
| 新規ランタイム依存 | なし（`node:fs` のみ）。`no-eager-*-imports` drift spec 不要 |

### Synthesis

**1. Generalization**: Req 2〜5 は「単一ルートの FS ツリーに対するパス操作」の変種。→ `NasFileStore` インターフェイス 1 本（list/stat/openRead/moveIntoRoot/mkdir/move/remove）に集約し、route 層は薄い CRUD マッピングに徹する。将来の非 FS バックエンド（非スコープ）は同インターフェイスの別実装で追加可能（実装はしない = Option C の「インターフェイスだけ」）。

**2. Build vs Adopt**:
- パストラバーサル対策 → **Adopt** `safe-path-utils`（`isPathWithinBase` / `assertFileNameSafeForBaseDir`）。シンボリックリンク脱出のみ `fs.realpath` 再検証を **Build**（薄い）。
- multipart 受信 → **Adopt** `multer`（既存依存）。
- 認証・グループ判定 → **Adopt** `loginRequiredFactory` + 既存グループモデル。vault の ACL evaluator ロジックを縮小移植。
- ディレクトリ列挙のページング → **Build**（`fs.opendir` 非同期イテレータ + 名前昇順 cursor）。標準ライブラリで十分、外部依存不要。
- WebDAV → **不採用**（要件から除外）。

**3. Simplification**:
- **MongoDB モデルを持たない**。FS を唯一の信頼源とすることで「モデル層」を丸ごと削除。同期・整合ロジック不要。
- **管理画面は読み取り専用**。ルート・グループ・上限はすべて環境変数（`GROWI_NAS_ROOT` / `GROWI_NAS_GROUP` / `GROWI_NAS_MAX_FILE_SIZE` / `GROWI_NAS_SHOW_HIDDEN`）。設定の永続化・編集 UI・バリデーションを削除。
- 既存 `MAX_FILE_SIZE` は**流用しない**（添付用途と混同を避ける）。専用 `GROWI_NAS_MAX_FILE_SIZE`。
- エラーは例外を投げず `NasResult<T>` の discriminated union に統一。route 層で `NasErrorCode` → HTTP を機械マッピング。

### Design Decisions（確定）

| # | 決定 | 根拠 |
|---|---|---|
| D1 | Option B（完全新規 feature）+ `NasFileStore` インターフェイスのみ残置 | Req 7 を構造で保証、将来拡張の口だけ確保 |
| D2 | DB モデルなし、FS が信頼源 | Req 2.2/2.3、Simplification |
| D3 | 環境変数のみ、管理画面は読み取り専用ステータス | フォーク運用スタイル、Simplification |
| D4 | 一時ファイルは `${GROWI_NAS_ROOT}/.growi-nas-tmp/`、`EXDEV` 時のみ copy+rename フォールバック | クロスデバイス move 問題（research 既出）の解決 |
| D5 | 一覧は `fs.opendir` イテレータ + 名前昇順 cursor、既定 limit 100 / 最大 500 | 大ディレクトリ性能（research 既出） |
| D6 | `nasAccess` を router レベルで全ルート（GET 含む）に適用 | Req 6.2 一律認可 |
| D7 | シンボリックリンク脱出は実在祖先の `realpath` 再検証で防ぐ | セキュリティ境界（research 既出） |
| D8 | NAS 書き込みの `Activity` 記録は**当面しない** | 要件外。運用要望が出たら別 spec |

### 未解決（設計後・実装前に確認したい軽微な点）

- 隠しファイル除外の既定リスト（`.DS_Store` / `Thumbs.db` / `@eaDir` / `.growi-nas-tmp`）で十分か。
- `GROWI_NAS_GROUP` はグループ「名」で解決する想定。同名の内部/外部グループが併存する場合の優先順位（設計は「両方を許可対象に含める」= どちらかに属していれば OK）。
- 一覧のソートキーを名前固定とするか、更新日時ソートの need があるか（初版は名前のみ、UI 側クライアントソートで対応可）。

---

## 設計レビュー（kiro-validate-design）指摘の反映 — 2026-08-28

GO 判定。3 件の critical issue を design.md に反映済み。

| # | 指摘 | 反映内容 |
|---|---|---|
| R-1 | ページング契約と性能主張の矛盾（opendir 早期打ち切り vs 名前安定 cursor） | `list` を「`fs.readdir` 全件 → 名前昇順ソート → cursor 以降を limit 件スライス」に確定。早期打ち切り記述を削除。`GROWI_NAS_MAX_ENTRIES_PER_DIR`（既定 50,000）超で `TOO_MANY_ENTRIES`（409）。Perf 節も O(n log n)/ページと明記 |
| R-2 | 「env のみ」と `configManager` 登録の不整合 | `config-definition.ts` 変更を撤回。`NasStorageConfig` が `process.env` を直接読む。クライアント有効フラグは `RootHealthChecker.getStatus()` から導出し atom 供給。Modified Files から config-definition.ts を削除 |
| R-3 | 非上書き保証が TOCTOU | 「事前 exists 確認 → move」をやめ、宛先を `wx` / `link` で排他生成 → `EEXIST` を `CONFLICT` に正規化（アトミック）。`moveIntoRoot` / `move` 共通規則。アップロード・シーケンス図も更新 |

環境変数セット（確定）: `GROWI_NAS_ROOT`（必須）, `GROWI_NAS_GROUP`, `GROWI_NAS_MAX_FILE_SIZE`, `GROWI_NAS_SHOW_HIDDEN`, `GROWI_NAS_MAX_ENTRIES_PER_DIR`。

---

## 第 2 弾の探索と設計判断（プレビュー / 分割アップロード / フォルダ一括） — 2026-08-29

対象要件: `requirements.md` Requirement 9〜11、および 6.7。Extension（light discovery）。

### Light Discovery（既存コードの確認）

| 調査点 | 所見 | 設計への含意 |
|---|---|---|
| GROWI 添付配信の Range 対応 | `file-uploader/local.ts` は `createReadStream` を単純に `pipe`。**Range 非対応**（動画シーク不可） | プレビューの動画シーク（Req 9.3）は自前実装が要る → `res.sendFile` を採用 |
| ディスポジション判定の前例 | `file-uploader/utils/security.ts` の `defaultContentDispositionSettings`（MIME → inline/attachment）、`headers.ts` の `createContentHeaders`（CSP 文字列込み） | 同じ分類方針を拡張子キーで再現（`interfaces/nas-preview.ts`）。CSP 文字列も踏襲 |
| scriptable 形式の扱い | 既存表で `text/html` `image/svg+xml` `application/javascript` `application/xml` `application/json` はすべて `attachment` | Req 9.6 と一致。NAS 側も同一方針で固定 |
| multipart 受信 | `multer({ dest })` + `multer-autoreap`（既存パターン、既に NAS でも使用） | 単発アップロードは現状維持。分割は raw body 追記なので multer 非経由 |
| チャンクアップロードの前例 | GROWI 内に**なし** | 最小プロトコルを自作（下記 build 判断） |
| フォルダ選択 API | `react-dropzone`（既存依存）はディレクトリ D&D でファイルのみ返す（空ディレクトリは不可視）。File System Access API `showDirectoryPicker` は Chromium で空ディレクトリも列挙可 | Req 11.2（空フォルダ作成）は picker 経路で満たす。`webkitdirectory` はフォールバック |

### Design Synthesis

**1. Generalization**
- **プレビュー = ダウンロードの配信バリエーション**。「ルート内のファイルを正しいヘッダで HTTP 配信する」capability に一本化。別 `/preview` ルートは作らず `GET /file?inline=` の 1 スイッチ、store も `resolveContentPath` 1 メソッド。
- **分割アップロード完了 = 単発アップロード**。どちらも「一時ファイルを衝突処理付きで原子的にルートへ move」。`moveIntoRoot({ sourceTmpPath })` を `.part` にも再利用。

**2. Build vs Adopt**
- **Range / 条件付き GET → Adopt `res.sendFile`**（Express 組み込み）。`range-parser` + 206 + `If-Range` + マルチレンジ拒否 + `Last-Modified`/`ETag` を自前で書くのは車輪の再発明。`res.sendFile` は絶対パスを要求するだけ。
- **チャンクアップロード → Build（最小）**。`tus`（`tus-node-server`）を検討 → 却下：依存が増え、独自のルーティング/ストレージモデルを持ち込む。かつ「レジューム非対応」を明示要件としているため tus の主機能が不要。`Content-Range` の逐次追記（`start === receivedBytes` ガード）＋在メモリセッションで固定小コード。
- **フォルダ走査 → Adopt ブラウザ API**（`showDirectoryPicker` / `webkitdirectory`）。ライブラリなし。

**3. Simplification**
- 新しい環境変数を追加しない。`chunkSize`（8 MiB）・クライアント切替閾値（90 MiB）・スイープ間隔（1h）・セッション TTL（24h）はコード内定数。
- 分割アップロードセッションを **MongoDB に持たない**。在メモリ `Map`。プロセス再起動で失われてよい（レジューム非対応の当然の帰結）。孤児 `.part` は TTL スイープで回収。
- フォルダ一括アップロードに**新しいサーバーエンドポイントを足さない**。既存 `POST /folders`（バッチ内では既存時 409 を成功扱い）＋ `POST /files` の再利用。オーケストレーションはクライアント。
- `NasPreviewModal` は 1 コンポーネントで kind 分岐（img/video/audio/iframe/pre）。4 つに割らない。

### Design Decisions（第 2 弾・確定）

| # | 決定 | 根拠 |
|---|---|---|
| D9 | プレビューとダウンロードを `GET /file?inline=` に統合、配信は `res.sendFile` | Generalization / Adopt。Range を自前実装しない |
| D10 | 拡張子 → `{ kind, mimeType, disposition }` 表を `interfaces/nas-preview.ts` に置き、server (`nasContentDisposition`) と client (`getNasPreviewKind`) で共有 | 判定のずれ防止（単一の情報源） |
| D11 | SVG/HTML/XML/JS は `inline=1` でも常に `attachment`、全 `GET /file` に CSP + `nosniff` | Req 9.6、同一オリジン蓄積型 XSS の防止 |
| D12 | 分割アップロード = `POST /uploads` → `PATCH`（`Content-Range` 逐次）→ `complete`。在メモリ `ChunkedUploadRegistry`、`.part` は `.growi-nas-tmp/` | Build 最小、レジューム非対応（Req 10.4） |
| D13 | `.part` の完了は既存 `moveIntoRoot` を再利用（衝突処理も共通） | Generalization、Req 10.6 |
| D14 | 分割セッションは開始ユーザーに束縛、`uploadId` は `crypto.randomUUID()` | 他人のセッションへの追記/中断を防ぐ |
| D15 | フォルダ一括アップロードはクライアント主導、サーバーは既存 `/folders` `/files` 再利用 | Simplification。既存改変を増やさない |
| D16 | 空フォルダ保持は `showDirectoryPicker` 経路のみ、`webkitdirectory` はフォールバック（空フォルダは作られない） | ブラウザ API の制約。Req 11.2 は前者で満たす |

### 未解決（設計後・実装前に確認したい軽微な点）

- `chunkSize` 8 MiB / 切替閾値 90 MiB の具体値（100 MiB プロキシ上限に対する安全マージン）。実測で調整余地。
- テキストプレビューの先頭取得サイズ 256 KiB が妥当か。
- `showDirectoryPicker` 非対応ブラウザ（Firefox/Safari）で空フォルダが作られないことを UI で明示するか、黙認するか。
- PDF プレビューの `<iframe sandbox>` 属性値（`allow-same-origin` を付けるか）。
