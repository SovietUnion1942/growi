import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBadgeTypeHasId } from '../stores/badge-type';
import type { IUserBadgeHasId } from '../stores/user-badge';
import { BadgeShelf } from './BadgeShelf';

// --- module mocks ------------------------------------------------------------

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useSWRxUserBadges = vi.hoisted(() => vi.fn());
vi.mock('../stores/user-badge', async () => {
  const actual = await vi.importActual<typeof import('../stores/user-badge')>(
    '../stores/user-badge',
  );
  return {
    ...actual,
    useSWRxUserBadges,
  };
});

// --- fixtures ------------------------------------------------------------

const seriesBadgeType: IBadgeTypeHasId = {
  _id: 'badge-type-series',
  name: 'Contributor',
  description: 'Contributed to the wiki',
  iconKey: 'edit',
  category: 'automatic',
  levels: [
    { level: 1, name: 'Bronze Contributor', iconKey: 'edit', threshold: 10 },
    { level: 3, name: 'Gold Contributor', iconKey: 'star', threshold: 100 },
  ],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'admin-1',
};

const manualBadgeType: IBadgeTypeHasId = {
  _id: 'badge-type-manual',
  name: 'Community Helper',
  description: 'Helped others in the community',
  iconKey: '🎉',
  category: 'manual',
  levels: [],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'admin-1',
};

const bronzeGrant: IUserBadgeHasId = {
  _id: 'user-badge-1',
  user: 'user-1',
  badgeType: seriesBadgeType,
  level: 1,
  grantedAt: '2026-01-01T00:00:00.000Z',
  grantedBy: null,
  note: null,
};

const goldGrant: IUserBadgeHasId = {
  _id: 'user-badge-2',
  user: 'user-1',
  badgeType: seriesBadgeType,
  level: 3,
  grantedAt: '2026-02-01T00:00:00.000Z',
  grantedBy: null,
  note: null,
};

const manualGrant: IUserBadgeHasId = {
  _id: 'user-badge-3',
  user: 'user-1',
  badgeType: manualBadgeType,
  level: null,
  grantedAt: '2026-03-01T00:00:00.000Z',
  grantedBy: 'admin-1',
  note: 'Great work',
};

const imageBadgeType: IBadgeTypeHasId = {
  _id: 'badge-type-image',
  name: 'Mentor',
  description: 'Mentored a newcomer',
  iconType: 'image',
  iconKey: '',
  iconAttachment: 'attachment-9',
  category: 'manual',
  levels: [],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'admin-1',
};

const imageGrant: IUserBadgeHasId = {
  _id: 'user-badge-4',
  user: 'user-1',
  badgeType: imageBadgeType,
  level: null,
  grantedAt: '2026-04-01T00:00:00.000Z',
  grantedBy: 'admin-1',
  note: null,
};

beforeEach(() => {
  useSWRxUserBadges.mockReset();
});

describe('BadgeShelf', () => {
  it('renders a loading indicator while fetching', () => {
    useSWRxUserBadges.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
    });

    render(<BadgeShelf userId="user-1" />);

    expect(screen.getByTestId('grw-badge-shelf-loading')).toBeInTheDocument();
    expect(useSWRxUserBadges).toHaveBeenCalledWith('user-1');
  });

  it('renders an empty state when the user has no badges', () => {
    useSWRxUserBadges.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
    });

    render(<BadgeShelf userId="user-1" />);

    expect(screen.getByTestId('grw-badge-shelf-empty')).toBeInTheDocument();
    expect(
      screen.queryByTestId('grw-badge-shelf-entry'),
    ).not.toBeInTheDocument();
  });

  it('renders one entry per distinct (badgeType, level) grant, including every level held in the same series', () => {
    useSWRxUserBadges.mockReturnValue({
      data: [bronzeGrant, goldGrant, manualGrant],
      isLoading: false,
      error: undefined,
    });

    render(<BadgeShelf userId="user-1" />);

    const entries = screen.getAllByTestId('grw-badge-shelf-entry');
    expect(entries).toHaveLength(3);

    // Both levels of the same automatic series must appear, not just the highest.
    expect(screen.getByText('Bronze Contributor')).toBeInTheDocument();
    expect(screen.getByText('Gold Contributor')).toBeInTheDocument();
    // The manual badge appears as its own standalone entry.
    expect(screen.getByText('Community Helper')).toBeInTheDocument();
  });

  it('shows name, icon, and formatted grant date for each entry', () => {
    useSWRxUserBadges.mockReturnValue({
      data: [bronzeGrant, manualGrant],
      isLoading: false,
      error: undefined,
    });

    render(<BadgeShelf userId="user-1" />);

    const entries = screen.getAllByTestId('grw-badge-shelf-entry');
    expect(entries).toHaveLength(2);

    const bronzeEntry = screen
      .getByText('Bronze Contributor')
      .closest('[data-testid="grw-badge-shelf-entry"]');
    expect(bronzeEntry).not.toBeNull();
    // Material Symbols icon key (ASCII) renders via the material-symbols-outlined span.
    expect(
      bronzeEntry?.querySelector('.material-symbols-outlined')?.textContent,
    ).toBe('edit');
    expect(bronzeEntry?.textContent).toContain(
      new Date(bronzeGrant.grantedAt).toLocaleDateString(),
    );

    const manualEntry = screen
      .getByText('Community Helper')
      .closest('[data-testid="grw-badge-shelf-entry"]');
    expect(manualEntry).not.toBeNull();
    // Emoji icon key renders as plain text, not the Material Symbols span.
    expect(manualEntry?.textContent).toContain('🎉');
    expect(manualEntry?.querySelector('.material-symbols-outlined')).toBeNull();
    expect(manualEntry?.textContent).toContain(
      new Date(manualGrant.grantedAt).toLocaleDateString(),
    );
  });

  it('renders an <img> thumbnail for a manual badge with an image icon', () => {
    useSWRxUserBadges.mockReturnValue({
      data: [manualGrant, imageGrant],
      isLoading: false,
      error: undefined,
    });

    render(<BadgeShelf userId="user-1" />);

    const imageEntry = screen
      .getByText('Mentor')
      .closest('[data-testid="grw-badge-shelf-entry"]');
    expect(imageEntry).not.toBeNull();
    const img = imageEntry?.querySelector('img');
    expect(img).toHaveAttribute('src', '/attachment/attachment-9');
    expect(imageEntry?.querySelector('.material-symbols-outlined')).toBeNull();

    // Unrelated emoji-icon entries render unchanged.
    const manualEntry = screen
      .getByText('Community Helper')
      .closest('[data-testid="grw-badge-shelf-entry"]');
    expect(manualEntry?.querySelector('img')).toBeNull();
  });
});
