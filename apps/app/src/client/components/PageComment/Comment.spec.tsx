// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

import type { ICommentHasId } from '../../../interfaces/comment';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children?: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('reactstrap', () => ({
  UncontrolledTooltip: () => <></>,
}));

const useSWRxBadgeTypeCatalog = vi.fn();
vi.mock('~/features/user-badge/client/stores/badge-type-catalog', () => ({
  useSWRxBadgeTypeCatalog: (...args: unknown[]) =>
    useSWRxBadgeTypeCatalog(...args),
}));

vi.mock('../../../components/PageView/RevisionRenderer', () => ({
  default: () => <div data-testid="mock-revision-renderer" />,
}));

vi.mock('../../../components/User/Username', () => ({
  Username: () => <span data-testid="mock-username" />,
}));

vi.mock('../FormattedDistanceDate', () => ({
  default: () => <span data-testid="mock-formatted-distance-date" />,
}));

vi.mock('./CommentControl', () => ({
  CommentControl: () => <div data-testid="mock-comment-control" />,
}));

vi.mock('./CommentEditor', () => ({
  CommentEditor: () => <div data-testid="mock-comment-editor" />,
}));

import { Comment } from './Comment';

const baseCreator = {
  _id: 'user1',
  name: 'Alice',
  username: 'alice',
};

const baseComment = {
  _id: 'comment1',
  page: 'page1',
  revision: 'revision1',
  comment: 'hello',
  commentPosition: -1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  creator: baseCreator,
} as unknown as ICommentHasId;

const renderComment = (comment: ICommentHasId) =>
  render(
    <Comment
      comment={comment}
      // biome-ignore lint/suspicious/noExplicitAny: rendererOptions is not exercised by this test
      rendererOptions={undefined as any}
      revisionId="revision1"
      revisionCreatedAt={new Date('2026-01-01T00:00:00.000Z')}
      // biome-ignore lint/suspicious/noExplicitAny: currentUser is not exercised by this test
      currentUser={undefined as any}
      isReadOnly
      pageId="page1"
      pagePath="/foo"
      deleteBtnClicked={() => {}}
      onComment={() => {}}
    />,
  );

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('Comment', () => {
  it('renders a badge icon next to the avatar when the creator has badgeSummaryCached entries', () => {
    const comment = {
      ...baseComment,
      creator: {
        ...baseCreator,
        badgeSummaryCached: [
          {
            badgeType: 'badge-type-1',
            iconKey: 'star',
            name: 'Top Contributor',
            level: 3,
          },
        ],
      },
    } as unknown as ICommentHasId;

    renderComment(comment);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon when the creator has no badgeSummaryCached', () => {
    renderComment(baseComment);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });
});
