// @vitest-environment happy-dom

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

import UserPictureList from './UserPictureList';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  _id: 'user1',
  name: 'Alice',
  username: 'alice',
  ...overrides,
});

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('UserPictureList', () => {
  it('renders a badge icon for a user that has badgeSummaryCached entries', () => {
    const users = [
      makeUser({ _id: 'user1', badgeSummaryCached: makeBadgeSummaryFixture() }),
    ];

    render(<UserPictureList users={users} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('renders no badge icon when users have no badgeSummaryCached (backward-compat with existing callers)', () => {
    const users = [
      makeUser({ _id: 'user1' }),
      makeUser({ _id: 'user2', name: 'Bob' }),
    ];

    render(<UserPictureList users={users} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });

  it('renders no badge icon at all when no users are passed (default empty list)', () => {
    const { container } = render(<UserPictureList />);

    expect(container).toBeEmptyDOMElement();
  });

  it('attributes badges to only the users that have them, without cross-item bleed', () => {
    const users = [
      makeUser({
        _id: 'user1',
        name: 'Alice',
        badgeSummaryCached: makeBadgeSummaryFixture(),
      }),
      makeUser({ _id: 'user2', name: 'Bob' }),
    ];

    render(<UserPictureList users={users} />);

    const badgeIcons = screen.getAllByTestId('user-picture-badge');
    expect(badgeIcons).toHaveLength(1);
  });
});
