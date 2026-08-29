# NAS File Storage

wiki 内の共有ファイル置き場。ページ添付とは**完全に独立**して、実ディスク上のフォルダツリーを
ブラウザから閲覧・アップロード・ダウンロード・整理できる。サイドバー項目 **NAS Storage**、
画面は `/nas`、管理セクションは `/admin/nas-storage`。

**ファイルシステムが唯一の信頼源**（DB インデックスなし）。GROWI を経由せずディスクに直接置いた
ファイルも一覧に現れる。領域の容量上限はマウントしたボリュームのサイズそのもの — アプリ側に
クォータ機能はない。

## 有効化（WSL2 + docker-compose）

スイッチは **opt-in**。ボリュームをマウントしたり `GROWI_NAS_ROOT` を設定するだけでは何も起きず、
`GROWI_NAS_ENABLED` が truthy になって初めて機能が動く。

1. **フォークビルドのイメージを使う。** 素の `growilabs/growi:8` にはこの機能が入っていない。
   `services.app.image` を `feat/nas-file-storage` のビルドに向ける。

2. **容量を固定した仮想ディスクを作り、WSL2 に ext4 として直接マウントする**（そのサイズが上限）:

   ```powershell
   # PowerShell（管理者）
   New-VHD -Path C:\growi-nas.vhdx -SizeBytes 20GB -Dynamic
   wsl --mount --vhd C:\growi-nas.vhdx --name growi-nas
   ```

   WSL 内では `/mnt/wsl/growi-nas` に見える。Windows 再起動のたびに再マウントが必要。

3. **`.env` を設定する**（`growi-docker-compose` の `feat/nas-file-storage` ブランチ、
   `.env.example` 参照）:

   ```
   GROWI_NAS_ENABLED=true
   GROWI_NAS_HOST_PATH=/mnt/wsl/growi-nas
   ```

   `GROWI_NAS_ROOT=/nas` はコンテナ内固定。触らず、ホスト側は `GROWI_NAS_HOST_PATH` で変える。

4. **起動して確認する。**

   ```bash
   docker compose config          # GROWI_NAS_* と /nas マウントが解決しているか確認
   docker compose up -d
   docker compose logs app | grep nas-storage   # -> "NAS file storage: ready"
   ```

   その後、管理者でサインインして **管理 › NAS Storage**（`/admin/nas-storage`）を開く。
   ステータスパネルが **Ready** で解決済みのルートパスを表示していれば OK。
   ログイン済みの非ゲストユーザーにサイドバーの **NAS Storage** 項目が出る。

## 環境変数

| 変数 | 必須 | 意味 | 既定値 |
|---|---|---|---|
| `GROWI_NAS_ENABLED` | 有効化に必要 | master スイッチ。truthy: `true` / `1` / `yes` / `on`。それ以外は機能オフ。 | `false` |
| `GROWI_NAS_ROOT` | 有効時に必須 | 機能が操作するディレクトリ。`/nas` 固定にし、ホスト側はボリュームマウントで選ぶ。 | なし |
| `GROWI_NAS_GROUP` | 任意 | 領域全体を単一ユーザーグループ（内部/外部、名前指定）に限定。未設定なら全ログインユーザー。 | 制限なし |
| `GROWI_NAS_MAX_FILE_SIZE` | 任意 | 1 ファイルあたりのアップロード上限（バイト）。超過は上限値付きで拒否。 | 無制限 |
| `GROWI_NAS_SHOW_HIDDEN` | 任意 | `.` 始まりファイルや OS メタデータ（`.DS_Store`, `Thumbs.db`, `@eaDir` …）を既定で一覧表示する。 | `false` |
| `GROWI_NAS_MAX_ENTRIES_PER_DIR` | 任意 | 1 フォルダのエントリ数上限。超えると一覧が列挙を拒否（毎回全件 readdir + ソートのため）。 | `50000` |

すべて `process.env` を直接読む。管理画面からは変更できず、DB でも上書きできない。

## ステータス状態（管理画面）

| 状態 | 原因 | ユーザーからの見え方 |
|---|---|---|
| `disabled` | `GROWI_NAS_ENABLED` が truthy でない | ナビ項目なし。`/nas` → 404 |
| `unconfigured` | 有効だが `GROWI_NAS_ROOT` が空 | ナビ項目なし。`/nas` → 404 |
| `misconfigured`（`missing` / `not-a-directory` / `not-writable`） | ルートパスが使えない。パネルがどれか明示 | ナビ項目なし。`/nas` → 404 |
| `ready` | ルートが読み書き可能なディレクトリに解決 | ナビ項目 + `/nas` 動作 |
| `unavailable` | 起動時は健全だったが操作中に `ENOENT`/`EACCES`（マウント断） | 「storage unavailable」で失敗。マウント復帰で自動回復 |

`disabled` / `unconfigured` / `misconfigured` は起動時に確定。環境を変えたら `app` サービスを
再起動して再判定させる。

## アクセス制御

閲覧を含む全操作にログインが必要。`GROWI_NAS_GROUP` を設定するとそのグループに限定される。
判定は読み書きで同一。公開・未認証リンクはない。

## トラブルシューティング

- **サイドバーに「NAS Storage」項目が出ない** — 状態が `ready` かつ非ゲストのときだけ表示。
  `/admin/nas-storage` で状態を確認。
- **有効化したのに `/nas` が 404** — 3 つのオフ状態のいずれか。`growi:nas-storage` の起動ログ行も確認。
  環境変更は `app` 再起動で反映。
- **「Misconfigured: not writable」** — コンテナの（非 root）uid がホストディレクトリを書けない。
  `/mnt/wsl/growi-nas` の所有者・モードを直す。
- **再起動後に「Misconfigured: missing」** — VHDX が未マウント。`wsl --mount` は Windows 再起動をまたがない。
- **アップロードがサイズエラーで失敗** — `GROWI_NAS_MAX_FILE_SIZE` 超過。代わりに「storage unavailable」なら
  ディスク満杯かマウント断（書きかけファイルは残らない）。
- **アップロードが 413 で失敗（アプリのログに届かない）** — 前段のリバースプロキシ／CDN のリクエストボディ上限。
  GROWI 自体は multer の `fileSize` を無制限にできるが、nginx の `client_max_body_size`（NAS 用 location は
  個別に緩める）と、Cloudflare 無料プランの **1 リクエスト 100MB** ハード上限が実質の天井になる。
  UI の「1ファイルあたり最大100MBまで」は `nas_storage.upload.size_hint` で調整。
- **巨大フォルダが開かない** — `GROWI_NAS_MAX_ENTRIES_PER_DIR`（既定 50,000）超過。

## 非スコープ

合計容量クォータなし（ボリュームサイズで制限）、WebDAV / ドライブマウントなし、公開リンクなし、
S3 等の非 FS バックエンドなし、サムネイルなし、バージョニングなし、重複排除なし、
フォルダ単位権限なし。**バックアップではない** — NAS 領域はマウントしたディスクそのもの。
ボリューム自体をバックアップすること。
