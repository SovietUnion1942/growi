import type { FC } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap';

export interface NasConfirmDialogProps {
  isOpen: boolean;
  /** Resolved header text. When omitted only the close button shows in the header. */
  title?: string;
  /** Resolved body text describing what is about to happen. */
  message: string;
  /** Overrides the default confirm-button label. */
  confirmLabel?: string;
  /** Overrides the default cancel-button label. */
  cancelLabel?: string;
  /** Renders the confirm button with danger styling. Defaults to `true` because
   * this dialog only ever gates destructive operations (Req 5.6). */
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Controlled confirmation dialog for destructive NAS operations (delete, and a
 * move that overwrites the destination) — Requirement 5.6.
 *
 * This component is purely a gate: it never calls `remove`/`move` itself. The
 * confirm button invokes `onConfirm`; the cancel button, the close icon and the
 * backdrop all invoke `onCancel`. `useNasConfirm` wraps it into an imperative
 * `confirm(): Promise<boolean>` so a consumer can write
 * `if (await confirm({ message })) { await remove(...) }`.
 */
export const NasConfirmDialog: FC<NasConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isDestructive = true,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  return (
    <Modal
      className="modal-md"
      isOpen={isOpen}
      toggle={onCancel}
      data-testid="nas-confirm-dialog"
    >
      <ModalHeader tag="h4" toggle={onCancel}>
        {title}
      </ModalHeader>
      <ModalBody>
        <div className={isDestructive ? 'text-danger' : undefined}>
          {message}
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onCancel}
        >
          {cancelLabel ?? t('Cancel')}
        </button>
        <button
          type="button"
          className={isDestructive ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={handleConfirm}
        >
          {confirmLabel ?? t('Yes')}
        </button>
      </ModalFooter>
    </Modal>
  );
};
