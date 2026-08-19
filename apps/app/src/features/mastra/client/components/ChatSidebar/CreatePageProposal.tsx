import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createPage } from '~/client/services/create-page/create-page';
import { Button } from '~/components/ui/button';

export type CreatePageProposalPage = {
  path: string;
  body: string;
  summary: string;
};

type Props = {
  // Unique per tool call — used to key the local approve/reject/created state
  // so it does not leak across proposals (the AI SDK part carries this on
  // every `tool-*` part, see the ChatSidebar switch).
  toolCallId: string;
  page: CreatePageProposalPage;
};

type LocalStatus = 'pending' | 'creating' | 'created' | 'rejected' | 'error';

/**
 * Renders the path and body of a page the assistant wants to create,
 * alongside an explicit approve/reject choice. The assistant's
 * `proposeCreateTool` call never writes to the database by itself (see
 * propose-page-create-tool.ts) — approving here is the ONLY path that
 * actually creates the page, via the same `createPage()` client call and
 * `/apiv3/page` create route used by the "New Page" button, so permission
 * checks, path validation, activity logging, and notifications all run
 * exactly as they do for a manually created page.
 */
export const CreatePageProposal = ({ page }: Props): JSX.Element => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LocalStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { path, body, summary } = page;

  const handleApprove = async (): Promise<void> => {
    setStatus('creating');
    setErrorMessage(null);
    try {
      await createPage({ path, body });
      setStatus('created');
    } catch {
      setErrorMessage(t('ai_sidebar.create_proposal.create_error'));
      setStatus('error');
    }
  };

  const handleReject = (): void => {
    setStatus('rejected');
  };

  return (
    <div
      className="tw:my-2 tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-border tw:p-3 tw:text-sm"
      data-testid="create-page-proposal"
    >
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
        <p className="tw:font-medium">
          {t('ai_sidebar.create_proposal.title')}
        </p>
        <span className="tw:text-muted-foreground">{path}</span>
      </div>

      {summary.length > 0 && (
        <p className="tw:text-muted-foreground">{summary}</p>
      )}

      <pre className="tw:max-h-64 tw:overflow-auto tw:rounded tw:border tw:border-border tw:p-2 tw:font-mono tw:text-xs tw:whitespace-pre-wrap">
        {body}
      </pre>

      {status === 'pending' && (
        <>
          <p className="tw:text-muted-foreground">
            {t('ai_sidebar.create_proposal.not_created_notice')}
          </p>
          <div className="tw:flex tw:justify-end tw:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReject}
            >
              {t('ai_sidebar.create_proposal.reject')}
            </Button>
            <Button type="button" size="sm" onClick={handleApprove}>
              {t('ai_sidebar.create_proposal.approve')}
            </Button>
          </div>
        </>
      )}

      {status === 'creating' && (
        <p className="tw:text-muted-foreground">
          {t('ai_sidebar.create_proposal.creating')}
        </p>
      )}

      {status === 'created' && (
        <p className="tw:font-medium tw:text-success-foreground">
          {t('ai_sidebar.create_proposal.created')}
        </p>
      )}

      {status === 'rejected' && (
        <p className="tw:text-muted-foreground">
          {t('ai_sidebar.create_proposal.rejected')}
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
              {t('ai_sidebar.create_proposal.reject')}
            </Button>
            <Button type="button" size="sm" onClick={handleApprove}>
              {t('ai_sidebar.create_proposal.approve')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
