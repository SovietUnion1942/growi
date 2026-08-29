import type { FC } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap';

import type { NasBatchPolicy } from '../hooks/use-nas-folder-upload';

export interface NasBatchPolicyDialogProps {
  isOpen: boolean;
  onSelect: (policy: NasBatchPolicy) => void;
  onCancel: () => void;
}

/**
 * Asks once, before a folder bulk upload starts, which policy to apply to every
 * name clash in the batch (Req 11.3). Purely a chooser — it never uploads.
 */
export const NasBatchPolicyDialog: FC<NasBatchPolicyDialogProps> = ({
  isOpen,
  onSelect,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      className="modal-md"
      isOpen={isOpen}
      toggle={onCancel}
      data-testid="nas-batch-policy-dialog"
    >
      <ModalHeader tag="h4" toggle={onCancel}>
        {t('nas_storage.folder_upload.policy_title')}
      </ModalHeader>
      <ModalBody>{t('nas_storage.folder_upload.policy_message')}</ModalBody>
      <ModalFooter className="d-flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onCancel}
        >
          {t('nas_storage.folder_upload.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-outline-danger"
          data-testid="nas-batch-policy-overwrite"
          onClick={() => onSelect('overwrite')}
        >
          {t('nas_storage.folder_upload.policy_overwrite')}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary"
          data-testid="nas-batch-policy-skip"
          onClick={() => onSelect('skip')}
        >
          {t('nas_storage.folder_upload.policy_skip')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="nas-batch-policy-rename"
          onClick={() => onSelect('rename')}
        >
          {t('nas_storage.folder_upload.policy_rename')}
        </button>
      </ModalFooter>
    </Modal>
  );
};

export interface UseNasBatchPolicyResult {
  /**
   * Open the chooser and resolve with the picked policy, or `null` when the
   * user cancels. A second call while one is pending resolves `null` — the
   * batch simply does not start.
   */
  requestPolicy: () => Promise<NasBatchPolicy | null>;
  dialogProps: NasBatchPolicyDialogProps;
}

/** Imperative promise wrapper around `NasBatchPolicyDialog`. */
export const useNasBatchPolicy = (): UseNasBatchPolicyResult => {
  const [isOpen, setIsOpen] = useState(false);
  const resolverRef = useRef<((policy: NasBatchPolicy | null) => void) | null>(
    null,
  );

  const requestPolicy = useCallback((): Promise<NasBatchPolicy | null> => {
    if (resolverRef.current != null) {
      return Promise.resolve(null);
    }
    setIsOpen(true);
    return new Promise<NasBatchPolicy | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((policy: NasBatchPolicy | null) => {
    resolverRef.current?.(policy);
    resolverRef.current = null;
    setIsOpen(false);
  }, []);

  const dialogProps = useMemo<NasBatchPolicyDialogProps>(
    () => ({
      isOpen,
      onSelect: (policy) => settle(policy),
      onCancel: () => settle(null),
    }),
    [isOpen, settle],
  );

  return useMemo(
    () => ({ requestPolicy, dialogProps }),
    [requestPolicy, dialogProps],
  );
};
