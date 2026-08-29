# Requirements Document

## Project Description (Input)

### 誰の課題か
GROWI フォークを社内 wiki として運用しているチーム/管理者。大きめのファイル共有置き場と、写真・バックアップ倉庫を「wiki と同じアカウント・同じサイト」で使いたい。利用者に追加ログインや別サービスの操作を強いたくない。

### 現状
- GROWI の添付ファイル（`Attachment`）は必ずページ/コメントに紐づき、フォルダ階層でのファイル管理・一覧・一括ダウンロードができない。
- ローカルアップローダの保存先は `<app>/public/uploads` にハードコードされ、任意パス（NAS マウント点）を指定する手段がない。
- GROWI のプラグイン機構ではサーバー側機能を追加できないため、本体（フォーク）改変で実現する必要がある。

### 何を変えるか
従来の添付ストレージ（`FILE_UPLOAD` 設定・`Attachment` モデル・既存 uploader 選択ロジック）を**一切変更せず**、それとは独立した「NAS もどき」ファイル置き場機能を GROWI サイト内に新規追加する。

- GROWI にログインしたユーザーが、ブラウザ内でページに紐づかないフォルダ/パス階層のファイルを閲覧・アップロード・ダウンロード・削除・フォルダ作成できる。
- 保存先ルートはこの機能専用の環境変数（例 `GROWI_NAS_ROOT`）で指定する。WSL2 で素の docker-compose 運用のため、実体は「ホストで `H:` 等をマウント → compose の `volumes` でコンテナへ → コンテナ内パス（例 `/nas`）を `GROWI_NAS_ROOT` に指定」という形になる。
- **ファイルシステムを正**とする。`GROWI_NAS_ROOT` 配下を走査して一覧を作り、GROWI を経由せずディスクに直接置かれたファイル/フォルダもそのまま見える。
- アクセス制御は**領域全体で一律**（既定はログイン済み全ユーザー、管理設定で単一グループに限定可能）。
- 未ログインユーザーへの公開共有リンクは提供しない（常に GROWI ログイン必須）。

### 明示的な非スコープ
- WebDAV エンドポイント / OS からのネットワークドライブマウント（サイト内アクセスのみで足りるため見送り）。
- S3/MinIO など FS 以外のバックエンド。
- サムネイル（縮小画像）生成・写真ギャラリー表示・写真管理 UX。既存フォーマットのブラウザ内プレビュー（Requirement 9）は対象に含む。
- 重複排除・差分同期・バージョニング。
- フォルダ単位の細粒度 ACL、公開共有リンク。
- 分割アップロードの途中再開（レジューム）。中断時は最初からのやり直しとする（Requirement 10）。

## Introduction

本機能「NAS File Storage」は、GROWI フォークに、従来の添付ファイル機構から完全に独立したファイル置き場をサイト内 UI として追加する。管理者が指定した専用ルートディレクトリ（`GROWI_NAS_ROOT`）配下を単一の共有ボリュームとして扱い、ログイン済みユーザーがブラウザからフォルダ階層をたどってファイルを閲覧・アップロード・ダウンロード・整理できる。ファイルシステムが唯一の信頼源であり、GROWI 外で置かれたファイルも同じ一覧に現れる。既存の `FILE_UPLOAD` 設定・`Attachment` モデル・添付アップローダの挙動には一切影響を与えない。

日常利用を助ける拡張として、一覧上のファイルをダウンロードせずにブラウザ内で確認できるプレビュー（画像・動画・音声・PDF・テキスト）、前段のリバースプロキシ / CDN が課す 1 リクエストサイズ上限を超える単一ファイルの分割アップロード、サブフォルダを含むフォルダの一括アップロードを備える。

## Boundary Context

- **In scope**:
  - 専用ルート `GROWI_NAS_ROOT` 配下のファイル/フォルダの一覧・閲覧・ダウンロード
  - ブラウザからのファイルアップロード、フォルダ作成、ファイル/フォルダの削除・リネーム・移動
  - 画像・動画・音声・PDF・プレーンテキスト系ファイルのブラウザ内プレビュー
  - 前段プロキシ/CDN の 1 リクエスト上限を超える単一ファイルの分割アップロード
  - サブフォルダを含むフォルダ単位の一括アップロード
  - 領域全体で一律のアクセス制御（ログイン必須、任意で単一グループ限定）
  - 管理画面での本機能の有効/無効状態とルート設定状況の表示
  - GROWI を経由せず配置されたファイルの一覧への反映
- **Out of scope**:
  - WebDAV / OS ドライブマウント、S3 等の非 FS バックエンド
  - サムネイル（縮小画像）生成、写真ギャラリー、全文検索インデックス
  - 分割アップロードの途中再開（レジューム）
  - バージョニング・重複排除・差分同期
  - フォルダ単位 ACL、未ログイン向け公開共有リンク
