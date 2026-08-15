import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import { BadgeTypeDeleteModal } from './BadgeTypeDeleteModal';

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

describe('BadgeTypeDeleteModal', () => {
  it('shows the target badge type name in the confirmation message', () => {
    render(
      <BadgeTypeDeleteModal badgeType={badgeTypeA} isShow onHide={vi.fn()} />,
    );

    expect(screen.getByText(/Contributor/)).toBeInTheDocument();
  });

  it('calls onDelete with the badge type id when the Delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <BadgeTypeDeleteModal
        badgeType={badgeTypeA}
        isShow
        onHide={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Delete/ }));

    expect(onDelete).toHaveBeenCalledWith('badge-type-1');
  });

  it('calls onHide without calling onDelete when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onHide = vi.fn();

    render(
      <BadgeTypeDeleteModal
        badgeType={badgeTypeA}
        isShow
        onHide={onHide}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onHide).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
