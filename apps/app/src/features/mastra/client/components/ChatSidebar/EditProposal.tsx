import { type JSX, useState } from 'react';
import { diffLines } from 'diff';
import { useTranslation } from 'react-i18next';

import { updatePage } from '~/client/services/update-page/update-page';
import { Button } from '~/components/ui/button';
import { PageUpdateErrorCode } from '~/interfaces/apiv3';

export type EditProposalPage = {
  pageId: string;
  path: string;
  revisionId: string;
  currentBody: string;
  newBody: string;
  summary: string;
};

type Props = {
  // Unique per tool call — used to key the local approve/reject/saved state
  // so it does not leak across proposals (the AI SDK part carries this on
  // every `tool-*` part, see the ChatSidebar switch).
  toolCallId: string;
  page: EditProposalPage;
};

type LocalStatus = 'pending' | 'saving' | 'saved' | 'rejected' | 'error';

/**
 * Renders a diff between the current and proposed body of a page the
 * assistant wants to edit, alongside an explicit approve/reject choice. The
 * assistant's `proposeEditTool` call never writes to the database by itself
 * (see propose-page-edit-tool.ts) — approving here is the ONLY path that
 * actually persists the change, via the same `updatePage()` client call and
 * `/apiv3/page` update route used by the regular page editor, so permission
 * checks, revision-conflict detection, activity logging, and notifications
 * all run exactly as they do for a manual edit.
 */
export const EditProposal = ({ page }: Props): JSX.Element => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LocalStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { pageId, path, revisionId, currentBody, newBody, summary } = page;

  const handleApprove = async (): Promise<void> => {
    setStatus('saving');
    setErrorMessage(null);
    try {
      await updatePage({ pageId, revisionId, body: newBody });
      setStatus('saved');
    } catch (err) {
      // apiv3Request's catch handler throws the extracted `errors` array
      // (ErrorV3-shaped: { code, message }), not the raw axios error — see
      // apiv3-client.ts. A CONFLICT code (409, stale revisionId) is the
      // expected shape when the page changed since this proposal was
      // generated — surface a specific message so the user knows to ask the
      // assistant to redo the edit rather than retry blindly.
      const isConflict =
        Array.isArray(err) &&
        err.some(
          (e) =>
            e != null &&
            typeof e === 'object' &&
            'code' in e &&
            e.code === PageUpdateErrorCode.CONFLICT,
        );
      setErrorMessage(
        isConflict
          ? t('ai_sidebar.edit_proposal.conflict_error')
          : t('ai_sidebar.edit_proposal.save_error'),
      );
      setStatus('error');
    }
  };

  const handleReject = (): void => {
    setStatus('rejected');
  };

  const diffParts = diffLines(currentBody, newBody);

  return (
    <div
      className="tw:my-2 tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:p-3 tw:text-sm"
      data-testid="edit-proposal"
    >
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
        <p className="tw:font-medium">{t('ai_sidebar.edit_proposal.title')}</p>
        <span className="tw:text-muted-foreground">{path}</span>
      </div>

      {summary.length > 0 && (
        <p className="tw:text-muted-foreground">{summary}</p>
      )}

      <pre className="tw:max-h-64 tw:overflow-auto tw:rounded tw:border tw:border-border tw:p-2 tw:font-mono tw:text-xs tw:whitespace-pre-wrap">
        {diffParts.map((part, i) => (
          <span
            key={
              // biome-ignore lint/suspicious/noArrayIndexKey: diff parts have no stable id and are never reordered after the initial diffLines() call
              i
            }
            className={
              part.added
                ? 'tw:block tw:bg-success/15 tw:text-success-foreground'
                : part.removed
                  ? 'tw:block tw:bg-destructive/15 tw:text-destructive-foreground tw:line-through'
                  : 'tw:block'
            }
          >
            {part.value}
          </span>
        ))}
      </pre>

      {status === 'pending' && (
        <>
          <p className="tw:text-muted-foreground">
            {t('ai_sidebar.edit_proposal.not_saved_notice')}
          </p>
          <div className="tw:flex tw:justify-end tw:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReject}
            >
              {t('ai_sidebar.edit_proposal.reject')}
            </Button>
            <Button type="button" size="sm" onClick={handleApprove}>
              {t('ai_sidebar.edit_proposal.approve')}
            </Button>
          </div>
        </>
      )}

      {status === 'saving' && (
        <p className="tw:text-muted-foreground">
          {t('ai_sidebar.edit_proposal.saving')}
        </p>
      )}

      {status === 'saved' && (
        <p className="tw:font-medium tw:text-success-foreground">
          {t('ai_sidebar.edit_proposal.saved')}
        </p>
      )}

      {status === 'rejected' && (
        <p className="tw:text-muted-foreground">
          {t('ai_sidebar.edit_proposal.rejected')}
        </p>
      )}

      {status === 'error' && (
        <>
          <p className="tw:font-medium tw:text-destructive">{errorMessage}</p>
          <div className="tw:flex tw:justify-end tw:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReject}
            >
              {t('ai_sidebar.edit_proposal.reject')}
            </Button>
            <Button type="button" size="sm" onClick={handleApprove}>
              {t('ai_sidebar.edit_proposal.approve')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
