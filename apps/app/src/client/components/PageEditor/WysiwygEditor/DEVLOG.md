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

## 改善 4 点 (2026-09-04)

### #1 テーブルグリッドエディタ
`prosemirror/tableGrid.ts` — `source_block(kind='table')` のカード内に表グリッド。
`MarkdownTable.fromMarkdownString` でパース → セル `<input>` / 列揃え `<select>` /
行列の追加削除 → `new MarkdownTable(cells, {align, pad}).normalizeCells().toString()` で
再シリアライズ → `onCommit` で `setNodeMarkup`。解析不能(`\|` 等)は throw → textarea fallback。
テーブルは不透明ブロックのまま(往復保護)。セル内 inline markdown は raw 表示。

### #2 外部編集の自動マージ
`WysiwygHandle.applyExternalMarkdown` + `prosemirror/nodeRangeDiff.ts`。
非 writeback の CM 変更(= 他ユーザー編集)を検知 → 先頭/末尾一致するトップレベル
子ノードを除いた 1 レンジを `replaceWith`(meta `ve-external`、履歴に積まない、
スクロール据え置き)。選択は 範囲前=不変 / 後=マッピング / 内=範囲先頭にクランプ。
ユーザー編集中(debounce 保留)は先にローカルを flush → Yjs マージ後に親が再度
`applyExternalMarkdown` を呼ぶ(1 サイクル遅延で収束)。`ve-external` は flush しないので発振しない。
`lineDiff.ts` — 書き戻し diff を文字単位 → 行単位に変更(交錯時の破壊的結合を抑止)。

### #3 per-user「デフォルトでビジュアル」
`EditorSettings.defaultToWysiwyg`(consts / validator / PUT / model / swagger)。
`OptionsSelector` に SwitchItem。`PageEditor` で編集入場時に 1 回だけ `setWysiwygMode(true)`。

### #4 i18n
`page_edit.wysiwyg.*`(ja/en)。`labels.ts` の `useWysiwygLabels()` が `t()` から
文字列を組み、React 外の toolbar / NodeView / grid へ props で注入。JP fallback は各所に残置。

## 残る既知の制約

- セル内の inline markdown はグリッドで raw 表示(リッチ化は将来)
- #2 のカーソルクランプは遠隔編集が同段落に来た場合、段落頭に寄る
  (`prosemirror-recreate-transform` なら綺麗だが依存追加を避けた)
- #1 のグリッド/textarea フォーカス中に #2 の reconcile 範囲に入ると編集中セルが失われうる
- ソフトラップは 1 行に結合される
- markdown-it と GROWI の remark のパース差異が出る構文はブロック単位で不透明化のみ
- collab 同期前にトグルすると空取得の恐れ(将来 ready フラグでガード)
