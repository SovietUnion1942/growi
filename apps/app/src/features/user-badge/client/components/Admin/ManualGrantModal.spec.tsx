import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import { ManualGrantModal } from './ManualGrantModal';

// --- module mocks ------------------------------------------------------------

const apiv3Post = vi.hoisted(() => vi.fn());
vi.mock('~/client/util/apiv3-client', () => ({ apiv3Post }));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('~/client/util/toastr', () => ({ toastSuccess, toastError }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// This test exercises `ManualGrantModal`'s own wiring (badge-type filtering,
// submit payload, toast/close behavior on success/error) -- not the
// user-search widget's own search/debounce behavior, which belongs to
// `UserSearchList`'s own tests. Stub it with a single button that reports a
// fixed user, matching the `onSelectUser` contract it's reused for (per
// design.md's "reuse an existing user-search component" guidance).
const stubUser = { _id: 'target-user-1', username: 'alice', name: 'Alice' };
vi.mock('~/client/components/Sidebar/Messages/UserSearchList', () => ({
  UserSearchList: ({
    onSelectUser,
  }: {
    onSelectUser: (user: typeof stubUser) => void;
  }) => (
    <button type="button" onClick={() => onSelectUser(stubUser)}>
      pick-alice
    </button>
  ),
}));

const badgeTypeListData: IBadgeTypeHasId[] = [
  {
    _id: 'badge-type-automatic-1',
    name: 'Contributor',
    description: 'Contributed to the wiki',
    iconKey: 'edit',
    category: 'automatic',
    levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 10 }],
    isDeleted: false,
    deletedAt: null,
    createdBy: 'user-1',
  },
  {
    _id: 'badge-type-manual-1',
    name: 'Community Helper',
    description: 'Helped others in the community',
    iconKey: 'volunteer_activism',
    category: 'manual',
    levels: [],
    isDeleted: false,
    deletedAt: null,
    createdBy: 'user-1',
  },
  {
    _id: 'badge-type-manual-2',
    name: 'Reviewer',
    description: 'Reviewed pages',
    iconKey: 'rate_review',
    category: 'manual',
    levels: [],
    isDeleted: false,
    deletedAt: null,
    createdBy: 'user-1',
  },
];

const useSWRxBadgeTypeList = vi.hoisted(() => vi.fn());
vi.mock('../../stores/badge-type', async () => {
  const actual = await vi.importActual<
    typeof import('../../stores/badge-type')
  >('../../stores/badge-type');
  return { ...actual, useSWRxBadgeTypeList };
});

// `GrantedManualBadgeList` (task 16.5) has its own dedicated spec file
// (`GrantedManualBadgeList.spec.tsx`) covering its internal behavior; here we
// only need to confirm `ManualGrantModal` mounts/unmounts it at the right
// time, so `useSWRxUserBadges` is stubbed to return an empty list.
const useSWRxUserBadges = vi.hoisted(() => vi.fn());
vi.mock('../../stores/user-badge', async () => {
  const actual = await vi.importActual<
    typeof import('../../stores/user-badge')
  >('../../stores/user-badge');
  return { ...actual, useSWRxUserBadges };
});

beforeEach(() => {
  apiv3Post.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  useSWRxBadgeTypeList.mockImplementation(() => ({
    data: badgeTypeListData,
    mutate: vi.fn(),
  }));
  useSWRxUserBadges.mockImplementation(() => ({
    data: [],
    mutate: vi.fn(),
  }));
});

const selectAliceAndBadgeType = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) => {
  await user.click(within(dialog).getByText('pick-alice'));
  await user.selectOptions(
    within(dialog).getByLabelText('badge_management.manual_grant.badge_type'),
    'badge-type-manual-1',
  );
};

describe('ManualGrantModal', () => {
  it('only lists manual-category badge types in the badge type select, excluding automatic ones', async () => {
    render(<ManualGrantModal isShow onHide={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText(
      'badge_management.manual_grant.badge_type',
    );
    const optionLabels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);

    expect(optionLabels).toContain('Community Helper');
    expect(optionLabels).toContain('Reviewer');
    expect(optionLabels).not.toContain('Contributor');
  });

  it('submits the selected user, badge type, and note to POST /user-badges', async () => {
    const user = userEvent.setup();
    apiv3Post.mockResolvedValue({ data: { userBadge: {} } });
    const onHide = vi.fn();

    render(<ManualGrantModal isShow onHide={onHide} />);
    const dialog = await screen.findByRole('dialog');

    await selectAliceAndBadgeType(user, dialog);
    await user.type(
      within(dialog).getByLabelText('badge_management.manual_grant.note'),
      'Helped a lot on the forum',
    );

    await user.click(
      within(dialog).getByRole('button', {
        name: 'badge_management.manual_grant.grant',
      }),
    );

    await waitFor(() => {
      expect(apiv3Post).toHaveBeenCalledWith('/user-badges', {
        badgeTypeId: 'badge-type-manual-1',
        userId: 'target-user-1',
        note: 'Helped a lot on the forum',
      });
    });
  });

  it('shows a success toast and closes the modal after a successful grant', async () => {
    const user = userEvent.setup();
    apiv3Post.mockResolvedValue({ data: { userBadge: {} } });
    const onHide = vi.fn();

    render(<ManualGrantModal isShow onHide={onHide} />);
    const dialog = await screen.findByRole('dialog');

    await selectAliceAndBadgeType(user, dialog);
    await user.click(
      within(dialog).getByRole('button', {
        name: 'badge_management.manual_grant.grant',
      }),
    );

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onHide).toHaveBeenCalled();
    });
  });

  it('shows an error toast and keeps the modal open when the grant fails (e.g. already granted)', async () => {
    const user = userEvent.setup();
    apiv3Post.mockRejectedValue([
      { message: 'This badge has already been granted to this user.' },
    ]);
    const onHide = vi.fn();

    render(<ManualGrantModal isShow onHide={onHide} />);
    const dialog = await screen.findByRole('dialog');

    await selectAliceAndBadgeType(user, dialog);
    await user.click(
      within(dialog).getByRole('button', {
        name: 'badge_management.manual_grant.grant',
      }),
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables the grant button until both a user and a manual badge type are selected', async () => {
    render(<ManualGrantModal isShow onHide={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByRole('button', {
        name: 'badge_management.manual_grant.grant',
      }),
    ).toBeDisabled();
  });

  it('does not render GrantedManualBadgeList before a target user is selected', async () => {
    render(<ManualGrantModal isShow onHide={vi.fn()} />);
    await screen.findByRole('dialog');

    expect(
      screen.queryByTestId('grw-granted-manual-badge-list'),
    ).not.toBeInTheDocument();
  });

  it('renders GrantedManualBadgeList for the selected target user once a user is selected', async () => {
    const user = userEvent.setup();
    render(<ManualGrantModal isShow onHide={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByText('pick-alice'));

    expect(
      screen.getByTestId('grw-granted-manual-badge-list'),
    ).toBeInTheDocument();
    expect(useSWRxUserBadges).toHaveBeenCalledWith('target-user-1', {
      includeRevoked: true,
    });
  });
});
