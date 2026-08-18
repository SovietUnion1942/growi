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
