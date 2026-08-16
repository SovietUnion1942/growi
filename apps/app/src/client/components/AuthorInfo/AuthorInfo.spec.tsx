// @vitest-environment happy-dom

import type { IUserHasId } from '@growi/core';
import { render, screen } from '@testing-library/react';

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useSWRxBadgeTypeCatalog = vi.fn();
vi.mock('~/features/user-badge/client/stores/badge-type-catalog', () => ({
  useSWRxBadgeTypeCatalog: (...args: unknown[]) =>
    useSWRxBadgeTypeCatalog(...args),
}));

import { makeBadgeSummaryFixture } from '~/features/user-badge/test-utils/badge-summary-fixture';

import { AuthorInfo } from './AuthorInfo';

const baseUser = {
  _id: 'user1',
  name: 'Alice',
  username: 'alice',
} as unknown as IUserHasId;

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('AuthorInfo', () => {
  it('renders a badge icon in footer locate when user has badgeSummaryCached entries', () => {
    const user = {
      ...baseUser,
      badgeSummaryCached: makeBadgeSummaryFixture(),
    } as unknown as IUserHasId;

    render(
      <AuthorInfo
        user={user}
        date={new Date()}
        mode="update"
        locate="footer"
      />,
    );

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('renders a badge icon in pageSide locate when user has badgeSummaryCached entries', () => {
    const user = {
      ...baseUser,
      badgeSummaryCached: makeBadgeSummaryFixture(),
    } as unknown as IUserHasId;

    render(
      <AuthorInfo
        user={user}
        date={new Date()}
        mode="create"
        locate="pageSide"
      />,
    );

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon when user has no badgeSummaryCached', () => {
    render(
      <AuthorInfo
        user={baseUser}
        date={new Date()}
        mode="update"
        locate="footer"
      />,
    );

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });

  it('does not crash and renders no badge when user is an unpopulated ref', () => {
    render(
      <AuthorInfo
        user={'user1' as unknown as IUserHasId}
        date={new Date()}
        mode="update"
        locate="footer"
      />,
    );

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });
});
