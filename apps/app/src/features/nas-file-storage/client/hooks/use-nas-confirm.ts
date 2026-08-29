import { useCallback, useMemo, useRef, useState } from 'react';

import type { NasConfirmDialogProps } from '../components/NasConfirmDialog';

export interface NasConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

export interface UseNasConfirmResult {
  /**
   * Show the confirmation dialog and resolve once the user answers: `true` after
   * the confirm button, `false` after cancel / close / backdrop. If a previous
   * `confirm()` is still awaiting an answer, this call is denied and resolves
   * `false` immediately — keeping "no explicit approval -> no destructive
   * action" the safe default rather than stacking dialogs.
   */
  confirm: (options: NasConfirmOptions) => Promise<boolean>;
  /** Spread onto `<NasConfirmDialog {...dialogProps} />` at the consumer. */
  dialogProps: NasConfirmDialogProps;
}

/**
 * Imperative wrapper around `NasConfirmDialog` for destructive NAS operations
 * (Req 5.6). The dialog stays closed until `confirm()` is called.
 */
export const useNasConfirm = (): UseNasConfirmResult => {
  const [pending, setPending] = useState<NasConfirmOptions | null>(null);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: NasConfirmOptions): Promise<boolean> => {
      if (resolverRef.current != null) {
        return Promise.resolve(false);
      }
      setPending(options);
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [],
  );

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  const dialogProps = useMemo<NasConfirmDialogProps>(
    () => ({
      isOpen: pending != null,
      title: pending?.title,
      message: pending?.message ?? '',
      confirmLabel: pending?.confirmLabel,
      cancelLabel: pending?.cancelLabel,
      isDestructive: pending?.isDestructive ?? true,
      onConfirm,
      onCancel,
    }),
    [pending, onConfirm, onCancel],
  );

  return useMemo(() => ({ confirm, dialogProps }), [confirm, dialogProps]);
};
