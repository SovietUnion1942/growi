// @vitest-environment happy-dom

import type { IRevisionHasId } from '@growi/core';
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

import { makeBadgeSummaryFixture } from '~/features/user-badge/test-utils/badge-summary-fixture';

import { Revision } from './Revision';

const makeRevision = (author?: Record<string, unknown>): IRevisionHasId =>
  ({
    _id: 'revision1',
    author,
    createdAt: new Date().toISOString(),
    body: 'some body',
  }) as unknown as IRevisionHasId;

const baseProps = {
  isLatestRevision: false,
  currentPageId: 'page1',
  currentPagePath: '/foo/bar',
  onClose: vi.fn(),
};

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('Revision', () => {
  describe('renderSimplifiedNodiff (hasDiff=false)', () => {
    it('renders a badge icon when revision.author has badgeSummaryCached entries', () => {
      const revision = makeRevision({
        _id: 'user1',
        name: 'Alice',
        username: 'alice',
        badgeSummaryCached: makeBadgeSummaryFixture(),
      });

      render(<Revision {...baseProps} revision={revision} hasDiff={false} />);

      expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
    });

    it('does not render any badge icon when revision.author has no badgeSummaryCached', () => {
      const revision = makeRevision({
        _id: 'user1',
        name: 'Alice',
        username: 'alice',
      });

      render(<Revision {...baseProps} revision={revision} hasDiff={false} />);

      expect(
        screen.queryByTestId('user-picture-badge'),
      ).not.toBeInTheDocument();
    });
  });

  describe('renderFull (hasDiff=true)', () => {
    it('renders a badge icon when revision.author has badgeSummaryCached entries', () => {
      const revision = makeRevision({
        _id: 'user1',
        name: 'Alice',
        username: 'alice',
        badgeSummaryCached: makeBadgeSummaryFixture(),
      });

      render(<Revision {...baseProps} revision={revision} hasDiff />);

      expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
    });

    it('does not render any badge icon when revision.author has no badgeSummaryCached', () => {
      const revision = makeRevision({
        _id: 'user1',
        name: 'Alice',
        username: 'alice',
      });

      render(<Revision {...baseProps} revision={revision} hasDiff />);

      expect(
        screen.queryByTestId('user-picture-badge'),
      ).not.toBeInTheDocument();
    });
  });
});
