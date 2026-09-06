// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import type { ReorderListEntry } from './HomeWidgetReorderList';
import { HomeWidgetReorderList } from './HomeWidgetReorderList';

const ENTRIES: ReorderListEntry[] = [
  { key: 'search', visible: true },
  { key: 'recentUpdates', visible: false },
  { key: 'bookmarks', visible: true },
  { key: 'wipPages', visible: true },
  { key: 'classroomPosts', visible: true },
  { key: 'pinnedPages', visible: true },
  { key: 'homeFeed', visible: true },
];

describe('HomeWidgetReorderList', () => {
  it('renders one row per entry with the widget title, in the given order', () => {
    render(
      <HomeWidgetReorderList
        entries={ENTRIES}
        onMove={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId(/^reorder-row-/);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveAttribute('data-testid', 'reorder-row-search');
    expect(rows[6]).toHaveAttribute('data-testid', 'reorder-row-homeFeed');
    expect(
      within(rows[0]).getByText('home_page_v3.widget.search.title'),
    ).toBeInTheDocument();
  });

  it('disables ↑ on the first row and ↓ on the last row', () => {
    render(
      <HomeWidgetReorderList
        entries={ENTRIES}
        onMove={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    );

    const first = screen.getByTestId('reorder-row-search');
    const last = screen.getByTestId('reorder-row-homeFeed');

    expect(
      within(first).getByRole('button', { name: 'home.customize.move_up' }),
    ).toBeDisabled();
    expect(
      within(first).getByRole('button', { name: 'home.customize.move_down' }),
    ).toBeEnabled();
    expect(
      within(last).getByRole('button', { name: 'home.customize.move_down' }),
    ).toBeDisabled();
  });

  it('calls onMove with the row key and direction', () => {
    const onMove = vi.fn();
    render(
      <HomeWidgetReorderList
        entries={ENTRIES}
        onMove={onMove}
        onToggleVisible={vi.fn()}
      />,
    );

    const bookmarks = screen.getByTestId('reorder-row-bookmarks');
    fireEvent.click(
      within(bookmarks).getByRole('button', {
        name: 'home.customize.move_up',
      }),
    );
    expect(onMove).toHaveBeenCalledWith('bookmarks', 'up');

    fireEvent.click(
      within(bookmarks).getByRole('button', {
        name: 'home.customize.move_down',
      }),
    );
    expect(onMove).toHaveBeenCalledWith('bookmarks', 'down');
  });

  it('calls onToggleVisible with the row key; the visibility control reflects state', () => {
    const onToggleVisible = vi.fn();
    render(
      <HomeWidgetReorderList
        entries={ENTRIES}
        onMove={vi.fn()}
        onToggleVisible={onToggleVisible}
      />,
    );

    // a visible row offers "hide"
    const visibleRow = screen.getByTestId('reorder-row-search');
    fireEvent.click(
      within(visibleRow).getByRole('button', {
        name: 'home.customize.hide_widget',
      }),
    );
    expect(onToggleVisible).toHaveBeenCalledWith('search');

    // a hidden row offers "show" and is marked as hidden
    const hiddenRow = screen.getByTestId('reorder-row-recentUpdates');
    expect(
      within(hiddenRow).getByText('home.customize.hidden'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(hiddenRow).getByRole('button', {
        name: 'home.customize.show_widget',
      }),
    );
    expect(onToggleVisible).toHaveBeenCalledWith('recentUpdates');
  });
});
