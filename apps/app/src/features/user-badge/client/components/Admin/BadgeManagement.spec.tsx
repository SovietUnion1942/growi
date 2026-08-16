import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import { BadgeManagement } from './BadgeManagement';

// --- module mocks ------------------------------------------------------------

const apiv3Post = vi.hoisted(() => vi.fn());
const apiv3PostForm = vi.hoisted(() => vi.fn());
const apiv3Put = vi.hoisted(() => vi.fn());
const apiv3PutForm = vi.hoisted(() => vi.fn());
const apiv3Delete = vi.hoisted(() => vi.fn());
vi.mock('~/client/util/apiv3-client', () => ({
  apiv3Post,
  apiv3PostForm,
  apiv3Put,
  apiv3PutForm,
  apiv3Delete,
}));

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
vi.mock('./BadgeTypeDeleteModal', async () => {
  const actual = await vi.importActual<typeof import('./BadgeTypeDeleteModal')>(
    './BadgeTypeDeleteModal',
  );
  return {
    default: actual.BadgeTypeDeleteModal,
    BadgeTypeDeleteModal: actual.BadgeTypeDeleteModal,
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
  apiv3PostForm.mockReset();
  apiv3Put.mockReset();
  apiv3PutForm.mockReset();
  apiv3Delete.mockReset();
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
        iconType: 'materialSymbol',
        category: 'manual',
        levels: [],
      });
    });

    expect(mutateBadgeTypes).toHaveBeenCalled();
  });

  it('creates a badge type with an image icon: selecting image upload and choosing a file submits multipart/form-data to the badge-types endpoint (task 13.3)', async () => {
    const user = userEvent.setup();
    apiv3PostForm.mockResolvedValue({
      data: { badgeType: { ...badgeTypeB, _id: 'badge-type-3' } },
    });

    render(<BadgeManagement />);

    await user.click(screen.getByText('badge_management.create_badge_type'));
    const dialog = await screen.findByRole('dialog');

    await user.type(
      within(dialog).getByLabelText('badge_management.name'),
      'Image Badge',
    );
    await user.type(
      within(dialog).getByLabelText('Description'),
      'Has an image icon',
    );
    await user.selectOptions(
      within(dialog).getByLabelText('badge_management.category'),
      'manual',
    );
    await user.click(
      within(dialog).getByLabelText('badge_management.icon_type_image'),
    );

    const file = new File(['icon-bytes'], 'icon.png', { type: 'image/png' });
    await user.upload(
      within(dialog).getByLabelText('badge_management.icon_image_file'),
      file,
    );

    await user.click(within(dialog).getByText('Create'));

    await waitFor(() => {
      expect(apiv3PostForm).toHaveBeenCalledTimes(1);
    });
    expect(apiv3Post).not.toHaveBeenCalled();

    const [path, formData] = apiv3PostForm.mock.calls[0];
    expect(path).toBe('/badge-types');
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('name')).toBe('Image Badge');
    expect(formData.get('description')).toBe('Has an image icon');
    expect(formData.get('iconType')).toBe('image');
    expect(formData.get('category')).toBe('manual');
    expect(formData.get('file')).toBe(file);

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

  it('deletes a badge type: confirming the delete modal calls apiv3Delete with the id, refreshes the list, and closes the modal', async () => {
    const user = userEvent.setup();
    apiv3Delete.mockResolvedValue({ data: { isDeleted: true } });

    render(<BadgeManagement />);

    const row = screen.getByText('Reviewer').closest('tr');
    if (row == null) throw new Error('row not found');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Reviewer/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(apiv3Delete).toHaveBeenCalledWith('/badge-types/badge-type-2');
    });
    expect(mutateBadgeTypes).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('cancels a badge type deletion: clicking Cancel closes the modal without calling apiv3Delete', async () => {
    const user = userEvent.setup();

    render(<BadgeManagement />);

    const row = screen.getByText('Reviewer').closest('tr');
    if (row == null) throw new Error('row not found');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(apiv3Delete).not.toHaveBeenCalled();
  });

  it('removes the deleted badge type row from the list after refetch (soft delete excludes it from listBadgeTypes(false))', async () => {
    const user = userEvent.setup();
    apiv3Delete.mockResolvedValue({ data: { isDeleted: true } });
    // Simulate the server-side soft delete: after `mutate()` re-runs
    // `GET /badge-types`, the deleted item is no longer present because
    // `listBadgeTypes(false)` excludes soft-deleted items.
    mutateBadgeTypes.mockImplementation(() => {
      badgeTypeListData = badgeTypeListData.filter(
        (bt) => bt._id !== 'badge-type-2',
      );
      return Promise.resolve(badgeTypeListData);
    });

    const { rerender } = render(<BadgeManagement />);

    const row = screen.getByText('Reviewer').closest('tr');
    if (row == null) throw new Error('row not found');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mutateBadgeTypes).toHaveBeenCalled();
    });

    rerender(<BadgeManagement />);

    expect(screen.queryByText('Reviewer')).not.toBeInTheDocument();
    expect(screen.getByText('Contributor')).toBeInTheDocument();
  });
});
