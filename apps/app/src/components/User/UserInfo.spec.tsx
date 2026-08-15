// @vitest-environment happy-dom

import type { IUserHasId } from '@growi/core';
import { render, screen } from '@testing-library/react';

vi.mock('next/dynamic', () => ({
  default: (_importFn: () => Promise<unknown>, _opts?: unknown) => {
    const Stub = ({ children }: { children?: React.ReactNode }) => (
      <span data-testid="mock-tooltip">{children}</span>
    );
    return Stub;
  },
}));

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

import { UserInfo } from './UserInfo';

const baseAuthor = {
  _id: 'user1',
  name: 'Alice',
  username: 'alice',
  email: 'alice@example.com',
  isEmailPublished: true,
  status: 2,
} as unknown as IUserHasId;

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('UserInfo', () => {
  it('renders a badge icon next to the username when author has badgeSummaryCached entries', () => {
    const author = {
      ...baseAuthor,
      badgeSummaryCached: [
        {
          badgeType: 'badge-type-1',
          iconKey: 'star',
          name: 'Top Contributor',
          level: 3,
        },
      ],
    } as unknown as IUserHasId;

    render(<UserInfo author={author} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon when author has no badgeSummaryCached', () => {
    render(<UserInfo author={baseAuthor} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });
});
