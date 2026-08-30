import {
  ellipsis,
  emDash,
  inputRules,
  smartQuotes,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules';
import type { Schema } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';

export function buildInputRules(schema: Schema): Plugin {
  const rules = [
    ...smartQuotes,
    ellipsis,
    emDash,

    // "> " で引用
    wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),

    // "1. " で番号リスト
    wrappingInputRule(
      /^(\d+)\.\s$/,
      schema.nodes.ordered_list,
      (m) => ({ order: +m[1] }),
      (m, node) => node.childCount + node.attrs.order === +m[1],
    ),

    // "- " "* " "+ " で箇条書き
    wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),

    // "``` " でコードブロック
    textblockTypeInputRule(/^```$/, schema.nodes.code_block),

    // "# " 〜 "###### " で見出し
    textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (m) => ({
      level: m[1].length,
    })),
  ];
  return inputRules({ rules });
}
