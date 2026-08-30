/**
 * 編集ビュー用の ProseMirror スキーマ。
 *
 * prosemirror-markdown 同梱の schema はマークに toDOM が無く EditorView で
 * 使えないため、schema-basic + schema-list をベースに以下を足す:
 *   - s (打ち消し線) マーク
 *   - list_item に checked 属性(GFM タスクリスト)
 *   - source_block: GROWI 独自の `:::` ブロック / 生 HTML / テーブル等を
 *     リッチ変換せず生ソースのまま保持する不透明ノード
 */

import { type MarkSpec, type NodeSpec, Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

const listNodes = addListNodes(basic.spec.nodes, 'paragraph block*', 'block');

const listItem: NodeSpec = {
  ...(listNodes.get('list_item') as NodeSpec),
  attrs: { checked: { default: null } },
  toDOM(node) {
    const checked = node.attrs.checked as boolean | null;
    if (checked === null) return ['li', 0];
    return [
      'li',
      { 'data-checked': String(checked), class: 've-task-item' },
      [
        'span',
        { class: 've-task-box', contenteditable: 'false' },
        checked ? '☑' : '☐',
      ],
      ['div', { class: 've-task-body' }, 0],
    ];
  },
  parseDOM: [
    {
      tag: 'li[data-checked]',
      getAttrs: (dom) => ({
        checked: (dom as HTMLElement).getAttribute('data-checked') === 'true',
      }),
      contentElement: '.ve-task-body',
    },
    { tag: 'li' },
  ],
};

const sourceBlock: NodeSpec = {
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  attrs: {
    source: { default: '' },
    // 'container' | 'directive' | 'table' | 'html' | 'frontmatter' | 'raw'
    kind: { default: 'raw' },
  },
  toDOM(node) {
    return [
      'div',
      {
        class: 've-source-block',
        'data-source-block': '',
        'data-kind': node.attrs.kind as string,
      },
      node.attrs.source as string,
    ];
  },
  parseDOM: [
    {
      tag: 'div[data-source-block]',
      getAttrs: (dom) => ({
        source: (dom as HTMLElement).textContent ?? '',
        kind: (dom as HTMLElement).getAttribute('data-kind') ?? 'raw',
      }),
      preserveWhitespace: 'full',
    },
  ],
};

// code_block に言語(info string)を保持する params 属性を足す
const codeBlock: NodeSpec = {
  ...(listNodes.get('code_block') as NodeSpec),
  attrs: { params: { default: '' } },
  toDOM(node) {
    return [
      'pre',
      node.attrs.params ? { 'data-params': node.attrs.params as string } : {},
      ['code', 0],
    ];
  },
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full',
      getAttrs: (dom) => ({
        params: (dom as HTMLElement).getAttribute('data-params') ?? '',
      }),
    },
  ],
};

let nodes = listNodes.update('list_item', listItem);
nodes = nodes.update('code_block', codeBlock);
nodes = nodes.addToEnd('source_block', sourceBlock);

const strike: MarkSpec = {
  parseDOM: [
    { tag: 's' },
    { tag: 'del' },
    { tag: 'strike' },
    { style: 'text-decoration=line-through' },
    { style: 'text-decoration-line=line-through' },
  ],
  toDOM: () => ['s', 0],
};

const marks = basic.spec.marks.addToEnd('s', strike);

export const veSchema = new Schema({ nodes, marks });
