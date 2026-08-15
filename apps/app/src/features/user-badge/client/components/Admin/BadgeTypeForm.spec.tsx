import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import { BadgeTypeForm } from './BadgeTypeForm';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const automaticBadgeType: IBadgeTypeHasId = {
  _id: 'badge-type-1',
  name: 'Contributor',
  description: 'Contributed to the wiki',
  iconKey: 'edit',
  category: 'automatic',
  levels: [
    { level: 1, name: 'Bronze', iconKey: 'edit', threshold: 10 },
    { level: 2, name: 'Silver', iconKey: 'edit', threshold: 50 },
  ],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'user-1',
};

const manualBadgeType: IBadgeTypeHasId = {
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

describe('BadgeTypeForm', () => {
  it('defaults to the automatic category and shows the levels section when creating', () => {
    render(<BadgeTypeForm submitButtonLabel="Create" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('badge_management.category')).toHaveValue(
      'automatic',
    );
    expect(screen.getByTestId('badge-type-levels-section')).toBeInTheDocument();
  });

  it('adds a level row with default values when "add level" is clicked', async () => {
    const user = userEvent.setup();
    render(<BadgeTypeForm submitButtonLabel="Create" onSubmit={vi.fn()} />);

    await user.click(screen.getByText('badge_management.add_level'));

    expect(screen.getAllByTestId('badge-type-level-row')).toHaveLength(1);
  });

  it('removes a level row when its remove button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <BadgeTypeForm
        badgeType={automaticBadgeType}
        submitButtonLabel="Update"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('badge-type-level-row')).toHaveLength(2);

    await user.click(
      screen.getAllByRole('button', {
        name: 'badge_management.remove_level',
      })[0],
    );

    expect(screen.getAllByTestId('badge-type-level-row')).toHaveLength(1);
  });

  it('hides the levels section for a manual category and does not require levels to submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BadgeTypeForm
        badgeType={manualBadgeType}
        submitButtonLabel="Update"
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.queryByTestId('badge-type-levels-section'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('Update'));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Reviewer',
      description: 'Reviewed pages',
      iconKey: 'rate_review',
      category: 'manual',
      levels: [],
    });
  });

  it('disables the category select in edit mode', () => {
    render(
      <BadgeTypeForm
        badgeType={automaticBadgeType}
        submitButtonLabel="Update"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('badge_management.category')).toBeDisabled();
  });

  it('submits the levels (stripped of the internal clientId) alongside the other fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BadgeTypeForm
        badgeType={automaticBadgeType}
        submitButtonLabel="Update"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByText('Update'));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Contributor',
      description: 'Contributed to the wiki',
      iconKey: 'edit',
      category: 'automatic',
      levels: [
        { level: 1, name: 'Bronze', iconKey: 'edit', threshold: 10 },
        { level: 2, name: 'Silver', iconKey: 'edit', threshold: 50 },
      ],
    });
  });
});
