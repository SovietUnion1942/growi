import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import { BadgeManagement } from './BadgeManagement';

// --- module mocks ------------------------------------------------------------

const apiv3Post = vi.hoisted(() => vi.fn());
const apiv3Put = vi.hoisted(() => vi.fn());
vi.mock('~/client/util/apiv3-client', () => ({ apiv3Post, apiv3Put }));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('~/client/util/toastr', () => ({ toastSuccess, toastError }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `BadgeManagement` loads `BadgeTypeModal`/`BadgeTypeTable` via
// `next/dynamic(..., { ssr: false })` (matching `UserGroupPage.tsx`'s
// pattern). Rather than mocking `next/dynamic` itself, `vi.mock` the real
// component modules to render synchronously — this keeps the real
// `BadgeTypeForm`/`BadgeTypeTable` behavior under test while removing the
// dynamic-import's loading-state flicker.
vi.mock('./BadgeTypeModal', async () => {
  const actual =
    await vi.importActual<typeof import('./BadgeTypeModal')>(
      './BadgeTypeModal',
    );
  return {
    default: actual.BadgeTypeModal,
    BadgeTypeModal: actual.BadgeTypeModal,
  };
});
vi.mock('./BadgeTypeTable', async () => {
  const actual =
    await vi.importActual<typeof import('./BadgeTypeTable')>(
      './BadgeTypeTable',
    );
  return {
    default: actual.BadgeTypeTable,
    BadgeTypeTable: actual.BadgeTypeTable,
  };
});

const mutateBadgeTypes = vi.hoisted(() => vi.fn());
let badgeTypeListData: IBadgeTypeHasId[] = [];
const useSWRxBadgeTypeList = vi.hoisted(() => vi.fn());
vi.mock('../../stores/badge-type', () => ({
  useSWRxBadgeTypeList,
}));

const badgeTypeA: IBadgeTypeHasId = {
  _id: 'badge-type-1',
  name: 'Contributor',
  description: 'Contributed to the wiki',
  iconKey: 'edit',
  category: 'automatic',
  levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 10 }],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'user-1',
};

const badgeTypeB: IBadgeTypeHasId = {
  _id: 'badge-type-2',
  name: 'Reviewer',
  description: 'Reviewed pages',
  iconKey: 'rate_review',
  category: 'manual',
  levels: [],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'user-1',
};

beforeEach(() => {
  apiv3Post.mockReset();
  apiv3Put.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  mutateBadgeTypes.mockReset();
  badgeTypeListData = [badgeTypeA, badgeTypeB];
  useSWRxBadgeTypeList.mockImplementation(() => ({
    data: badgeTypeListData,
    mutate: mutateBadgeTypes,
  }));
});

describe('BadgeManagement', () => {
  it('renders the badge type list', async () => {
    render(<BadgeManagement />);

    // `BadgeTypeTable` is loaded via `next/dynamic`, which always resolves
    // asynchronously (at least one microtask) even though the underlying
    // module itself is mocked to resolve immediately — so this must be
    // awaited rather than asserted synchronously.
    expect(await screen.findByText('Contributor')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });

  it('creates a badge type: submitting the create form calls apiv3Post with the entered values and refreshes the list', async () => {
    const user = userEvent.setup();
    apiv3Post.mockResolvedValue({
      data: { badgeType: { ...badgeTypeA, _id: 'badge-type-3' } },
    });

    render(<BadgeManagement />);

    await user.click(screen.getByText('badge_management.create_badge_type'));

    const dialog = await screen.findByRole('dialog');

    await user.type(
      within(dialog).getByLabelText('badge_management.name'),
      'New Badge',
    );
    await user.type(
      within(dialog).getByLabelText('Description'),
      'A brand new badge',
    );
    await user.type(
      within(dialog).getByLabelText('badge_management.icon_key'),
      'star',
    );
    await user.selectOptions(
      within(dialog).getByLabelText('badge_management.category'),
      'manual',
    );

    await user.click(within(dialog).getByText('Create'));

    await waitFor(() => {
      expect(apiv3Post).toHaveBeenCalledWith('/badge-types', {
        name: 'New Badge',
        description: 'A brand new badge',
        iconKey: 'star',
        category: 'manual',
        levels: [],
      });
    });

    expect(mutateBadgeTypes).toHaveBeenCalled();
  });

  it('blocks submission of an automatic-category badge type with no levels and shows a validation message', async () => {
    const user = userEvent.setup();

    render(<BadgeManagement />);

    await user.click(screen.getByText('badge_management.create_badge_type'));
    const dialog = await screen.findByRole('dialog');

    await user.type(
      within(dialog).getByLabelText('badge_management.name'),
      'Automatic Badge',
    );
    await user.type(within(dialog).getByLabelText('Description'), 'desc');
    await user.type(
      within(dialog).getByLabelText('badge_management.icon_key'),
      'star',
    );
    // 'automatic' is already the default category selection

    await user.click(within(dialog).getByText('Create'));

    expect(
      within(dialog).getByText(
        'badge_management.levels_required_for_automatic',
      ),
    ).toBeInTheDocument();
    expect(apiv3Post).not.toHaveBeenCalled();
  });

  it('updates a badge type: editing an existing row calls apiv3Put with the id and updated fields, omitting category', async () => {
    const user = userEvent.setup();
    apiv3Put.mockResolvedValue({ data: { badgeType: badgeTypeB } });

    render(<BadgeManagement />);

    const row = screen.getByText('Reviewer').closest('tr');
    if (row == null) throw new Error('row not found');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');

    const nameInput = within(dialog).getByLabelText('badge_management.name');
    expect(nameInput).toHaveValue('Reviewer');

    await user.clear(nameInput);
    await user.type(nameInput, 'Senior Reviewer');

    await user.click(within(dialog).getByText('Update'));

    await waitFor(() => {
      expect(apiv3Put).toHaveBeenCalledWith('/badge-types/badge-type-2', {
        name: 'Senior Reviewer',
        description: 'Reviewed pages',
        iconKey: 'rate_review',
        levels: [],
      });
    });
  });

  it('disables the category select and shows an immutability notice when editing', async () => {
    const user = userEvent.setup();

    render(<BadgeManagement />);

    const row = screen.getByText('Contributor').closest('tr');
    if (row == null) throw new Error('row not found');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByLabelText('badge_management.category'),
    ).toBeDisabled();
    expect(
      within(dialog).getByText('badge_management.category_immutable_notice'),
    ).toBeInTheDocument();
  });

  it('shows the levels section only when category is automatic', async () => {
    const user = userEvent.setup();

    render(<BadgeManagement />);

    await user.click(screen.getByText('badge_management.create_badge_type'));
    const dialog = await screen.findByRole('dialog');

    // default category is 'automatic'
    expect(
      within(dialog).getByTestId('badge-type-levels-section'),
    ).toBeInTheDocument();

    await user.selectOptions(
      within(dialog).getByLabelText('badge_management.category'),
      'manual',
    );

    expect(
      within(dialog).queryByTestId('badge-type-levels-section'),
    ).not.toBeInTheDocument();
  });
});