- **Adjacent expectations**:
  - 認証は GROWI 既存のログインセッションに依存する。本機能は独自のログイン手段を持たない。
  - グループ限定を使う場合、GROWI 既存のユーザーグループ定義に依存する。
  - `GROWI_NAS_ROOT` に割り当てる実ストレージ（NAS マウント、ディスク容量、バックアップ）の運用は本機能の責務外。
  - GROWI の前段に置くリバースプロキシ / CDN の 1 リクエストボディ上限は運用者が所有する。分割アップロードはその上限の存在を前提とするが、上限値そのものの設定は本機能の責務外。
  - 既存の添付ストレージ（`Attachment` / `FILE_UPLOAD` / 添付アップローダ）は本機能が所有せず、変更もしない。

## Requirements

### Requirement 1: 機能の有効化とルート設定
**Objective:** 運用管理者として、専用ルートディレクトリを指定して NAS 機能を有効化したい。それにより既存ストレージと切り離した共有ボリュームをサイト内に用意できる。

#### Acceptance Criteria
1. Where 明示的な有効化フラグ（`GROWI_NAS_ENABLED`）が真である, the NAS File Storage service shall 専用の設定値（`GROWI_NAS_ROOT`）で指定されたディレクトリのみをファイル操作の基準ディレクトリとして使用する。
2. If `GROWI_NAS_ENABLED` が真でない, then the NAS File Storage service shall `GROWI_NAS_ROOT` の設定有無にかかわらず本機能を完全に無効として扱い、関連する UI 導線を利用者に表示しない。
3. If `GROWI_NAS_ENABLED` が真だが `GROWI_NAS_ROOT` が未設定・空である, then the NAS File Storage service shall 本機能を無効として扱い、関連する UI 導線を利用者に表示しない。
4. If `GROWI_NAS_ENABLED` が真で `GROWI_NAS_ROOT` が存在しないパス、またはプロセスが読み書きできないディレクトリを指す, then the NAS File Storage service shall 機能を無効化し、管理画面に設定不備である旨を表示する。
5. When 管理者が管理画面の該当セクションを開く, the NAS File Storage service shall 本機能の有効/無効状態（無効時はフラグ未設定・ルート未設定・設定不備のどれかを区別して）と、現在使用中のルートが正しく解決できているかを表示する。
6. The NAS File Storage service shall 既存の添付ストレージ設定（`FILE_UPLOAD` の種別、`Attachment` の保存先）を参照も変更もしない。

### Requirement 2: フォルダ/ファイルの閲覧
**Objective:** ログイン済み利用者として、共有ボリュームのフォルダ階層をブラウザでたどりたい。それにより目的のファイルを見つけられる。

#### Acceptance Criteria
1. When 利用者が NAS ストレージ画面で任意のフォルダを開く, the NAS File Storage service shall そのフォルダ直下のファイルとサブフォルダの一覧（名称・種別・サイズ・更新日時）を返す。
2. The NAS File Storage service shall 一覧の内容をファイルシステムの実際の状態から算出し、GROWI を経由せずルート配下に配置されたファイル/フォルダも一覧に含める。
3. When ルート配下のファイルが GROWI 外で追加・削除・変更された後に利用者が該当フォルダを再表示する, the NAS File Storage service shall 変更後の状態を反映した一覧を返す。
4. While フォルダに多数のエントリが含まれる, the NAS File Storage service shall 一覧を分割して取得できる手段（ページングまたは範囲指定）を提供する。
5. If 利用者が指定したパスがルート配下に存在しない, then the NAS File Storage service shall 対象が存在しない旨のエラーを返し、他のパスの内容を開示しない。

### Requirement 3: ファイルのアップロード
**Objective:** ログイン済み利用者として、大きめのファイルを指定フォルダにアップロードしたい。それにより他のメンバーと共有できる。

#### Acceptance Criteria
1. When 利用者がフォルダを指定してファイルをアップロードする, the NAS File Storage service shall そのファイルをルート配下の対応するパスに保存し、保存後の一覧に反映する。
2. If アップロード先に同名のファイルが既に存在する, then the NAS File Storage service shall 上書きするか別名で保存するかを利用者が選べる形で処理し、利用者の指定なしに既存ファイルを上書きしない。
3. Where 1 ファイルあたりの最大サイズが設定されている, the NAS File Storage service shall その上限を超えるアップロードを拒否し、上限値を含むエラーを返す。
4. If アップロード中に保存先の空き容量不足や書き込みエラーが発生する, then the NAS File Storage service shall 中途半端なファイルを残さず、失敗した旨のエラーを返す。
5. If アップロード対象のパスがルート範囲外を指す（相対参照や絶対パスによる離脱を含む）, then the NAS File Storage service shall 操作を拒否し、ルート外への書き込みを行わない。

