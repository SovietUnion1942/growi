import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOOT_ENTRYPOINTS } from '~/test-utils/boot-entrypoints';
import {
  formatViolation,
  traceStaticImportChains,
} from '~/test-utils/static-import-graph';

// --- Contract --------------------------------------------------------------
//
// The lite-ui markdown renderer pulls the full unified / remark / rehype
// stack (a few MB of RSS). It is only needed when a request actually resolves
// to the `lite` tier — a rare path — so `render-lite-markdown.ts` builds the
// processor via dynamic import() and caches it (module-cache pattern).
//
// The lite-ui handlers ARE statically reachable from server boot (routes/index
// registers them), so this walks from the boot entrypoints AND from the
// feature's own server barrel to make sure neither reaches the renderer stack
// through a static chain. `import type` lines are erased at build and skipped;
// dynamic import() is a boundary and not followed.

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const MARKDOWN_STACK =
  /^(unified|remark-parse|remark-gfm|remark-directive|remark-rehype|rehype-sanitize|rehype-stringify|unist-util-visit)($|\/)/;

const LITE_UI_ENTRYPOINTS = ['features/lite-ui/server/index.ts'];

describe('lazy-load boundary for the lite-ui markdown stack', () => {
  it('has no static import chain from the lite-ui server barrel to the unified/remark/rehype stack', () => {
    const violations = traceStaticImportChains({
      srcRoot: SRC_ROOT,
      entrypoints: LITE_UI_ENTRYPOINTS,
      bannedPattern: MARKDOWN_STACK,
    });
    const formatted = violations.map(formatViolation);
    expect(
      formatted,
      `The lite-ui server barrel must not statically reach the markdown stack.\n` +
        `Load unified/remark/rehype via the dynamic import() in ` +
        `render-lite-markdown.ts instead of a top-level import.\n\n` +
        `${formatted.join('\n\n')}`,
    ).toEqual([]);
  });

  it('has no static import chain from a boot entrypoint to the unified/remark/rehype stack', () => {
    const violations = traceStaticImportChains({
      srcRoot: SRC_ROOT,
      entrypoints: BOOT_ENTRYPOINTS,
      bannedPattern: MARKDOWN_STACK,
    });
    const formatted = violations.map(formatViolation);
    expect(
      formatted,
      `Boot entrypoints must not statically reach the lite-ui markdown stack.\n\n` +
        `${formatted.join('\n\n')}`,
    ).toEqual([]);
  });

  it('still finds the entrypoints it traces from', () => {
    for (const entry of [...LITE_UI_ENTRYPOINTS, ...BOOT_ENTRYPOINTS]) {
      expect(
        fs.existsSync(path.join(SRC_ROOT, entry)),
        `entrypoint disappeared: ${entry}`,
      ).toBe(true);
    }
  });
});
