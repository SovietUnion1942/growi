import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { MarkdownParser, type ParseSpec } from 'prosemirror-markdown';
import type { Node as PmNode } from 'prosemirror-model';

import { veSchema } from './schema';
import sourceBlockPlugin from './sourceBlockRules';
import taskListPlugin from './taskListRule';

const listItemAttrs = (tok: Token) => {
  const v = tok.attrGet('data-checked');
  return { checked: v == null ? null : v === 'true' };
};

const tokenMapping: Record<string, ParseSpec> = {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item', getAttrs: listItemAttrs },
  bullet_list: {
    block: 'bullet_list',
    getAttrs: (tok: Token) => ({ tight: tok.hidden }),
  },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok: Token) => ({
      order: +(tok.attrGet('start') ?? 1),
      tight: tok.hidden,
    }),
  },
  heading: {
    block: 'heading',
    getAttrs: (tok: Token) => ({ level: +tok.tag.slice(1) }),
  },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: {
    block: 'code_block',
    getAttrs: (tok: Token) => ({ params: tok.info || '' }),
    noCloseToken: true,
  },
  hr: { node: 'horizontal_rule' },
  image: {
    node: 'image',
    getAttrs: (tok: Token) => ({
      src: tok.attrGet('src'),
      title: tok.attrGet('title') || null,
      alt: (tok.children?.[0] && tok.children[0].content) || null,
    }),
  },
  hardbreak: { node: 'hard_break' },

  ve_source: {
    node: 'source_block',
    getAttrs: (tok: Token) => ({
      source: tok.content,
      kind: tok.meta?.kind ?? 'raw',
    }),
    noCloseToken: true,
  },
  html_block: {
    node: 'source_block',
    getAttrs: (tok: Token) => ({
      source: tok.content.replace(/\n$/, ''),
      kind: 'html',
    }),
    noCloseToken: true,
  },

  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 's' },
  link: {
    mark: 'link',
    getAttrs: (tok: Token) => ({
      href: tok.attrGet('href'),
      title: tok.attrGet('title') || null,
    }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
};

function buildMarkdownIt(breaks: boolean): MarkdownIt {
  const md = MarkdownIt('commonmark', { html: true, linkify: false, breaks })
    .enable(['strikethrough'])
    .disable(['table']) // パイプテーブルは ve_pipe_table が source_block として拾う
    .use(sourceBlockPlugin)
    .use(taskListPlugin);
  // インライン HTML はリッチ化せず素のテキストとして残す
  md.inline.ruler.disable('html_inline');
  return md;
}

const parserCache = new Map<boolean, MarkdownParser>();

export function getParser(breaks: boolean): MarkdownParser {
  let p = parserCache.get(breaks);
  if (p == null) {
    p = new MarkdownParser(veSchema, buildMarkdownIt(breaks), tokenMapping);
    parserCache.set(breaks, p);
  }
  return p;
}

export function markdownToDoc(markdown: string, breaks = false): PmNode {
  return (
    getParser(breaks).parse(markdown) ??
    veSchema.node('doc', null, [veSchema.node('paragraph')])
  );
}
