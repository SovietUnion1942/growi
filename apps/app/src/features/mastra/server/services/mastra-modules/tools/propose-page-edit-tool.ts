import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import mongoose from 'mongoose';
import { z } from 'zod';

import { populateDataToShowRevision } from '~/server/models/obsolete-page';
import type { PageDocument, PageModel } from '~/server/models/page';
import loggerFactory from '~/utils/logger';

import type { MastraRequestContextShape } from '../types/request-context';

const logger = loggerFactory('growi:tools:propose-page-edit-tool');

// Typed view of RequestContext bound to the shared shape so that
// ctx.get('user') is statically inferred.
type TypedRequestContext = RequestContext<MastraRequestContextShape>;

const inputSchema = z
  .object({
    pageId: z.string().optional().describe('MongoDB ObjectId of the page'),
    pagePath: z.string().optional().describe('Page path starting with "/"'),
    newBody: z
      .string()
      .describe(
        'The FULL new Markdown body the page should have after the edit (not a diff/patch, and not only the changed section) — this replaces the entire current body.',
      ),
    summary: z
      .string()
      .describe('A short, human-readable summary of what changed and why.'),
  })
  .refine((input) => input.pageId != null || input.pagePath != null, {
    message: 'Either pageId or pagePath must be provided',
  });

const outputSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('ok'),
    page: z.object({
      pageId: z.string(),
      path: z.string(),
      // The revision the proposal was based on. The client sends this back
      // as `revisionId` when the user approves, so the existing update API's
      // optimistic-concurrency check rejects a stale proposal (409) rather
      // than silently overwriting a page someone else edited in the
      // meantime.
      revisionId: z.string(),
      currentBody: z.string(),
      newBody: z.string(),
      summary: z.string(),
    }),
  }),
  z.object({
    result: z.enum([
      'not_found_or_forbidden',
      'missing_input',
      'context_error',
    ]),
    reason: z.string(),
  }),
]);

export type ProposePageEditToolOutput = z.infer<typeof outputSchema>;

export const proposePageEditTool = createTool({
  id: 'propose-page-edit-tool',
  description:
    "Propose an edit to an existing wiki page by pageId or pagePath. This does NOT save anything — it only returns the current body alongside the proposed new body so the user can review a diff and explicitly approve or reject the change in the UI. Always call getPageContentTool first to read the page (the newBody you pass here must be the FULL resulting body, not a partial patch). Never tell the user the page has been saved after calling this tool — only the user's own approval action in the UI persists the change.",
  inputSchema,
  outputSchema,

  execute: async (inputData, context) => {
    const { pageId, pagePath, newBody, summary } = inputData;

    const ctx = context.requestContext as TypedRequestContext;
    const user = ctx.get('user');

    // Defensive context guard, mirrors get-page-content-tool.ts.
    if (user == null) {
      logger.warn('propose-page-edit-tool: missing user in requestContext');
      return {
        result: 'context_error' as const,
        reason: 'user missing in requestContext',
      };
    }

    // Defense-in-depth runtime check backing zod's refine.
    if (pageId == null && pagePath == null) {
      return {
        result: 'missing_input' as const,
        reason: 'pageId or pagePath required',
      };
    }

    const Page = mongoose.model<PageDocument, PageModel>('Page');

    try {
      // Viewer permission is sufficient here: this tool never writes to the
      // database. Edit authorization and revision-conflict detection are
      // enforced later, at approval time, by the existing
      // POST /apiv3/page update route — this tool must not duplicate that
      // logic (see update-page.ts).
      const page =
        pageId != null
          ? await Page.findByIdAndViewer(pageId, user)
          : await Page.findByPathAndViewer(
              pagePath as string,
              user,
              null,
              true,
            );

      if (page == null) {
        return {
          result: 'not_found_or_forbidden' as const,
          reason: 'page not found or viewer is not permitted',
        };
      }

      await populateDataToShowRevision(page, '');

      const revision =
        page.revision != null && typeof page.revision === 'object'
          ? (page.revision as { _id?: unknown; body?: unknown })
          : undefined;
      const currentBody = String(revision?.body ?? '');
      const revisionId = revision?._id != null ? String(revision._id) : null;

      if (revisionId == null) {
        return {
          result: 'not_found_or_forbidden' as const,
          reason: 'page has no current revision',
        };
      }

      return {
        result: 'ok' as const,
        page: {
          pageId: String(page._id),
          path: page.path,
          revisionId,
          currentBody,
          newBody,
          summary,
        },
      };
    } catch (err) {
      // Never throw out of execute — convert into a structured failure so
      // the agent loop can continue, mirroring get-page-content-tool.ts.
      logger.error('propose-page-edit-tool failed', err);
      const reason =
        err instanceof Error && err.message.length > 0
          ? err.message
          : 'fetch_failed';
      return {
        result: 'not_found_or_forbidden' as const,
        reason,
      };
    }
  },
});
