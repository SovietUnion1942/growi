import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import { BadgeTypeTable } from './BadgeTypeTable';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

describe('BadgeTypeTable', () => {
  it('renders a row per badge type with its name, description, and category', () => {
    render(
      <BadgeTypeTable badgeTypes={[badgeTypeA, badgeTypeB]} headerLabel="x" />,
    );

    expect(screen.getByText('Contributor')).toBeInTheDocument();
    expect(screen.getByText('Contributed to the wiki')).toBeInTheDocument();
    expect(
      screen.getByText('badge_management.category_automatic'),
    ).toBeInTheDocument();

    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(
      screen.getByText('badge_management.category_manual'),
    ).toBeInTheDocument();
  });

  it('shows the empty-state message when there are no badge types', () => {
    render(<BadgeTypeTable badgeTypes={[]} headerLabel="x" />);

    expect(
      screen.getByText('badge_management.no_badge_types'),
    ).toBeInTheDocument();
  });

  it('invokes onEdit with the clicked row badge type', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <BadgeTypeTable
        badgeTypes={[badgeTypeA, badgeTypeB]}
        headerLabel="x"
        onEdit={onEdit}
      />,
    );

    const row = screen.getByText('Reviewer').closest('tr');
    if (row == null) throw new Error('row not found');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(badgeTypeB);
  });

  it('renders a delete button per row and invokes onDelete with the clicked row badge type', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <BadgeTypeTable
        badgeTypes={[badgeTypeA, badgeTypeB]}
        headerLabel="x"
        onDelete={onDelete}
      />,
    );

    const row = screen.getByText('Reviewer').closest('tr');
    if (row == null) throw new Error('row not found');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(badgeTypeB);
  });
});
