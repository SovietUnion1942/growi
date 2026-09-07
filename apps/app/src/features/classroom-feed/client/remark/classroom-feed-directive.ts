import type { LeafDirective, TextDirective } from 'mdast-util-directive';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * Directive a page author writes to embed a read-with-body feed of recent
 * descendant pages under a path prefix, e.g.:
 *
 *   ::classroomfeed{prefix=/Classroomの投稿一覧/お知らせ limit=10}
 *
 * Unlike `lsx` (GROWI's built-in list-children directive, title/link only),
 * this renders each matched page's actual body text inline via
 * `RevisionRenderer` — see `ClassroomFeedViewer`. Data is fetched live from
 * GROWI's own Page/Revision collections (features/classroom-feed/server),
 * never duplicated into an external store.
 *
 * Standard `remark-directive` leaf/text directive, mirroring
 * `features/board/client/remark/board-directive.ts`.
 */
const DIRECTIVE_NAME = 'classroomfeed';
const SUPPORTED_ATTRIBUTES = ['prefix', 'limit'];

type DirectiveAttributes = Record<string, string | null | undefined>;

const applyClassroomFeedDirective = (
  node: LeafDirective | TextDirective,
): void => {
  if (node.name !== DIRECTIVE_NAME) {
    return;
  }

  const attributes = (node.attributes as DirectiveAttributes | undefined) ?? {};

  const data = node.data ?? {};
  node.data = data;
  data.hName = 'classroomfeed';
  data.hProperties = {
    prefix: attributes.prefix ?? '',
    limit: attributes.limit ?? '',
  };
};

export const remarkPlugin: Plugin = () => (tree) => {
  visit(tree, 'leafDirective', applyClassroomFeedDirective);
  visit(tree, 'textDirective', applyClassroomFeedDirective);
};

export const sanitizeOption = {
  tagNames: ['classroomfeed'],
  attributes: {
    classroomfeed: SUPPORTED_ATTRIBUTES,
  },
};
