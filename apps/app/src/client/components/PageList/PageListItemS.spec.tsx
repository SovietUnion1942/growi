// @vitest-environment happy-dom

import type { IPageHasId } from '@growi/core';
import { render, screen } from '@testing-library/react';

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), events: { on: vi.fn(), off: vi.fn() } }),
}));

// `UserPicture`'s badge tooltip is a `next/dynamic`-loaded
// `UncontrolledTooltip` (reactstrap). Mock it to a synchronous stub, same
// as `packages/ui/src/components/UserPicture.spec.tsx` does, so the badge
// tooltip doesn't asynchronously mount and hit the installed `@growi/ui`
// dist build's stale (pre-colon-strip-fix) `UncontrolledTooltip` target-id
// selector against happy-dom.
vi.mock('next/dynamic', () => ({
  default: () => {
    const Stub = ({ children }: { children?: React.ReactNode }) => (
      <span data-testid="mock-tooltip">{children}</span>
    );
    return Stub;
  },
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useSWRxBadgeTypeCatalog = vi.fn();
vi.mock('~/features/user-badge/client/stores/badge-type-catalog', () => ({
  useSWRxBadgeTypeCatalog: (...args: unknown[]) =>
    useSWRxBadgeTypeCatalog(...args),
}));

vi.mock('@growi/ui/dist/components', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@growi/ui/dist/components')>();
  return {
    ...actual,
    PageListMeta: () => <span data-testid="mock-page-list-meta" />,
    PagePathLabel: () => <span data-testid="mock-page-path-label" />,
  };
});

import {
  makeBadgeSummaryFixture,
  makeImageBadgeSummaryFixture,
} from '~/features/user-badge/test-utils/badge-summary-fixture';

import { PageListItemS } from './PageListItemS';

const basePage = {
  _id: 'page1',
  path: '/foo/bar',
};

const makePage = (lastUpdateUser?: Record<string, unknown>): IPageHasId =>
  ({ ...basePage, lastUpdateUser }) as unknown as IPageHasId;

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('PageListItemS', () => {
  it('renders a badge icon when page.lastUpdateUser has badgeSummaryCached entries', () => {
    const page = makePage({
      _id: 'user1',
      name: 'Alice',
      username: 'alice',
      badgeSummaryCached: makeBadgeSummaryFixture(),
    });

    render(<PageListItemS page={page} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon when lastUpdateUser has no badgeSummaryCached', () => {
    const page = makePage({
      _id: 'user1',
      name: 'Alice',
      username: 'alice',
    });

    render(<PageListItemS page={page} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });

  it('does not crash when lastUpdateUser is missing', () => {
    const page = makePage(undefined);

    render(<PageListItemS page={page} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });

  it('renders an <img> icon when lastUpdateUser has an image-icon badge', () => {
    const page = makePage({
      _id: 'user1',
      name: 'Alice',
      username: 'alice',
      badgeSummaryCached: makeImageBadgeSummaryFixture(),
    });

    render(<PageListItemS page={page} />);

    const badge = screen.getByTestId('user-picture-badge');
    const img = badge.querySelector('img');
    expect(img).toHaveAttribute('src', '/attachment/badge-icon-attachment-1');
  });

  it('does not bleed badges across rows when two items have different users', () => {
    const pageWithBadge = makePage({
      _id: 'user1',
      name: 'Alice',
      username: 'alice',
      badgeSummaryCached: makeBadgeSummaryFixture(),
    });
    const pageWithoutBadge = makePage({
      _id: 'user2',
      name: 'Bob',
      username: 'bob',
    });

    render(
      <>
        <PageListItemS page={pageWithBadge} />
        <PageListItemS page={pageWithoutBadge} />
      </>,
    );

    expect(screen.getAllByTestId('user-picture-badge')).toHaveLength(1);
  });
});
