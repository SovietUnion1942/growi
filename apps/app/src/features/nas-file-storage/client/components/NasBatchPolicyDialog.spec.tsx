import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  NasBatchPolicyDialog,
  useNasBatchPolicy,
} from './NasBatchPolicyDialog';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en_US' },
  }),
}));

describe('NasBatchPolicyDialog', () => {
  it('reports the chosen policy and cancellation through the callbacks', async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    render(
      <NasBatchPolicyDialog isOpen onSelect={onSelect} onCancel={onCancel} />,
    );

    await userEvent.click(screen.getByTestId('nas-batch-policy-rename'));
    expect(onSelect).toHaveBeenCalledWith('rename');

    await userEvent.click(
      screen.getByRole('button', { name: 'nas_storage.folder_upload.cancel' }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('useNasBatchPolicy', () => {
  it('resolves requestPolicy with the picked policy, then null on cancel', async () => {
    const { result } = renderHook(() => useNasBatchPolicy());

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.requestPolicy();
    });
    expect(result.current.dialogProps.isOpen).toBe(true);

    act(() => result.current.dialogProps.onSelect('skip'));
    await expect(promise).resolves.toBe('skip');
    await waitFor(() => expect(result.current.dialogProps.isOpen).toBe(false));

    let second!: Promise<unknown>;
    act(() => {
      second = result.current.requestPolicy();
    });
    act(() => result.current.dialogProps.onCancel());
    await expect(second).resolves.toBeNull();
  });
});
