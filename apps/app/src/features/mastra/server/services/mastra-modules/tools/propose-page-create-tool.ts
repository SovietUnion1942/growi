import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import loggerFactory from '~/utils/logger';

import type { MastraRequestContextShape } from '../types/request-context';

const logger = loggerFactory('growi:tools:propose-page-create-tool');

// Kept in sync with propose-page-edit-tool.ts's AI_EDIT_PROTECTED_PATHS —
// see that file's comment for why this guard exists (the Discord bot's
// shared service account has edit rights on these admin-managed pages
// purely as a side effect of needing viewer access, so the AI flow must
// refuse to touch them regardless of who is asking).
const AI_EDIT_PROTECTED_PATHS = ['/メンバー/アカウント対応表'];

// Typed view of RequestContext bound to the shared shape so that
// ctx.get('user') is statically inferred.
type TypedRequestContext = RequestContext<MastraRequestContextShape>;

const inputSchema = z.object({
  path: z
    .string()
    .describe(
      'The full path of the new page, starting with "/" (e.g. "/資料/内部仕様/新しいページ"). Must not be an existing page — use proposeEditTool for that instead.',
    ),
  body: z
    .string()
    .describe('The FULL Markdown body the new page should be created with.'),
  summary: z
    .string()
    .describe(
      'A short, human-readable summary of what this new page is and why it is being created.',
    ),
});

const outputSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('ok'),
    page: z.object({
      path: z.string(),
      body: z.string(),
      summary: z.string(),
    }),
  }),
  z.object({
    result: z.enum(['missing_input', 'context_error', 'forbidden_path']),
    reason: z.string(),
  }),
]);

export type ProposePageCreateToolOutput = z.infer<typeof outputSchema>;

export const proposePageCreateTool = createTool({
  id: 'propose-page-create-tool',
  description:
    "Propose creating a brand-new wiki page at a given path with given content. This does NOT create anything — it only returns the proposed path/body so the user can review it and explicitly approve or reject the creation in the UI. Whether the path already exists is checked at approval time (the same way a stale-revision conflict is checked for edits), so this tool does not need to check existence itself. Never tell the user the page has been created after calling this tool — only the user's own approval action in the UI creates it.",
  inputSchema,
  outputSchema,

  // biome-ignore lint/suspicious/useAwait: createTool's execute type requires a Promise-returning function; this one has no DB access to await (see class doc)
  execute: async (inputData, context) => {
    const { path, body, summary } = inputData;

    const ctx = context.requestContext as TypedRequestContext;
    const user = ctx.get('user');

    // Defensive context guard, mirrors propose-page-edit-tool.ts.
    if (user == null) {
      logger.warn('propose-page-create-tool: missing user in requestContext');
      return {
        result: 'context_error' as const,
        reason: 'user missing in requestContext',
      };
    }

    if (path.length === 0 || !path.startsWith('/')) {
      return {
        result: 'missing_input' as const,
        reason: 'path must be a non-empty string starting with "/"',
      };
    }

    if (AI_EDIT_PROTECTED_PATHS.includes(path)) {
      return {
        result: 'forbidden_path' as const,
        reason:
          'this page can only be created/edited directly by an administrator',
      };
    }

    return {
      result: 'ok' as const,
      page: { path, body, summary },
    };
  },
});
