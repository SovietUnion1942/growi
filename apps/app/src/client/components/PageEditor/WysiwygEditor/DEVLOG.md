# WysiwygEditor 開発ログ

編集画面に WYSIWYG(ビジュアル)編集モードを追加する。元は
`growi-plugin-visual-editor`(script プラグイン)として作ったが、`growiFacade` が
エディタを公開せず DOM ハックだらけになったため本体へ移植した。

## 方針

- **散文だけリッチ編集**: 見出し / 太字・斜体・打ち消し・コード / リンク /
  箇条書き・番号・GFM タスクリスト / 引用 / コードブロック / 画像 / 水平線。
- **GROWI 独自記法は不透明ブロック**: `:::` `::` `$name` ディレクティブ、
  パイプテーブル、ブロック HTML、frontmatter はリッチ変換せず
  「ソース編集」カード(source_block)で生テキストのまま保持 = 壊さない。
- **CodeMirror(Markdown 本文)を常に正**とする。WYSIWYG の変更は最小差分で
  `codeMirrorEditor.view.dispatch` して書き戻す → yCollab 経由で Y.Text →
  サーバ永続化。保存 (`getDocString()`) / プレビュー / 自動保存は無改修。

## 構成

```
markdown/
  schema.ts            ProseMirror スキーマ (schema-basic + list + s マーク +
                       code_block.params + list_item.checked + source_block)
  sourceBlockRules.ts  markdown-it: frontmatter / ::: / :: / $name / パイプテーブルを
                       ve_source トークンとして丸ごと確保
  taskListRule.ts      markdown-it core: - [ ] / - [x] → list_item.checked
  parser.ts            MarkdownParser。createParser({breaks}) を bool でキャッシュ
                       (breaks は rendererConfig.isEnabledLinebreaks に合わせる)
  serializer.ts        MarkdownSerializer。箇条書き "-"、タスク "- [x] "、
                       source_block は生ソースをそのまま書き戻し
  roundtrip.spec.ts    往復単体テスト (app-unit / node)
prosemirror/
  keymap.ts            Mod-b 等 + リスト操作 + Mod-s → onSave + baseKeymap
  inputRules.ts        "# " "- " "> " "1. " "``` " など
  toolbar.ts           プレーン DOM ツールバー (H1-3/P, B/I/S/code, リスト, タスク,
                       引用, コード, リンク)
  sourceBlockView.ts   不透明ブロックのカード UI (「ソース編集」で textarea)
WysiwygEditorMain.tsx  ProseMirror EditorView を React でラップ。マウント時1回だけ
                       構築。debounce 400ms で onChange(markdown)
WysiwygEditorButton.tsx  下部ナビのトグルボタン
WysiwygEditorMain.module.scss  スタイル (prosemirror.css / gapcursor.css をスコープして inline)
```

統合点:
- `~/states/ui/editor/wysiwyg-mode.ts` — トグル state (jotai atom, 非永続)
- `PageEditor.tsx` — `applyMarkdownToCodeMirror` (最小差分書き戻し) と
  オーバーレイ描画。`<CodeMirrorEditorMain>` は常時マウントのまま上に重ねる。
- `EditorNavbarBottom.tsx` — `<WysiwygEditorButton>` を OptionsSelector の隣に。

## 往復テスト

`roundtrip.spec.ts`: prose / tasklist / directive / `$lsx` / frontmatter / html /
table が byte 安定 (prose のみソフトラップ結合の正規化)。

## 既知の制約

- テーブルは source_block 編集のみ (リッチ表編集は将来)
- WYSIWYG 中は他ユーザーの編集をライブマージしない (入場時スナップショット。
  ydoc には残るので消えない。重複領域は last-write-wins)
- ソフトラップは 1 行に結合される
- 書き戻しは連続 1 レンジ差分 (分散編集で相手カーソルが飛ぶ)
- markdown-it と GROWI の remark でパース差異が出る構文があり得る
  (インライン `$` / math `$…$` / nested directive)。MVP はブロックレベルのみ不透明化
- collab 同期前にトグルすると空取得の恐れ → ボタンは `codeMirrorEditor.view` が
  出来るまで押しても実質空。将来 ready フラグでガード
