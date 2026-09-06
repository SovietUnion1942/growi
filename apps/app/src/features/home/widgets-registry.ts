import { BookmarksWidget } from './client/components/widgets/BookmarksWidget';
import { ClassroomPostsWidget } from './client/components/widgets/ClassroomPostsWidget';
import { HomeFeedWidget } from './client/components/widgets/HomeFeedWidget';
import { PinnedPagesWidget } from './client/components/widgets/PinnedPagesWidget';
import { RecentUpdatesWidget } from './client/components/widgets/RecentUpdatesWidget';
import { SearchWidget } from './client/components/widgets/SearchWidget';
import { WipPagesWidget } from './client/components/widgets/WipPagesWidget';
import { DEFAULT_HOME_WIDGET_LAYOUT } from './consts';
import type { WidgetDescriptor } from './interfaces/home-widgets';

const d = DEFAULT_HOME_WIDGET_LAYOUT;

/**
 * Fixed metadata for the seven widgets mounted on `/home` (Requirement 1.1,
 * 1.4). All seven are bound here with a real `Component`; the set is closed.
 *
 * `Component` is the bare, prop-less call site of each widget. The four v2
 * widgets take no props; `ClassroomPostsWidget` / `PinnedPagesWidget` /
 * `HomeFeedWidget` all render acceptably with their default props. The
 * admin-configured inputs (`pathPrefix`, `pinnedPages`) are wired at the
 * `HomeWidgets` layer, not baked in here, so this array stays declarative.
 *
 * `resolveEffectiveWidgetLayout` operates on whatever descriptor list it is
 * handed, so adding a future widget is one entry here plus one `WidgetKey`.
 */
export const HOME_WIDGET_DESCRIPTORS: readonly WidgetDescriptor[] = [
  {
    key: 'search',
    titleI18nKey: 'home_page_v3.widget.search.title',
    Component: SearchWidget,
    defaultVisible: d.search.visible,
    defaultOrder: d.search.order,
    fullWidth: true,
  },
  {
    key: 'recentUpdates',
    titleI18nKey: 'home_page_v3.widget.recent_updates.title',
    Component: RecentUpdatesWidget,
    defaultVisible: d.recentUpdates.visible,
    defaultOrder: d.recentUpdates.order,
    fullWidth: false,
  },
  {
    key: 'bookmarks',
    titleI18nKey: 'home_page_v3.widget.bookmarks.title',
    Component: BookmarksWidget,
    defaultVisible: d.bookmarks.visible,
    defaultOrder: d.bookmarks.order,
    fullWidth: false,
  },
  {
    key: 'wipPages',
    titleI18nKey: 'home_page_v3.widget.wip_pages.title',
    Component: WipPagesWidget,
    defaultVisible: d.wipPages.visible,
    defaultOrder: d.wipPages.order,
    fullWidth: false,
  },
  {
    key: 'classroomPosts',
    titleI18nKey: 'home_page_v3.widget.classroom_posts.title',
    Component: ClassroomPostsWidget,
    defaultVisible: d.classroomPosts.visible,
    defaultOrder: d.classroomPosts.order,
    fullWidth: false,
  },
  {
    key: 'pinnedPages',
    titleI18nKey: 'home_page_v3.widget.pinned_pages.title',
    Component: PinnedPagesWidget,
    defaultVisible: d.pinnedPages.visible,
    defaultOrder: d.pinnedPages.order,
    fullWidth: false,
  },
  {
    key: 'homeFeed',
    titleI18nKey: 'home_page_v3.widget.home_feed.title',
    Component: HomeFeedWidget,
    defaultVisible: d.homeFeed.visible,
    defaultOrder: d.homeFeed.order,
    // Design: only `search` is full-width; `homeFeed` is a grid cell.
    fullWidth: false,
  },
];
