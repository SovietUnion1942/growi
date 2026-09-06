import type { ComponentType } from 'react';

/**
 * The seven widget kinds the `/home` widget area can render (Requirement 1.1,
 * 1.4). The set is closed: there is no runtime mechanism to define new kinds.
 *
 * - `search`, `recentUpdates`, `bookmarks`, `wipPages` — the four v2 widgets.
 * - `classroomPosts`, `pinnedPages`, `homeFeed` — added in v3; their display
 *   components are wired into the registry during the integration phase.
 */
export const WIDGET_KEYS = [
  'search',
  'recentUpdates',
  'bookmarks',
  'wipPages',
  'classroomPosts',
  'pinnedPages',
  'homeFeed',
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

/**
 * Fixed, code-level metadata for one widget kind. `Component` is the display
 * component to mount for the widget; at this stage only the four v2 widgets
 * are bound in `HOME_WIDGET_DESCRIPTORS`, so the descriptor list is a subset
 * of `WidgetKey` until the integration phase fills in the remaining three.
 */
export interface WidgetDescriptor {
  key: WidgetKey;
  titleI18nKey: string;
  Component: ComponentType;
  defaultVisible: boolean;
  defaultOrder: number;
  /** `search` renders full-width on its own row; the rest are grid cells. */
  fullWidth: boolean;
}

/** A fully specified visibility + order pair for a widget. */
export interface WidgetPreference {
  visible: boolean;
  order: number;
}

/**
 * A partial override map keyed by widget. Each entry may specify `visible`,
 * `order`, both, or neither. Used for both the site-wide admin config and the
 * per-user preference (identical shape).
 */
export type HomeWidgetPreferences = Partial<
  Record<WidgetKey, Partial<WidgetPreference>>
>;

/** Site-wide widget layout config set by an admin. Same shape as per-user. */
export type HomeWidgetsSiteConfig = HomeWidgetPreferences;

/**
 * One entry of the resolved layout: a visible widget, ready to render, in its
 * resolved position. `visible`/`order` are already applied and dropped.
 */
export interface OrderedWidgetView {
  key: WidgetKey;
  Component: ComponentType;
  fullWidth: boolean;
}