### Requirement 4: ファイルのダウンロード
**Objective:** ログイン済み利用者として、一覧からファイルを取得したい。それにより手元で利用できる。

#### Acceptance Criteria
1. When 利用者が一覧上のファイルを選んでダウンロードする, the NAS File Storage service shall そのファイルの内容を、元のファイル名を保持した形で返す。
2. If 指定されたパスがフォルダである、またはルート配下に存在しない, then the NAS File Storage service shall ダウンロードを拒否し、理由を示すエラーを返す。
3. If 指定されたダウンロードパスがルート範囲外を指す, then the NAS File Storage service shall 操作を拒否する。

### Requirement 5: フォルダ作成とファイル/フォルダの整理
**Objective:** ログイン済み利用者として、フォルダを作りファイルを整理したい。それにより共有ボリュームを見通しよく保てる。

#### Acceptance Criteria
1. When 利用者が現在のフォルダ内に新しいフォルダ名を指定する, the NAS File Storage service shall ルート配下の対応する場所にフォルダを作成する。
2. When 利用者がファイルまたはフォルダのリネーム、あるいは同一ルート内での移動を指示する, the NAS File Storage service shall 対象を新しいパスへ移し、旧パスを残さない。
3. When 利用者がファイルまたはフォルダの削除を指示する, the NAS File Storage service shall 対象をルート配下から取り除き、フォルダの場合はその配下も含めて取り除く。
4. If 作成・リネーム・移動先に同名のエントリが既に存在する, then the NAS File Storage service shall 操作を拒否し、名称衝突である旨を返す。
5. If 整理操作の対象または宛先がルート範囲外を指す, then the NAS File Storage service shall 操作を拒否する。
6. If 破壊的操作（削除・上書きを伴う移動）が指示される, then the NAS File Storage service shall 実行前に利用者へ確認を求める。

### Requirement 6: アクセス制御
**Objective:** 運用管理者として、NAS 領域へアクセスできる範囲を制御したい。それにより共有ボリュームを想定した利用者だけに見せられる。

#### Acceptance Criteria
1. If 未ログインの利用者が NAS ストレージの画面または操作にアクセスする, then the NAS File Storage service shall アクセスを拒否し、ログインを要求する。
2. The NAS File Storage service shall 閲覧・アップロード・ダウンロード・整理のすべての操作に対して同一のアクセス条件（領域全体で一律）を適用する。
3. Where 管理者が特定の単一ユーザーグループに利用を限定している, the NAS File Storage service shall そのグループに属さないログイン利用者からのアクセスを拒否する。
4. Where そのような限定が設定されていない, the NAS File Storage service shall ログイン済みの全利用者にアクセスを許可する。
5. The NAS File Storage service shall どの操作においても、要求されたパスが設定ルートの配下に収まることを検証し、範囲外へのアクセスを拒否する。
6. The NAS File Storage service shall 未ログイン利用者向けの公開共有リンクを発行しない。
7. The NAS File Storage service shall プレビュー配信、分割アップロードの各区間、フォルダ一括アップロードの各リクエストを含むすべての追加操作にも、同一のアクセス条件とルート範囲検証を適用する。

### Requirement 7: 既存の添付ストレージへの非干渉
**Objective:** 運用管理者として、この機能を追加しても既存のページ添付が従来どおり動くことを保証したい。それにより安全に導入できる。

#### Acceptance Criteria
1. The NAS File Storage service shall ページ/コメントの添付ファイルの保存・取得・削除の挙動を変更しない。
2. The NAS File Storage service shall `GROWI_NAS_ROOT` 配下にのみ書き込み、既存の添付保存先には書き込まない。
3. When NAS ストレージ機能が無効である, the NAS File Storage service shall 添付を含む既存機能に対して副作用を持たない。
4. The NAS File Storage service shall NAS 領域のファイルを添付ファイルの一覧・検索・管理画面に混在させない。

### Requirement 8: エラー処理と操作上の制限
**Objective:** 利用者および管理者として、異常時に何が起きたか分かるようにしたい。それにより復旧や設定修正ができる。

#### Acceptance Criteria
1. If ルートディレクトリが操作の途中で利用不能になる（マウント断など）, then the NAS File Storage service shall 進行中の操作を失敗として扱い、ストレージへアクセスできない旨を利用者に伝える。
2. If ファイルシステム上の権限により操作が拒否される, then the NAS File Storage service shall 権限起因で失敗した旨を返し、内部パスなどの機微情報を利用者に開示しない。
3. When いずれかの操作が失敗する, the NAS File Storage service shall 利用者向けには理由の要約を返しつつ、運用者が追跡できる詳細をサーバーログに記録する。
4. Where 隠しファイル・システムファイル（`.` 始まりや OS 固有のメタデータ）がルート配下に存在する, the NAS File Storage service shall それらを一覧の既定表示から除外できる。

