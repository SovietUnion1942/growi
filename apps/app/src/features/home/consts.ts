import type { WidgetKey, WidgetPreference } from './interfaces/home-widgets';

/**
 * The legacy wiki page that used to hold the home-page notice body before it
 * moved to the `customize:homeNotice` config field (admin Customize screen).
 * The home page no longer reads this page live; this constant is kept only
 * for the one-time migration that copies an existing page's body into the
 * new config field.
 */
export const HOME_NOTICE_PATH = '/home-notice';

/**
 * Default source path prefix for the Classroom latest-posts widget, used when
 * an admin has not set `customize:homeClassroomPathPrefix` (Requirement 2.5).
 * Classroom posts synced by the external agent land under this subtree.
 */
export const DEFAULT_HOME_CLASSROOM_PATH_PREFIX = '/classroom';

/**
 * Canonical default visibility + order for every widget kind, applied to all
 * users when an admin has never saved a site-wide widget config (Requirement
 * 5.5). Single source of truth for the descriptor defaults in
 * `widgets-registry.ts` and for the three widgets not yet bound there.
 */
export const DEFAULT_HOME_WIDGET_LAYOUT = {
  search: { visible: true, order: 10 },
  recentUpdates: { visible: true, order: 20 },
  bookmarks: { visible: true, order: 30 },
  wipPages: { visible: true, order: 40 },
  classroomPosts: { visible: true, order: 50 },
  pinnedPages: { visible: true, order: 60 },
  homeFeed: { visible: true, order: 70 },
} as const satisfies Record<WidgetKey, WidgetPreference>;
