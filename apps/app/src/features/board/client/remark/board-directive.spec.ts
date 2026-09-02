import type { LeafDirective } from 'mdast-util-directive';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { remarkPlugin } from './board-directive';

const runDirective = (markdown: string): LeafDirective | undefined => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkPlugin);
  const tree = processor.parse(markdown);
  processor.runSync(tree);

  let directiveNode: LeafDirective | undefined;
  visit(tree, 'leafDirective', (node) => {
    directiveNode = node;
  });
  return directiveNode;
};

describe('remarkPlugin (board directive)', () => {
  it('transforms ::board{id=foo} into a board hast node carrying the id', () => {
    const node = runDirective('::board{id=physics-lab}\n');

    expect(node?.data?.hName).toBe('board');
    expect(node?.data?.hProperties).toMatchObject({ id: 'physics-lab' });
  });

  it('accepts the bare-value shorthand ::board{foo}', () => {
    const node = runDirective('::board{physics-lab}\n');

    expect(node?.data?.hProperties).toMatchObject({ id: 'physics-lab' });
  });

  it('passes a height attribute through', () => {
    const node = runDirective('::board{id=foo height=800}\n');

    expect(node?.data?.hProperties).toMatchObject({ id: 'foo', height: '800' });
  });

  it('leaves an unrelated directive untouched', () => {
    const node = runDirective('::other{id=foo}\n');

    expect(node?.data?.hName).toBeUndefined();
  });
});
