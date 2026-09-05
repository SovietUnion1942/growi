import type { ComponentType, FC } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';

import { BookmarksWidget } from './BookmarksWidget';
import { RecentUpdatesWidget } from './RecentUpdatesWidget';
import { SearchWidget } from './SearchWidget';
import { WipPagesWidget } from './WipPagesWidget';

type WidgetEntry = {
  key: string;
  Component: ComponentType;
};

// Fixed code-level order of the widget area (Requirement 1.4: no runtime
// configurability, no admin on/off toggle). Adding a new widget in the
// future is a single entry added to this array — no other change to this
// component is required.
const WIDGETS: readonly WidgetEntry[] = [
  { key: 'search', Component: SearchWidget },
  { key: 'recent-updates', Component: RecentUpdatesWidget },
  { key: 'bookmarks', Component: BookmarksWidget },
  { key: 'wip-pages', Component: WipPagesWidget },
];

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
 * Renders the 4 widgets in a fixed order (Requirement 1.4) and wraps each
 * one in its own error boundary (Requirement 1.3), so a fetch/render
 * failure in one widget is contained to that widget's slot and does not
 * affect the other widgets or the rest of the page.
 *
 * Not rendered for anonymous users — the caller (`HomeContent`) decides
 * whether to mount this component based on `currentUser` (Requirement 5.2).
 */
export const HomeWidgets: FC = () => {
  return (
    <div className="grw-home-widgets">
      {WIDGETS.map(({ key, Component }) => (
        <ErrorBoundary key={key} FallbackComponent={WidgetErrorFallback}>
          <Component />
        </ErrorBoundary>
      ))}
    </div>
  );
};
