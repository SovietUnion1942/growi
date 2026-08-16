/**
 * Structurally identical to `UserPictureBadgeSource`
 * (`~/features/user-badge/client/hooks/use-user-picture-badges`), duplicated
 * here rather than imported so that this fixture stays importable from test
 * files outside `client/` (e.g. `src/components/User/UserInfo.spec.tsx`),
 * where importing from a `client/` directory is restricted by lint rule.
 */
type BadgeSummaryFixtureEntry = {
  badgeType: string;
  iconKey: string;
  /**
   * Mirrors `IUserBadgeSummaryEntry.iconType` (`packages/core`, added by
   * task 13.4). Optional so the pre-existing (non-image) fixture entry
   * below keeps its original shape.
   */
  iconType?: 'materialSymbol' | 'emoji' | 'image';
  /** Mirrors `IUserBadgeSummaryEntry.iconUrl`. Only meaningful when `iconType === 'image'`. */
  iconUrl?: string | null;
  name: string;
  level: number | null;
};

/**
 * Shared fixture for the "does badge data actually reach `UserPicture`"
 * integration tests spread across the 3 real call sites wired in tasks
 * 12.2-12.4 (profile header `UserInfo`, sidebar recent-changes `PageItem`,
 * and comment author `Comment`).
 *
 * Using the exact same `badgeSummaryCached`-shaped fixture at all 3 sites
 * (rather than each site's spec inventing its own literal) is what lets
 * those 3 spec files be read together as one integration check: given
 * identical input data, every site must produce the same
 * `data-testid="user-picture-badge"` output through the same
 * `useUserPictureBadges` -> `UserPicture` pipeline (task 12.5,
 * requirements 4.1/4.4/4.5).
 */
export const makeBadgeSummaryFixture = (): BadgeSummaryFixtureEntry[] => [
  {
    badgeType: 'badge-type-1',
    iconKey: 'star',
    name: 'Top Contributor',
    level: 3,
  },
];

/**
 * Image-icon sibling of `makeBadgeSummaryFixture` (task 13.8, requirement
 * 6.5): the same shared-fixture pattern task 12.5 established, extended to
 * the `iconType: 'image'` case so the 3 real `UserPicture` call sites
 * (profile header, sidebar recent-changes, comment author) and `BadgeShelf`
 * can all be proven, with identical input data, to render an `<img>` — not
 * just a generic badge marker — when the underlying badge uses an uploaded
 * icon image rather than a Material Symbols/emoji `iconKey`.
 */
export const makeImageBadgeSummaryFixture = (): BadgeSummaryFixtureEntry[] => [
  {
    badgeType: 'badge-type-image-1',
    iconKey: '',
    iconType: 'image',
    iconUrl: '/attachment/badge-icon-attachment-1',
    name: 'Mentor',
    level: null,
  },
];
