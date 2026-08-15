// @vitest-environment happy-dom

import type { IPageHasId } from '@growi/core';
import { render, screen } from '@testing-library/react';

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), events: { on: vi.fn(), off: vi.fn() } }),
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useSWRxBadgeTypeCatalog = vi.fn();
vi.mock('~/features/user-badge/client/stores/badge-type-catalog', () => ({
  useSWRxBadgeTypeCatalog: (...args: unknown[]) =>
    useSWRxBadgeTypeCatalog(...args),
}));

vi.mock('~/client/components/FormattedDistanceDate', () => ({
  default: () => <span data-testid="mock-formatted-distance-date" />,
}));

vi.mock('~/components/Common/PagePathHierarchicalLink', () => ({
  PagePathHierarchicalLink: () => <span data-testid="mock-page-path" />,
}));

import { PageItem } from './RecentChangesSubstance';

const basePage = {
  _id: 'page1',
  path: '/foo/bar',
  grant: 1,
  wip: false,
  tags: [],
  seenUsers: [],
  commentCount: 0,
  updatedAt: new Date().toISOString(),
} as unknown as IPageHasId;

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('PageItem', () => {
  it('renders a badge icon when lastUpdateUser has badgeSummaryCached entries', () => {
    const page = {
      ...basePage,
      lastUpdateUser: {
        _id: 'user1',
        name: 'Alice',
        username: 'alice',
        badgeSummaryCached: [
          {
            badgeType: 'badge-type-1',
            iconKey: 'star',
            name: 'Top Contributor',
            level: 3,
          },
        ],
      },
    } as unknown as IPageHasId;

    render(<PageItem page={page} isSmall={false} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon when lastUpdateUser has no badgeSummaryCached', () => {
    const page = {
      ...basePage,
      lastUpdateUser: {
        _id: 'user1',
        name: 'Alice',
        username: 'alice',
      },
    } as unknown as IPageHasId;

    render(<PageItem page={page} isSmall={false} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });

  it('does not crash when lastUpdateUser is missing', () => {
    const page = { ...basePage, lastUpdateUser: undefined } as IPageHasId;

    render(<PageItem page={page} isSmall={false} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });
});
