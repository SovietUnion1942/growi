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

const imageIconBadgeType: IBadgeTypeHasId = {
  _id: 'badge-type-3',
  name: 'Sponsor',
  description: 'Sponsored the project',
  iconKey: 'sponsor-icon',
  iconType: 'image',
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
      iconType: 'materialSymbol',
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
      iconType: 'materialSymbol',
      category: 'automatic',
      levels: [
        { level: 1, name: 'Bronze', iconKey: 'edit', threshold: 10 },
        { level: 2, name: 'Silver', iconKey: 'edit', threshold: 50 },
      ],
    });
  });

  describe('icon type toggle (Material Symbols / emoji / image upload)', () => {
    it('shows the image-upload option when category is manual', () => {
      render(
        <BadgeTypeForm
          badgeType={manualBadgeType}
          submitButtonLabel="Update"
          onSubmit={vi.fn()}
        />,
      );

      expect(
        screen.getByLabelText('badge_management.icon_type_image'),
      ).toBeInTheDocument();
    });

    it('hides the image-upload option when category is automatic', () => {
      render(<BadgeTypeForm submitButtonLabel="Create" onSubmit={vi.fn()} />);

      expect(
        screen.queryByLabelText('badge_management.icon_type_image'),
      ).not.toBeInTheDocument();
    });

    it('resets iconType away from image when switching category from manual to automatic', async () => {
      // Uses create mode (no `badgeType` prop) rather than edit mode: the
      // category select is disabled in edit mode (it is immutable after
      // creation — see the "disables the category select in edit mode"
      // test above), so the switch this test exercises could never happen
      // there.
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<BadgeTypeForm submitButtonLabel="Create" onSubmit={onSubmit} />);

      await user.selectOptions(
        screen.getByLabelText('badge_management.category'),
        'manual',
      );
      await user.click(
        screen.getByLabelText('badge_management.icon_type_image'),
      );
      expect(
        screen.getByLabelText('badge_management.icon_image_file'),
      ).toBeInTheDocument();

      await user.selectOptions(
        screen.getByLabelText('badge_management.category'),
        'automatic',
      );

      // The image option (and its file input) is gone, and the plain
      // iconKey text input is back, now bound to the pre-existing value.
      expect(
        screen.queryByLabelText('badge_management.icon_type_image'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('badge_management.icon_image_file'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByLabelText('badge_management.icon_key'),
      ).toBeInTheDocument();
    });

    it('submits the selected file via iconImageFile when iconType is image', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BadgeTypeForm
          badgeType={manualBadgeType}
          submitButtonLabel="Update"
          onSubmit={onSubmit}
        />,
      );

      await user.click(
        screen.getByLabelText('badge_management.icon_type_image'),
      );

      const file = new File(['icon-bytes'], 'icon.png', {
        type: 'image/png',
      });
      const fileInput = screen.getByLabelText(
        'badge_management.icon_image_file',
      );
      await user.upload(fileInput, file);

      await user.click(screen.getByText('Update'));

      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Reviewer',
        description: 'Reviewed pages',
        iconKey: 'rate_review',
        iconType: 'image',
        iconImageFile: file,
        category: 'manual',
        levels: [],
      });
    });

    it('blocks switching an existing image-icon badge type away from image without a replacement file: submit is disabled and no submit occurs', async () => {
      // Regression test for the reviewed bug: PUT /badge-types/:id only ever
      // derives `iconType` from an uploaded file, so a plain JSON update
      // switching iconType to materialSymbol/emoji would silently be
      // dropped by the server while still reporting success. The form must
      // refuse to submit this specific transition.
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BadgeTypeForm
          badgeType={imageIconBadgeType}
          submitButtonLabel="Update"
          onSubmit={onSubmit}
        />,
      );

      await user.click(
        screen.getByLabelText('badge_management.icon_type_material_symbol'),
      );

      expect(
        screen.getByText(
          'badge_management.icon_type_image_transition_unsupported',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Update')).toBeDisabled();

      await user.click(screen.getByText('Update'));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('allows submitting an existing image-icon badge type unchanged (still image) without the unsupported-transition warning', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BadgeTypeForm
          badgeType={imageIconBadgeType}
          submitButtonLabel="Update"
          onSubmit={onSubmit}
        />,
      );

      expect(
        screen.queryByText(
          'badge_management.icon_type_image_transition_unsupported',
        ),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Update')).not.toBeDisabled();

      await user.click(screen.getByText('Update'));

      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Sponsor',
        description: 'Sponsored the project',
        iconKey: 'sponsor-icon',
        iconType: 'image',
        category: 'manual',
        levels: [],
      });
    });

    it('re-enables submit once a replacement image file is attached after switching away from image', async () => {
      // Switching the radio away from image also clears any previously
      // selected file (existing behavior) -- but switching BACK to image and
      // attaching a new file is the supported path to change an existing
      // image icon, and must not be blocked.
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <BadgeTypeForm
          badgeType={imageIconBadgeType}
          submitButtonLabel="Update"
          onSubmit={onSubmit}
        />,
      );

      await user.click(
        screen.getByLabelText('badge_management.icon_type_material_symbol'),
      );
      expect(screen.getByText('Update')).toBeDisabled();

      await user.click(
        screen.getByLabelText('badge_management.icon_type_image'),
      );
      expect(screen.getByText('Update')).not.toBeDisabled();

      const file = new File(['icon-bytes'], 'new-icon.png', {
        type: 'image/png',
      });
      await user.upload(
        screen.getByLabelText('badge_management.icon_image_file'),
        file,
      );

      await user.click(screen.getByText('Update'));

      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Sponsor',
        description: 'Sponsored the project',
        iconKey: 'sponsor-icon',
        iconType: 'image',
        iconImageFile: file,
        category: 'manual',
        levels: [],
      });
    });
  });
});
