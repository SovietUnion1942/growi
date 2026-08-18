// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PageUpdateErrorCode } from '~/interfaces/apiv3';

import { EditProposal } from './EditProposal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mocks = vi.hoisted(() => ({
  updatePage: vi.fn(),
}));

vi.mock('~/client/services/update-page/update-page', () => ({
  updatePage: mocks.updatePage,
}));

const buildPage = (
  overrides: Partial<Parameters<typeof EditProposal>[0]['page']> = {},
) => ({
  pageId: 'page-1',
  path: '/Sandbox/Alpha',
  revisionId: 'rev-1',
  currentBody: 'line1\nline2',
  newBody: 'line1\nline2 changed',
  summary: 'fix typo',
  ...overrides,
});

describe('EditProposal', () => {
  beforeEach(() => {
    mocks.updatePage.mockReset();
  });

  it('renders the diff and the not-saved notice before any action', () => {
    render(<EditProposal toolCallId="call-1" page={buildPage()} />);

    expect(
      screen.getByText('ai_sidebar.edit_proposal.not_saved_notice'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai_sidebar.edit_proposal.approve' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai_sidebar.edit_proposal.reject' }),
    ).toBeInTheDocument();
  });

  it('calls updatePage with the pageId/revisionId/newBody and shows "saved" on approve', async () => {
    mocks.updatePage.mockResolvedValue({});
    const user = userEvent.setup();
    render(<EditProposal toolCallId="call-1" page={buildPage()} />);

    await user.click(
      screen.getByRole('button', { name: 'ai_sidebar.edit_proposal.approve' }),
    );

    expect(mocks.updatePage).toHaveBeenCalledWith({
      pageId: 'page-1',
      revisionId: 'rev-1',
      body: 'line1\nline2 changed',
    });
    await waitFor(() => {
      expect(
        screen.getByText('ai_sidebar.edit_proposal.saved'),
      ).toBeInTheDocument();
    });
    // Buttons disappear once saved — no further action possible.
    expect(
      screen.queryByRole('button', {
        name: 'ai_sidebar.edit_proposal.approve',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows the conflict message when updatePage rejects with a CONFLICT ErrorV3', async () => {
    mocks.updatePage.mockRejectedValue([
      { code: PageUpdateErrorCode.CONFLICT, message: 'stale revision' },
    ]);
    const user = userEvent.setup();
    render(<EditProposal toolCallId="call-1" page={buildPage()} />);

    await user.click(
      screen.getByRole('button', { name: 'ai_sidebar.edit_proposal.approve' }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('ai_sidebar.edit_proposal.conflict_error'),
      ).toBeInTheDocument();
    });
  });

  it('shows the generic save-error message for a non-conflict failure', async () => {
    mocks.updatePage.mockRejectedValue([
      { code: PageUpdateErrorCode.FORBIDDEN, message: 'forbidden' },
    ]);
    const user = userEvent.setup();
    render(<EditProposal toolCallId="call-1" page={buildPage()} />);

    await user.click(
      screen.getByRole('button', { name: 'ai_sidebar.edit_proposal.approve' }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('ai_sidebar.edit_proposal.save_error'),
      ).toBeInTheDocument();
    });
  });

  it('marks the proposal as rejected without calling updatePage', async () => {
    const user = userEvent.setup();
    render(<EditProposal toolCallId="call-1" page={buildPage()} />);

    await user.click(
      screen.getByRole('button', { name: 'ai_sidebar.edit_proposal.reject' }),
    );

    expect(
      screen.getByText('ai_sidebar.edit_proposal.rejected'),
    ).toBeInTheDocument();
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });
});
