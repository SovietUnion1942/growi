import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import type { IUserBadgeHasId } from '../../stores/user-badge';
import { GrantedManualBadgeList } from './GrantedManualBadgeList';

// --- module mocks ------------------------------------------------------------

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts == null) {
        return key;
      }
      return `${key} ${JSON.stringify(opts)}`;
    },
  }),
}));

const revokeUserBadge = vi.hoisted(() => vi.fn());
const useSWRxUserBadges = vi.hoisted(() => vi.fn());
vi.mock('../../stores/user-badge', async () => {
  const actual = await vi.importActual<
    typeof import('../../stores/user-badge')
  >('../../stores/user-badge');
  return { ...actual, useSWRxUserBadges, revokeUserBadge };
});

const toastError = vi.hoisted(() => vi.fn());
vi.mock('~/client/util/toastr', () => ({ toastError }));

// --- fixtures -----------------------------------------------------------------

const manualBadgeType: IBadgeTypeHasId = {
  _id: 'badge-type-manual-1',
  name: 'Community Helper',
  description: 'Helped others in the community',
  iconKey: 'volunteer_activism',
  category: 'manual',
  levels: [],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'user-1',
};

const automaticBadgeType: IBadgeTypeHasId = {
  _id: 'badge-type-automatic-1',
  name: 'Contributor',
  description: 'Contributed to the wiki',
  iconKey: 'edit',
  category: 'automatic',
  levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 10 }],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'user-1',
};

const activeManualUserBadge: IUserBadgeHasId = {
  _id: 'user-badge-1',
  user: 'target-user-1',
  badgeType: manualBadgeType,
  level: null,
  grantedAt: '2026-01-01T00:00:00.000Z',
  grantedBy: 'admin-1',
  note: 'well done',
  revokedAt: null,
  revokedBy: null,
};

const revokedManualUserBadge: IUserBadgeHasId = {
  _id: 'user-badge-2',
  user: 'target-user-1',
  badgeType: manualBadgeType,
  level: null,
  grantedAt: '2025-12-01T00:00:00.000Z',
  grantedBy: 'admin-1',
  note: null,
  revokedAt: '2026-01-15T00:00:00.000Z',
  revokedBy: 'admin-2',
};

const automaticUserBadge: IUserBadgeHasId = {
  _id: 'user-badge-3',
  user: 'target-user-1',
  badgeType: automaticBadgeType,
  level: 1,
  grantedAt: '2026-01-01T00:00:00.000Z',
  grantedBy: null,
  note: null,
  revokedAt: null,
  revokedBy: null,
};

const mutate = vi.fn();

beforeEach(() => {
  revokeUserBadge.mockReset();
  toastError.mockReset();
  mutate.mockReset();
  useSWRxUserBadges.mockImplementation(() => ({
    data: [activeManualUserBadge, revokedManualUserBadge, automaticUserBadge],
    mutate,
  }));
});

describe('GrantedManualBadgeList', () => {
  it('renders only manual-category badges, excluding automatic ones', () => {
    render(<GrantedManualBadgeList userId="target-user-1" />);

    expect(screen.getAllByText('Community Helper')).toHaveLength(2);
    expect(screen.queryByText('Contributor')).not.toBeInTheDocument();
  });

  it('shows a revoke button for an active record and revocation info for a revoked one', () => {
    render(<GrantedManualBadgeList userId="target-user-1" />);

    expect(
      screen.getByRole('button', {
        name: 'badge_management.granted_manual_badge_list.revoke',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/admin-2/)).toBeInTheDocument();
  });

  it('does not call revokeUserBadge until the confirmation dialog is confirmed', async () => {
    const user = userEvent.setup();
    render(<GrantedManualBadgeList userId="target-user-1" />);

    await user.click(
      screen.getByRole('button', {
        name: 'badge_management.granted_manual_badge_list.revoke',
      }),
    );

    expect(revokeUserBadge).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'badge_management.granted_manual_badge_list.revoke_confirm_desc',
      ),
    ).toBeInTheDocument();
  });

  it('calls revokeUserBadge with the correct args after confirming', async () => {
    const user = userEvent.setup();
    revokeUserBadge.mockResolvedValue({
      ...activeManualUserBadge,
      revokedAt: '2026-08-17T00:00:00.000Z',
      revokedBy: 'admin-3',
    });

    render(<GrantedManualBadgeList userId="target-user-1" />);

    await user.click(
      screen.getByRole('button', {
        name: 'badge_management.granted_manual_badge_list.revoke',
      }),
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', {
        name: 'badge_management.granted_manual_badge_list.revoke_confirm_button',
      }),
    );

    await waitFor(() => {
      expect(revokeUserBadge).toHaveBeenCalledWith(
        'user-badge-1',
        'target-user-1',
      );
    });
  });

  it('shows an error toast when revoke fails', async () => {
    const user = userEvent.setup();
    const error = new Error('failed');
    revokeUserBadge.mockRejectedValue(error);

    render(<GrantedManualBadgeList userId="target-user-1" />);

    await user.click(
      screen.getByRole('button', {
        name: 'badge_management.granted_manual_badge_list.revoke',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', {
        name: 'badge_management.granted_manual_badge_list.revoke_confirm_button',
      }),
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(error);
    });
  });
});
