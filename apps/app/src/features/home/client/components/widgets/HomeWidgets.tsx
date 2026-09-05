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

// The search widget renders full-width on its own row -- it is a prominent
// input, not a card, and does not belong in the 3-column grid below.
const SEARCH_WIDGET: WidgetEntry = { key: 'search', Component: SearchWidget };

// Fixed code-level order of the grid widget area (Requirement 1.4: no
// runtime configurability, no admin on/off toggle). Adding a new widget in
// the future is a single entry added to this array — no other change to
// this component is required. (A 5th entry simply joins the 3-column grid
// as a 4th card; if a future widget needs the full-width search-row layout
// instead, promote it to its own top-level slot the same way SEARCH_WIDGET
// is handled above.)
const GRID_WIDGETS: readonly WidgetEntry[] = [
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
 * Renders the search widget full-width, followed by the remaining widgets
 * in a responsive 3-column grid (collapsing to a single column on narrow
 * viewports via Bootstrap's grid), in a fixed order (Requirement 1.4). Each
 * widget is wrapped in its own error boundary (Requirement 1.3), so a
 * fetch/render failure in one widget is contained to that widget's slot and
 * does not affect the other widgets or the rest of the page.
 *
 * Not rendered for anonymous users — the caller (`HomeContent`) decides
 * whether to mount this component based on `currentUser` (Requirement 5.2).
 */
export const HomeWidgets: FC = () => {
  return (
    <div className="grw-home-widgets">
      <ErrorBoundary FallbackComponent={WidgetErrorFallback}>
        <SEARCH_WIDGET.Component />
      </ErrorBoundary>

      <div className="row mt-3">
        {GRID_WIDGETS.map(({ key, Component }) => (
          <div key={key} className="col-md-4 mb-3">
            <ErrorBoundary FallbackComponent={WidgetErrorFallback}>
              <Component />
            </ErrorBoundary>
          </div>
        ))}
      </div>
    </div>
  );
};