### Requirement 9: ブラウザ内でのファイルプレビュー
**Objective:** ログイン済み利用者として、画像・動画・音声・PDF・テキストファイルをダウンロードせずにブラウザ内で確認したい。それにより目的のファイルかどうかを素早く判断できる。

#### Acceptance Criteria
1. When 利用者が一覧上のプレビュー対応ファイル（画像・動画・音声・PDF・プレーンテキスト系）を選んでプレビューを開く, the NAS File Storage service shall そのファイルの内容を、ダウンロードを強制せずブラウザが直接表示できる形で返し、画面上に表示する。
2. The NAS File Storage service shall プレビュー配信時に、ブラウザが内容を正しく解釈できるよう内容種別を示す。
3. While 利用者が動画または音声をプレビューしている, the NAS File Storage service shall 再生位置を途中に移動するための部分取得要求に応答する。
4. When 利用者が一覧上のプレビュー非対応ファイルを選ぶ, the NAS File Storage service shall プレビューを提供せず、ダウンロード導線のみを示す。
5. Where プレビュー対象がプレーンテキスト系ファイルである, the NAS File Storage service shall 一定サイズを超える場合はプレビュー表示を先頭部分に打ち切り、全体はダウンロードで取得するよう促す。
6. If プレビュー対象がスクリプトを実行し得る形式（SVG・HTML 等）である, then the NAS File Storage service shall それをブラウザ内で実行される形では表示せず、ダウンロードとして扱う。
7. If プレビュー対象がフォルダである、ルート配下に存在しない、またはルート範囲外を指す, then the NAS File Storage service shall プレビューを拒否し、理由を示すエラーを返す。

### Requirement 10: 大容量ファイルの分割アップロード
**Objective:** ログイン済み利用者として、前段のプロキシ / CDN の 1 リクエスト上限を超えるサイズの単一ファイルをアップロードしたい。それにより大きなバックアップやデータ一式も共有できる。

#### Acceptance Criteria
1. When 利用者が 1 リクエスト上限を超えるサイズの単一ファイルをアップロードする, the NAS File Storage service shall そのファイルを複数回に分けて受け取り、ルート配下の対応するパスに送信元と同一内容で保存する。
2. The NAS File Storage service shall 全区間の受信が完了したあとにのみ対象ファイルを最終的な保存状態にし、部分的に受信しただけのファイルを一覧に見せない。
3. If 分割アップロードが完了前に中断される（ネットワーク断・ブラウザ終了・エラー）, then the NAS File Storage service shall 受信済みの部分データを破棄し、中途半端なファイルをルート配下に残さない。
4. When 利用者が中断した分割アップロードを再度実行する, the NAS File Storage service shall 最初からのやり直しとして扱い、途中再開はしない。
5. Where 1 ファイルあたりの最大サイズが設定されている, the NAS File Storage service shall 分割アップロードの合計サイズにもその上限を適用し、超過を上限値付きのエラーで拒否する。
6. If 分割アップロードの最終的な保存先に同名ファイルが既に存在する, then the NAS File Storage service shall 単一ファイルアップロードと同じ衝突処理を適用し、利用者の指定なしに既存ファイルを上書きしない。
7. If 分割データの結合結果が送信元と一致しない（サイズ不一致・区間の欠損）, then the NAS File Storage service shall 保存を中止し、失敗した旨のエラーを返す。

### Requirement 11: フォルダ単位の一括アップロード
**Objective:** ログイン済み利用者として、サブフォルダを含むフォルダをまるごとアップロードしたい。それにより階層のあるデータ一式をそのままの構造で共有できる。

#### Acceptance Criteria
1. When 利用者がサブフォルダを含むフォルダをアップロード対象として指定する, the NAS File Storage service shall そのフォルダ階層を現在のフォルダ配下に再現し、各ファイルを対応するパスへ保存する。
2. The NAS File Storage service shall フォルダ一括アップロードに含まれる空のサブフォルダも作成する。
3. When 利用者がフォルダ一括アップロードを指示する, the NAS File Storage service shall 開始前に名称衝突時の方針（すべて上書き / すべてスキップ / すべて別名）を利用者に一度だけ選ばせ、その方針をバッチ内のすべての衝突へ一律に適用する。
4. If 一括アップロード中の個々のファイルが失敗する, then the NAS File Storage service shall 失敗したファイルを利用者に示しつつ、残りのファイルの処理を継続する。
5. If フォルダ一括アップロードに含まれるいずれかのパスがルート範囲外を指す, then the NAS File Storage service shall そのエントリを拒否し、ルート外への書き込みを行わない。
6. When フォルダ一括アップロードが完了する, the NAS File Storage service shall 追加・更新されたエントリを反映した一覧を返す。
