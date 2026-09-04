import type { Processor } from 'unified';

// Built once on first render and cached (module-cache pattern, same as the
// bulk-export renderer). The unified/remark/rehype stack is a few MB, so it is
// loaded lazily here rather than at server boot — see
// apps/app/.claude/rules/server-boot-imports.md.
let cachedProcessor: Processor | undefined;

const buildProcessor = async (): Promise<Processor> => {
  const [
    { unified },
    { visit },
    { default: remarkParse },
    { default: remarkGfm },
    { default: remarkDirective },
    { default: remarkRehype },
    rehypeSanitizeMod,
    { default: rehypeStringify },
    { remarkPlugin: remarkEmoji },
  ] = await Promise.all([
    import('unified'),
    import('unist-util-visit'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-directive'),
    import('remark-rehype'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
    import('~/services/renderer/remark-plugins/emoji'),
  ]);
  const rehypeSanitize = rehypeSanitizeMod.default;
  const { defaultSchema } = rehypeSanitizeMod;

  /**
   * GROWI's block/leaf/text directives (`:::note`, `:i[x]`, …) carry no meaning
   * in the lite render — unwrap each to its children so the content survives as
   * plain flow, not an empty container or a literal `:::`.
   */
  const directiveTypes = new Set([
    'containerDirective',
    'leafDirective',
    'textDirective',
  ]);
  // biome-ignore lint/suspicious/noExplicitAny: mdast tree mutation
  const walk = (node: any): void => {
    if (!Array.isArray(node?.children)) {
      return;
    }
    // biome-ignore lint/suspicious/noExplicitAny: mdast children
    const flattened: any[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: mdast child
    for (const child of node.children as any[]) {
      if (directiveTypes.has(child?.type)) {
        flattened.push(...(child.children ?? []));
      } else {
        flattened.push(child);
      }
    }
    node.children = flattened;
    for (const child of flattened) {
      walk(child);
    }
  };
  const remarkUnwrapDirectives = () => (tree: unknown) => {
    walk(tree);
  };

  /**
   * Images can't be shown usefully on the clients the lite tier targets, so
   * every `<img>` becomes a labelled text link to the original.
   */
  const rehypeImagesToLinks = () => (tree: unknown) => {
    // biome-ignore lint/suspicious/noExplicitAny: hast visitor
    visit(tree as any, 'element', (node: any) => {
      if (node.tagName !== 'img') {
        return;
      }
      const src =
        typeof node.properties?.src === 'string' ? node.properties.src : '';
      const alt =
        typeof node.properties?.alt === 'string' &&
        node.properties.alt.length > 0
          ? node.properties.alt
          : decodeURIComponent(src.split('/').pop() ?? '画像');
      node.tagName = 'a';
      node.properties = {
        href: src,
        className: ['lite-img-link'],
        rel: ['noopener'],
      };
      node.children = [{ type: 'text', value: `🖼 図: ${alt} — 開く` }];
    });
  };

  const sanitizeSchema = {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      a: [
        ...(defaultSchema.attributes?.a ?? []),
        ['className', 'lite-img-link'] as [string, string],
      ],
    },
  } as Parameters<typeof rehypeSanitize>[0];

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkUnwrapDirectives)
    .use(remarkEmoji)
    .use(remarkRehype)
    .use(rehypeImagesToLinks)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify) as unknown as Processor;
};

/** Render a page's markdown body to a sanitized HTML fragment for the lite view. */
export const renderLiteMarkdown = async (markdown: string): Promise<string> => {
  if (cachedProcessor == null) {
    cachedProcessor = await buildProcessor();
  }
  const file = await cachedProcessor.process(markdown);
  return String(file);
};
