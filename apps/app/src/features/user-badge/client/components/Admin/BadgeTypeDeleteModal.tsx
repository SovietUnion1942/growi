import type { FC } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap';

import type { IBadgeTypeHasId } from '../../stores/badge-type';

type Props = {
  badgeType?: IBadgeTypeHasId;
  isShow: boolean;
  onHide?: () => void;
  onDelete?: (badgeTypeId: string) => Promise<void> | void;
};

/**
 * Confirmation modal for deleting a badge type.
 * Mirrors `UserGroupDeleteModal`'s interaction pattern (confirmation with
 * the target's name, calls the delete callback, closes via `onHide`).
 * Requirement 1.5: deleting a badge type stops new grants; already-granted
 * badges remain on their users' records (see the modal's description text).
 */
export const BadgeTypeDeleteModal: FC<Props> = ({
  badgeType,
  isShow,
  onHide,
  onDelete,
}: Props) => {
  const { t } = useTranslation('admin');

  const handleDeleteClick = useCallback(() => {
    if (onDelete == null || badgeType == null) {
      return;
    }
    onDelete(badgeType._id);
  }, [onDelete, badgeType]);

  return (
    <Modal className="modal-md" isOpen={isShow} toggle={onHide}>
      <ModalHeader tag="h4" toggle={onHide}>
        <span className="material-symbols-outlined">delete_forever</span>{' '}
        {t('badge_management.delete_modal.header')}
      </ModalHeader>
      <ModalBody>
        <div>
          <span className="fw-bold">{t('badge_management.name')}</span> : &quot;
          {badgeType?.name ?? ''}&quot;
        </div>
        <div className="text-danger mt-3">
          {t('badge_management.delete_modal.desc')}
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onHide}
          aria-label={t('Cancel')}
        >
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleDeleteClick}
          disabled={badgeType == null}
          aria-label={t('Delete')}
        >
          <span className="material-symbols-outlined">delete_forever</span>{' '}
          {t('Delete')}
        </button>
      </ModalFooter>
    </Modal>
  );
};
