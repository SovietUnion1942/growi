import type { ContainerDirective } from 'mdast-util-directive';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

// Directive name a page author writes to embed the live report, e.g.:
//   :::wiki-gap-suggestions
//   :::
// Body content (if any) is ignored -- the viewer component always renders
// its own live-fetched list, mirroring the callout directive's hName/data
// wiring (features/callout/services/callout.ts).
const DIRECTIVE_NAME = 'wiki-gap-suggestions';

export const remarkPlugin: Plugin = () => {
  return (tree) => {
    visit(tree, 'containerDirective', (node: ContainerDirective) => {
      if (node.name.toLowerCase() !== DIRECTIVE_NAME) {
        return;
      }
      if (node.data == null) {
        node.data = {};
      }
      node.data.hName = 'wikiGapSuggestions';
    });
  };
};

export const sanitizeOption = {
  tagNames: ['wikiGapSuggestions'],
};
