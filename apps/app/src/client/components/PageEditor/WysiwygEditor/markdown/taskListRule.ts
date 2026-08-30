/**
 * markdown-it core ルール。GFM タスクリスト `- [ ] ` / `- [x] ` を検出し、
 * `list_item_open` に data-checked 属性を付け、本文から `[ ] ` 前置を除去する。
 * markdown-it-task-lists はチェックボックス用の html トークンを差し込んでくるので
 * ProseMirror パース向けには自前ルールの方が扱いやすい。
 */

import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';

const PREFIX = /^\[([ xX])\]\s+/;

function run(state: StateCore): void {
  const { tokens } = state;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'list_item_open') continue;
    const paraOpen = tokens[i + 1];
    const inline = tokens[i + 2];
    if (paraOpen?.type !== 'paragraph_open' || inline?.type !== 'inline')
      continue;

    const m = PREFIX.exec(inline.content);
    if (m == null) continue;

    const checked = m[1].toLowerCase() === 'x';
    inline.content = inline.content.slice(m[0].length);
    const first = inline.children?.[0];
    if (first?.type === 'text') {
      first.content = first.content.replace(PREFIX, '');
    } else if (inline.children != null) {
      // 先頭が装飾等で複雑なケースは子を作り直させる
      inline.children = null;
    }
    tokens[i].attrSet('data-checked', String(checked));
  }
}

export default function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 've_task_lists', run);
}
