// @vitest-environment happy-dom

import type { IPageInfoForListing, IPageWithMeta } from '@growi/core';
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
    // biome-ignore lint/suspicious/noExplicitAny: test stub renders unconditionally
    PageListMeta: () => <span data-testid="mock-page-list-meta" />,
  };
});

vi.mock('~/components/Common/PagePathHierarchicalLink', () => ({
  PagePathHierarchicalLink: () => <span data-testid="mock-page-path" />,
}));

vi.mock('../Common/Dropdown/PageItemControl', () => ({
  PageItemControl: () => <span data-testid="mock-page-item-control" />,
}));

vi.mock('~/client/services/page-operation', () => ({
  bookmark: vi.fn(),
  unbookmark: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('~/client/util/toastr', () => ({
  toastError: vi.fn(),
}));

vi.mock('~/states/ui/device', () => ({
  useDeviceLargerThanLg: () => [true],
}));

vi.mock('~/states/ui/modal/page-delete', () => ({
  usePageDeleteModalActions: () => ({ open: vi.fn() }),
}));

vi.mock('~/states/ui/modal/page-duplicate', () => ({
  usePageDuplicateModalActions: () => ({ open: vi.fn() }),
}));

vi.mock('~/states/ui/modal/page-rename', () => ({
  usePageRenameModalActions: () => ({ open: vi.fn() }),
}));

vi.mock('~/states/ui/modal/put-back-page', () => ({
  usePutBackPageModalActions: () => ({ open: vi.fn() }),
}));

vi.mock('~/stores/bookmark', () => ({
  useSWRMUTxCurrentUserBookmarks: () => ({ trigger: vi.fn() }),
}));

vi.mock('../../../stores/page', () => ({
  useSWRxPageInfo: () => ({ data: undefined }),
  useSWRMUTxPageInfo: () => ({ trigger: vi.fn() }),
}));

import {
  makeBadgeSummaryFixture,
  makeImageBadgeSummaryFixture,
} from '~/features/user-badge/test-utils/badge-summary-fixture';

import { PageListItemL } from './PageListItemL';

type PageListItemLPageProp = IPageWithMeta<IPageInfoForListing>;

const basePageData = {
  _id: 'page1',
  path: '/foo/bar',
  liker: [],
  updatedAt: new Date().toISOString(),
};

const makePage = (
  lastUpdateUser?: Record<string, unknown>,
): PageListItemLPageProp =>
  ({
    data: { ...basePageData, lastUpdateUser },
    meta: undefined,
  }) as unknown as PageListItemLPageProp;

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('PageListItemL', () => {
  it('renders a badge icon when pageData.lastUpdateUser has badgeSummaryCached entries', () => {
    const page = makePage({
      _id: 'user1',
      name: 'Alice',
      username: 'alice',
      badgeSummaryCached: makeBadgeSummaryFixture(),
    });

    render(<PageListItemL page={page} isReadOnlyUser={false} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon when lastUpdateUser has no badgeSummaryCached', () => {
    const page = makePage({
      _id: 'user1',
      name: 'Alice',
      username: 'alice',
    });

    render(<PageListItemL page={page} isReadOnlyUser={false} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });

  it('does not crash when lastUpdateUser is missing', () => {
    const page = makePage(undefined);

    render(<PageListItemL page={page} isReadOnlyUser={false} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });

  it('renders an <img> icon when lastUpdateUser has an image-icon badge', () => {
    const page = makePage({
      _id: 'user1',
      name: 'Alice',
      username: 'alice',
      badgeSummaryCached: makeImageBadgeSummaryFixture(),
    });

    render(<PageListItemL page={page} isReadOnlyUser={false} />);

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
        <PageListItemL page={pageWithBadge} isReadOnlyUser={false} />
        <PageListItemL page={pageWithoutBadge} isReadOnlyUser={false} />
      </>,
    );

    expect(screen.getAllByTestId('user-picture-badge')).toHaveLength(1);
  });
});
