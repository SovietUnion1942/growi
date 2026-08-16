// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), events: { on: vi.fn(), off: vi.fn() } }),
}));

// `UserPicture`'s badge tooltip is a `next/dynamic`-loaded
// `UncontrolledTooltip` (reactstrap). Mock it to a synchronous stub, same
// as `packages/ui/src/components/UserPicture.spec.tsx` and the other
// `UserPicture`-wiring specs in this task group do, so the badge tooltip
// doesn't asynchronously mount and hit the installed `@growi/ui` dist
// build's stale (pre-colon-strip-fix) `UncontrolledTooltip` target-id
// selector against happy-dom. This also stubs `SlackNotification`
// (dynamically imported below), which is fine since it's not exercised by
// these tests.
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

const useCurrentUser = vi.fn();
vi.mock('~/states/global', async () => {
  const { atom } = await import('jotai');
  return {
    useCurrentUser: (...args: unknown[]) => useCurrentUser(...args),
    // `~/states/context`'s `isGuestUserAtom`/`isReadOnlyUserAtom` (read by
    // `NotAvailableForGuest`/`NotAvailableIfReadOnlyUserNotAllowedToComment`,
    // both rendered inside `CommentEditorPre`) derive from this atom via
    // `get()`, so it must be a real jotai atom, not a plain stub object.
    // Resolving to `undefined` mirrors an anonymous/logged-out viewer,
    // which is fine since these tests only assert on badge rendering.
    currentUserAtomGetter: atom(undefined),
  };
});

vi.mock('~/states/page', () => ({
  useCurrentPagePath: () => '/foo',
}));

vi.mock('~/stores/comment', () => ({
  useSWRxPageComment: () => ({ update: vi.fn(), post: vi.fn() }),
}));

vi.mock('~/states/ui/editor', () => ({
  useIsSlackEnabled: () => [false, vi.fn()],
}));

vi.mock('~/states/server-configurations', async (importOriginal) => {
  const { atom } = await import('jotai');
  const actual =
    await importOriginal<typeof import('~/states/server-configurations')>();
  return {
    ...actual,
    // A real jotai atom (defaulting to `false`), not a plain stub object,
    // so the component's real `useAtomValue(isSlackConfiguredAtom)` call
    // keeps working unmocked -- same reasoning as `currentUserAtomGetter`
    // above.
    isSlackConfiguredAtom: atom(false),
    useAcceptedUploadFileType: () => undefined,
  };
});

vi.mock('~/stores/editor', () => ({
  useEditorSettings: () => ({ data: undefined }),
  useSWRxSlackChannels: () => ({ data: undefined }),
}));

vi.mock('~/states/ui/unsaved-warning', () => ({
  useCommentEditorsDirtyMap: () => ({ markDirty: vi.fn(), markClean: vi.fn() }),
}));

vi.mock('~/stores-universal/use-next-themes', () => ({
  useNextThemes: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('~/stores/renderer', () => ({
  useCommentPreviewOptions: () => ({ data: undefined }),
}));

vi.mock('@growi/editor', () => ({
  GlobalCodeMirrorEditorKey: { COMMENT_NEW: 'comment_new' },
  useSetResolvedTheme: () => vi.fn(),
}));

vi.mock('@growi/editor/dist/client/components/CodeMirrorEditorComment', () => ({
  CodeMirrorEditorComment: () => <div data-testid="mock-codemirror-editor" />,
}));

vi.mock('@growi/editor/dist/client/services', () => ({
  createMentionCompletionExtension: () => undefined,
  mentionDecorationSettings: undefined,
}));

vi.mock('@growi/editor/dist/client/stores/codemirror-editor', () => ({
  useCodeMirrorEditorIsolated: () => ({ data: undefined }),
}));

const useSWRxBadgeTypeCatalog = vi.fn();
vi.mock('~/features/user-badge/client/stores/badge-type-catalog', () => ({
  useSWRxBadgeTypeCatalog: (...args: unknown[]) =>
    useSWRxBadgeTypeCatalog(...args),
}));

import { makeBadgeSummaryFixture } from '~/features/user-badge/test-utils/badge-summary-fixture';

import { CommentEditor, CommentEditorPre } from './CommentEditor';

const baseUser = {
  _id: 'user1',
  name: 'Alice',
  username: 'alice',
};

const baseProps = {
  pageId: 'page1',
  revisionId: 'revision1',
};

beforeEach(() => {
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
});

describe('CommentEditor', () => {
  it("renders a badge icon next to the current user's avatar when badgeSummaryCached entries exist", () => {
    useCurrentUser.mockReturnValue({
      ...baseUser,
      badgeSummaryCached: makeBadgeSummaryFixture(),
    });

    render(<CommentEditor {...baseProps} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon when the current user has no badgeSummaryCached', () => {
    useCurrentUser.mockReturnValue(baseUser);

    render(<CommentEditor {...baseProps} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });
});

describe('CommentEditorPre', () => {
  it("renders a badge icon next to the current user's avatar (pre-open state) when badgeSummaryCached entries exist", () => {
    useCurrentUser.mockReturnValue({
      ...baseUser,
      badgeSummaryCached: makeBadgeSummaryFixture(),
    });

    render(<CommentEditorPre {...baseProps} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render any badge icon (pre-open state) when the current user has no badgeSummaryCached', () => {
    useCurrentUser.mockReturnValue(baseUser);

    render(<CommentEditorPre {...baseProps} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
  });
});
