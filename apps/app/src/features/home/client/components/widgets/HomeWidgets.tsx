import type { FC, ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';

import type {
  HomeWidgetPreferences,
  HomeWidgetsSiteConfig,
  PinnedPageEntry,
  WidgetDescriptor,
  WidgetKey,
} from '~/features/home/interfaces/home-widgets';
import { resolveEffectiveWidgetLayout } from '~/features/home/resolve-widget-layout';
import { HOME_WIDGET_DESCRIPTORS } from '~/features/home/widgets-registry';

import { ClassroomPostsWidget } from './ClassroomPostsWidget';
import { PinnedPagesWidget } from './PinnedPagesWidget';

type Props = {
  homeWidgetsSiteConfig?: HomeWidgetsSiteConfig;
  homePinnedPages?: PinnedPageEntry[];
  homeClassroomPathPrefix?: string | null;
  userWidgetPreferences?: HomeWidgetPreferences;
};

const WidgetErrorFallback: FC<FallbackProps> = ({ error }) => {
  return (
    <div className="grw-home-widget-error card border-danger" role="alert">
      <div className="card-body">
        <p className="mb-0 text-danger">
          Failed to load this widget: {error.message}
        </p>
      </div>
    </div>
  );
};

/**
 * Container for the Home page widget area.
 *
 * The rendered set and order are not hard-coded: `resolveEffectiveWidgetLayout`
 * derives the effective layout from the widget descriptors, the site-wide admin
 * config and the per-user preferences (Requirements 1.1, 5.3, 6.3), returning
 * only the visible widgets already sorted by resolved order. This component
 * renders that list — full-width widgets on their own row, the rest in a
 * responsive grid that wraps by viewport width (Requirements 7.2–7.4) — and
 * wraps each widget in its own `ErrorBoundary` (v2 behaviour, Requirement 1.2)
 * so one widget's failure never reaches the others or the page. An empty
 * resolved list renders just the (empty) container without breaking the layout
 * (Requirement 1.3 / 7.4).
 *
 * The admin-configured widget inputs are wired here (`配線`): `classroomPosts`
 * and `pinnedPages` need config props, so they are rendered from pre-bound
 * elements keyed by widget; every other widget takes no props and is rendered
 * straight from its descriptor `Component`.
 *
 * Per-user reordering / hiding (Requirement 6.1) is a separate concern:
 * `HomeWidgetCustomizePanel` renders `HomeWidgetReorderList` (a compact,
 * widget-free list) while editing, then re-renders this component with the
 * updated `userWidgetPreferences` once the user is done.
 *
 * Not rendered for anonymous users — the caller (`HomeContent`) decides whether
 * to mount this component based on `currentUser` (Requirement 8.2).
 */
export const HomeWidgets: FC<Props> = ({
  homeWidgetsSiteConfig,
  homePinnedPages,
  homeClassroomPathPrefix,
  userWidgetPreferences,
}) => {
  const views = resolveEffectiveWidgetLayout(
    HOME_WIDGET_DESCRIPTORS,
    homeWidgetsSiteConfig,
    userWidgetPreferences,
  );

  // Prop-wiring for the two widgets that take admin-configured inputs. Not a
  // mode check — just the config plumbing this layer owns; every other widget
  // renders straight from its descriptor `Component`.
  const boundNodeByKey: Partial<Record<WidgetKey, ReactNode>> = {
    classroomPosts: (
      <ClassroomPostsWidget pathPrefix={homeClassroomPathPrefix} />
    ),
    pinnedPages: <PinnedPagesWidget pinnedPages={homePinnedPages} />,
  };

  const widgetNode = (
    key: WidgetKey,
    Component: WidgetDescriptor['Component'],
  ) => (
    <ErrorBoundary FallbackComponent={WidgetErrorFallback}>
      {boundNodeByKey[key] ?? <Component />}
    </ErrorBoundary>
  );

  const cellClass = (fullWidth: boolean) =>
    fullWidth ? 'col-12 mb-3' : 'col-12 col-sm-6 col-lg-4 mb-3';

  return (
    <div className="grw-home-widgets">
      <div className="row">
        {views.map((view) => (
          <div key={view.key} className={cellClass(view.fullWidth)}>
            {widgetNode(view.key, view.Component)}
          </div>
        ))}
      </div>
    </div>
  );
};
