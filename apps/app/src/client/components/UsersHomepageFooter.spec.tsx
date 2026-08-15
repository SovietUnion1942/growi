// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('~/states/global', () => ({
  useCurrentUser: () => undefined,
}));

vi.mock('./Bookmarks/BookmarkFolderTree', () => ({
  BookmarkFolderTree: () => <div data-testid="grw-bookmark-folder-tree" />,
}));

vi.mock('./ContributionGraph/ContributionGraph', () => ({
  ContributionGraph: () => <div data-testid="grw-contribution-graph" />,
}));

vi.mock('~/client/components/RecentCreated/RecentCreated', () => ({
  RecentCreated: () => <div data-testid="grw-recent-created" />,
}));

vi.mock('~/client/components/RecentActivity/RecentActivity', () => ({
  RecentActivity: () => <div data-testid="grw-recent-activity" />,
}));

vi.mock('~/features/user-badge/client/components/BadgeShelf', () => ({
  BadgeShelf: () => <div data-testid="grw-badge-shelf-stub" />,
}));

import { UsersHomepageFooter } from './UsersHomepageFooter';

describe('UsersHomepageFooter', () => {
  it('renders the BadgeShelf section directly after the ContributionGraph section', () => {
    // Act
    render(<UsersHomepageFooter creatorId="user1" />);

    // Assert: both sections are present, and the badge section follows the
    // contribution graph section in document order (per design.md placement).
    const contributionGraph = screen.getByTestId('grw-contribution-graph');
    const badgeShelf = screen.getByTestId('grw-badge-shelf-stub');

    expect(contributionGraph).toBeInTheDocument();
    expect(badgeShelf).toBeInTheDocument();

    const position = contributionGraph.compareDocumentPosition(badgeShelf);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the badges section heading using the badges i18n key', () => {
    // Act
    render(<UsersHomepageFooter creatorId="user1" />);

    // Assert
    expect(screen.getByText('user_home_page.badges')).toBeInTheDocument();
  });
});
