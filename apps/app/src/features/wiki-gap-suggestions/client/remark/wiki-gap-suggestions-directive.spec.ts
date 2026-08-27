import type { ContainerDirective } from 'mdast-util-directive';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { remarkPlugin } from './wiki-gap-suggestions-directive';

const runDirective = (markdown: string): ContainerDirective | undefined => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkPlugin);
  const tree = processor.parse(markdown);
  processor.runSync(tree);

  let directiveNode: ContainerDirective | undefined;
  visit(tree, 'containerDirective', (node) => {
    directiveNode = node;
  });
  return directiveNode;
};

describe('remarkPlugin (wiki-gap-suggestions directive)', () => {
  it('transforms :::wiki-gap-suggestions into a wikiGapSuggestions hast node', () => {
    const node = runDirective(':::wiki-gap-suggestions\n:::\n');

    expect(node).toBeDefined();
    expect(node?.data?.hName).toBe('wikiGapSuggestions');
  });

  it('is case-insensitive on the directive name', () => {
    const node = runDirective(':::Wiki-Gap-Suggestions\n:::\n');

    expect(node?.data?.hName).toBe('wikiGapSuggestions');
  });

  it('leaves an unrelated directive untouched', () => {
    const node = runDirective(':::info\nsomething\n:::\n');

    expect(node?.data?.hName).toBeUndefined();
  });
});
