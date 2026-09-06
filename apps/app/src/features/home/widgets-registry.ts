import { BookmarksWidget } from './client/components/widgets/BookmarksWidget';
import { RecentUpdatesWidget } from './client/components/widgets/RecentUpdatesWidget';
import { SearchWidget } from './client/components/widgets/SearchWidget';
import { WipPagesWidget } from './client/components/widgets/WipPagesWidget';
import { DEFAULT_HOME_WIDGET_LAYOUT } from './consts';
import type { WidgetDescriptor } from './interfaces/home-widgets';

const d = DEFAULT_HOME_WIDGET_LAYOUT;

/**
 * Fixed metadata for the widgets currently mounted on `/home`.
 *
 * Per task 1.1 only the four v2 widgets are bound with a real `Component` at
 * this stage; `classroomPosts`, `pinnedPages` and `homeFeed` exist in the
 * `WidgetKey` type and in `DEFAULT_HOME_WIDGET_LAYOUT` but are added here in
 * the integration phase (task 4.1). `resolveEffectiveWidgetLayout` operates
 * on whatever descriptor list it is handed, so extending this array is the
 * only change needed to light up the remaining widgets.
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
];
