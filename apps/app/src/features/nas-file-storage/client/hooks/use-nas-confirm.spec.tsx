import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NasConfirmDialog } from '../components/NasConfirmDialog';
import type { NasConfirmOptions } from './use-nas-confirm';
import { useNasConfirm } from './use-nas-confirm';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en_US' },
  }),
}));

type HarnessProps = {
  onResult: (result: boolean) => void;
  onDestroy?: () => void;
};

/** A realistic consumer: renders the dialog and gates `onDestroy` behind confirm(). */
const Harness = ({ onResult, onDestroy }: HarnessProps) => {
  const { confirm, dialogProps } = useNasConfirm();

  const request = async (options: NasConfirmOptions) => {
    const ok = await confirm(options);
    onResult(ok);
    if (ok) {
      onDestroy?.();
    }
  };

  return (
    <>
      <button type="button" onClick={() => request({ message: 'delete it?' })}>
        start
      </button>
      <button type="button" onClick={() => request({ message: 'second' })}>
        start-2
      </button>
      <NasConfirmDialog {...dialogProps} />
    </>
  );
};

describe('useNasConfirm', () => {
  it('keeps the dialog closed until confirm() is called', () => {
    render(<Harness onResult={vi.fn()} />);
    expect(screen.queryByText('delete it?')).not.toBeInTheDocument();
  });

  it('resolves true after the confirm button is clicked', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    await userEvent.click(screen.getByRole('button', { name: 'start' }));
    expect(await screen.findByText('delete it?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('resolves false after the cancel button is clicked', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    await userEvent.click(screen.getByRole('button', { name: 'start' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('denies a second confirm() while one is pending (resolves false, no dialog swap)', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    await userEvent.click(screen.getByRole('button', { name: 'start' }));
    await userEvent.click(screen.getByRole('button', { name: 'start-2' }));

    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByText('second')).not.toBeInTheDocument();
    expect(screen.getByText('delete it?')).toBeInTheDocument();
  });

  it('gates a destructive action: Cancel -> callback never runs; Confirm -> runs once (Req 5.6)', async () => {
    const onResult = vi.fn();
    const onDestroy = vi.fn();
    render(<Harness onResult={onResult} onDestroy={onDestroy} />);

    await userEvent.click(screen.getByRole('button', { name: 'start' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(onDestroy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'start' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await vi.waitFor(() => expect(onDestroy).toHaveBeenCalledTimes(1));
  });
});
