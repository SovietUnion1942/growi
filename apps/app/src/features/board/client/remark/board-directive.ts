import type { LeafDirective, TextDirective } from 'mdast-util-directive';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * Directive a page author writes to embed an infinite canvas (Miro-like)
 * board, e.g.:
 *
 *   ::board{id=physics-lab-layout}
 *   ::board{id=physics-lab-layout height=800}
 *   ::board{physics-lab-layout}          (bare-value shorthand for id)
 *
 * The canvas itself lives outside the wiki (its own Y.Doc, persisted in the
 * `board-yjs-writings` collection -- see features/board/server). The
 * directive only names *which* board id to open, so the same id embedded on
 * two pages shows the same canvas, and deleting a page never deletes a
 * board.
 *
 * A standard `remark-directive` leaf/text directive (registered in
 * `services/renderer/renderer.tsx`), mirroring `remark-plugins/echo-directive`.
 */
const DIRECTIVE_NAME = 'board';
const SUPPORTED_ATTRIBUTES = ['id', 'height'];

type DirectiveAttributes = Record<string, string | null | undefined>;

const applyBoardDirective = (node: LeafDirective | TextDirective): void => {
  if (node.name !== DIRECTIVE_NAME) {
    return;
  }

  const attributes = (node.attributes as DirectiveAttributes | undefined) ?? {};

  // `::board{physics-lab}` -> id="physics-lab" (micromark yields it as a
  // valueless attribute key).
  let id = attributes.id ?? '';
  if (id === '') {
    const [firstKey, firstValue] = Object.entries(attributes)[0] ?? [];
    if (firstKey != null && (firstValue === '' || firstValue == null)) {
      id = firstKey;
    }
  }

  const data = node.data ?? {};
  node.data = data;
  data.hName = 'board';
  data.hProperties = {
    id,
    height: attributes.height ?? '',
  };
};

export const remarkPlugin: Plugin = () => (tree) => {
  visit(tree, 'leafDirective', applyBoardDirective);
  visit(tree, 'textDirective', applyBoardDirective);
};

export const sanitizeOption = {
  tagNames: ['board'],
  attributes: {
    board: SUPPORTED_ATTRIBUTES,
  },
};
