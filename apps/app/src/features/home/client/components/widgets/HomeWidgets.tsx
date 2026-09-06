import type { FC, ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

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

/** One entry of the full customize-mode ordering (all 7, hidden included). */
export type CustomizeWidgetEntry = { key: WidgetKey; visible: boolean };

type Props = {
  homeWidgetsSiteConfig?: HomeWidgetsSiteConfig;
  homePinnedPages?: PinnedPageEntry[];
  homeClassroomPathPrefix?: string | null;
  userWidgetPreferences?: HomeWidgetPreferences;
  /**
   * Customize-mode overlay (task 4.3). When `true`, the widget area is driven
   * by `orderedForCustomize` (all 7 widgets, in the working order) instead of
   * the resolved layout, and each card gets an up/down/visibility control
   * cluster wired to `onMoveWidget` / `onToggleVisible`.
   */
  customizeMode?: boolean;
  orderedForCustomize?: CustomizeWidgetEntry[];
  onMoveWidget?: (key: WidgetKey, dir: 'up' | 'down') => void;
  onToggleVisible?: (key: WidgetKey) => void;
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

const DESCRIPTOR_BY_KEY: Record<WidgetKey, WidgetDescriptor> =
  Object.fromEntries(HOME_WIDGET_DESCRIPTORS.map((d) => [d.key, d])) as Record<
    WidgetKey,
    WidgetDescriptor
  >;

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
 * In customize mode (`customizeMode`, driven by `HomeWidgetCustomizePanel`),
 * this same component instead renders all 7 widgets from `orderedForCustomize`
 * — each inside an always-present card frame (header + body) so the layout and
 * headings stay put even while a widget's data is being re-fetched (design
 * Risk) — with an up / down / show-hide control cluster in every header. Hidden
 * widgets render the frame with a placeholder body rather than the widget.
 *
 * Not rendered for anonymous users — the caller (`HomeContent`) decides whether
 * to mount this component based on `currentUser` (Requirement 8.2).
 */
export const HomeWidgets: FC<Props> = ({
  homeWidgetsSiteConfig,
  homePinnedPages,
  homeClassroomPathPrefix,
  userWidgetPreferences,
  customizeMode = false,
  orderedForCustomize,
  onMoveWidget,
  onToggleVisible,
}) => {
  const { t } = useTranslation();

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

  if (customizeMode) {
    const entries = orderedForCustomize ?? [];
    return (
      <div className="grw-home-widgets grw-home-widgets-customizing">
        <div className="row">
          {entries.map((entry, index) => {
            const descriptor = DESCRIPTOR_BY_KEY[entry.key];
            if (descriptor == null) {
              return null;
            }
            return (
              <div
                key={entry.key}
                className={cellClass(descriptor.fullWidth)}
                data-testid={`customize-frame-${entry.key}`}
              >
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <span className="fw-bold">
                      {t(descriptor.titleI18nKey)}
                    </span>
                    <span className="btn-group btn-group-sm">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        aria-label={t('home.customize.move_up')}
                        disabled={index === 0}
                        onClick={() => onMoveWidget?.(entry.key, 'up')}
                      >
                        <span className="material-symbols-outlined">
                          arrow_upward
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        aria-label={t('home.customize.move_down')}
                        disabled={index === entries.length - 1}
                        onClick={() => onMoveWidget?.(entry.key, 'down')}
                      >
                        <span className="material-symbols-outlined">
                          arrow_downward
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        aria-label={
                          entry.visible
                            ? t('home.customize.hide_widget')
                            : t('home.customize.show_widget')
                        }
                        onClick={() => onToggleVisible?.(entry.key)}
                      >
                        <span className="material-symbols-outlined">
                          {entry.visible ? 'visibility' : 'visibility_off'}
                        </span>
                      </button>
                    </span>
                  </div>
                  <div className="card-body">
                    {entry.visible ? (
                      widgetNode(entry.key, descriptor.Component)
                    ) : (
                      <p className="text-muted small mb-0">
                        {t('home.customize.hidden')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

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
