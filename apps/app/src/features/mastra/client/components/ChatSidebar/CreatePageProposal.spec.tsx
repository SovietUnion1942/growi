// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CreatePageProposal } from './CreatePageProposal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mocks = vi.hoisted(() => ({
  createPage: vi.fn(),
}));

vi.mock('~/client/services/create-page/create-page', () => ({
  createPage: mocks.createPage,
}));

const buildPage = (
  overrides: Partial<Parameters<typeof CreatePageProposal>[0]['page']> = {},
) => ({
  path: '/Sandbox/NewPage',
  body: '# New page\ncontent',
  summary: 'new page proposal',
  ...overrides,
});

describe('CreatePageProposal', () => {
  beforeEach(() => {
    mocks.createPage.mockReset();
  });

  it('renders the proposed path/body and the not-created notice before any action', () => {
    render(<CreatePageProposal toolCallId="call-1" page={buildPage()} />);

    expect(
      screen.getByText('ai_sidebar.create_proposal.not_created_notice'),
    ).toBeInTheDocument();
    expect(screen.getByText('/Sandbox/NewPage')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'ai_sidebar.create_proposal.approve',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai_sidebar.create_proposal.reject' }),
    ).toBeInTheDocument();
  });

  it('calls createPage with the path/body and shows "created" on approve', async () => {
    mocks.createPage.mockResolvedValue({});
    const user = userEvent.setup();
    render(<CreatePageProposal toolCallId="call-1" page={buildPage()} />);

    await user.click(
      screen.getByRole('button', {
        name: 'ai_sidebar.create_proposal.approve',
      }),
    );

    expect(mocks.createPage).toHaveBeenCalledWith({
      path: '/Sandbox/NewPage',
      body: '# New page\ncontent',
    });
    await waitFor(() => {
      expect(
        screen.getByText('ai_sidebar.create_proposal.created'),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', {
        name: 'ai_sidebar.create_proposal.approve',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows an error message when createPage fails', async () => {
    mocks.createPage.mockRejectedValue([{ code: 'could_not_create_page' }]);
    const user = userEvent.setup();
    render(<CreatePageProposal toolCallId="call-1" page={buildPage()} />);

    await user.click(
      screen.getByRole('button', {
        name: 'ai_sidebar.create_proposal.approve',
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('ai_sidebar.create_proposal.create_error'),
      ).toBeInTheDocument();
    });
  });

  it('marks the proposal as rejected without calling createPage', async () => {
    const user = userEvent.setup();
    render(<CreatePageProposal toolCallId="call-1" page={buildPage()} />);

    await user.click(
      screen.getByRole('button', { name: 'ai_sidebar.create_proposal.reject' }),
    );

    expect(
      screen.getByText('ai_sidebar.create_proposal.rejected'),
    ).toBeInTheDocument();
    expect(mocks.createPage).not.toHaveBeenCalled();
  });
});
