import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
} from 'prosemirror-markdown';
import type { Node as PmNode } from 'prosemirror-model';

const base = defaultMarkdownSerializer;

export const serializer = new MarkdownSerializer(
  {
    blockquote: base.nodes.blockquote,
    code_block: base.nodes.code_block,
    heading: base.nodes.heading,
    horizontal_rule: base.nodes.horizontal_rule,
    hard_break: base.nodes.hard_break,
    image: base.nodes.image,
    text: base.nodes.text,

    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },

    ordered_list: base.nodes.ordered_list,

    bullet_list(state, node) {
      state.renderList(node, '  ', (i) => {
        const item = node.child(i);
        const c = item.attrs.checked as boolean | null;
        const box = c === true ? '[x] ' : c === false ? '[ ] ' : '';
        return `- ${box}`;
      });
    },

    list_item(state, node) {
      state.renderContent(node);
    },

    // GROWI 独自記法 / 生 HTML / テーブル / frontmatter。生ソースをそのまま書き戻す。
    source_block(state, node) {
      state.text(node.attrs.source as string, false);
      state.closeBlock(node);
    },
  },
  {
    em: base.marks.em,
    strong: base.marks.strong,
    link: base.marks.link,
    code: base.marks.code,
    s: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
);

export function docToMarkdown(doc: PmNode): string {
  return serializer.serialize(doc, { tightLists: true });
}
