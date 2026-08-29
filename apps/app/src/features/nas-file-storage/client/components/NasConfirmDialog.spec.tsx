import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NasConfirmDialog } from './NasConfirmDialog';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en_US' },
  }),
}));

describe('NasConfirmDialog', () => {
  it('renders title and message while open', () => {
    render(
      <NasConfirmDialog
        isOpen
        title="Delete folder"
        message="This deletes everything inside."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Delete folder')).toBeInTheDocument();
    expect(
      screen.getByText('This deletes everything inside.'),
    ).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <NasConfirmDialog
        isOpen={false}
        title="Delete folder"
        message="This deletes everything inside."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText('Delete folder')).not.toBeInTheDocument();
    expect(
      screen.queryByText('This deletes everything inside.'),
    ).not.toBeInTheDocument();
  });

  it('calls onConfirm (and not onCancel) when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <NasConfirmDialog
        isOpen
        message="Proceed?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel (and not onConfirm) when the cancel button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <NasConfirmDialog
        isOpen
        message="Proceed?"
        cancelLabel="Keep it"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when the close (X) control is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <NasConfirmDialog
        isOpen
        title="Overwrite move"
        message="Proceed?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByLabelText('Close'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('uses danger styling for the confirm button by default (destructive)', () => {
    render(
      <NasConfirmDialog
        isOpen
        message="Proceed?"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass(
      'btn-danger',
    );
  });

  it('drops danger styling when isDestructive is false', () => {
    render(
      <NasConfirmDialog
        isOpen
        message="Proceed?"
        confirmLabel="OK"
        isDestructive={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'OK' });
    expect(confirmButton).not.toHaveClass('btn-danger');
    expect(confirmButton).toHaveClass('btn-primary');
  });
});
