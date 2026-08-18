import type { FC } from 'react';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal, ModalBody, ModalHeader } from 'reactstrap';

import { UserSearchList } from '~/client/components/Sidebar/Messages/UserSearchList';
import { apiv3Post } from '~/client/util/apiv3-client';
import { toastError, toastSuccess } from '~/client/util/toastr';
import type { IConversationParticipant } from '~/stores/messages';

import { useSWRxBadgeTypeList } from '../../stores/badge-type';

type Props = {
  isShow: boolean;
  onHide?: () => void;
  /** Called after a successful grant, in addition to `onHide`. */
  onGranted?: () => void;
};

/**
 * Manual-grant form: user search + manual-category badge type select + an
 * optional note textarea (design.md's `ManualGrantModal.tsx`, requirement
 * 3.1-3.5).
 *
 * The user picker reuses `UserSearchList`
 * (`~/client/components/Sidebar/Messages/UserSearchList.tsx`) rather than
 * building a new user-search implementation from scratch -- it already
 * exposes exactly the `onSelectUser(user)` contract this form needs and
 * calls a server-side user search, so no new user-search API is added by
 * this task.
 *
 * The badge type `<select>` is filtered client-side to `category ===
 * 'manual'` only: automatic-category badge types are never valid targets
 * for a manual grant (requirement 3.4; the server also rejects this with a
 * 422, see `POST /user-badges` in
 * `server/routes/user-badge.ts`/`BadgeGrantManualCategoryMismatchError`) --
 * this client-side filter simply keeps the admin from picking an option the
 * server would reject anyway.
 */
const ManualGrantModalSubstance: FC<Props> = (props: Props) => {
  const { t } = useTranslation('admin');
  const { onHide, onGranted } = props;

  const { data: badgeTypeList } = useSWRxBadgeTypeList();
  const manualBadgeTypes = (badgeTypeList ?? []).filter(
    (badgeType) => badgeType.category === 'manual',
  );

  const formId = useId();
  const badgeTypeId = `${formId}-badge-type`;
  const noteId = `${formId}-note`;

  const [selectedUser, setSelectedUser] = useState<
    IConversationParticipant | undefined
  >(undefined);
  const [selectedBadgeTypeId, setSelectedBadgeTypeId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const onChangeBadgeTypeHandler = useCallback((e) => {
    setSelectedBadgeTypeId(e.target.value);
  }, []);

  const onChangeNoteHandler = useCallback((e) => {
    setNote(e.target.value);
  }, []);

  const onClearUserHandler = useCallback(() => {
    setSelectedUser(undefined);
  }, []);

  const onSubmitHandler = useCallback(
    async (e) => {
      e.preventDefault(); // no reload

      if (selectedUser == null || selectedBadgeTypeId === '') {
        return;
      }

      const trimmedNote = note.trim();

      setIsSubmitting(true);
      try {
        await apiv3Post('/user-badges', {
          badgeTypeId: selectedBadgeTypeId,
          userId: selectedUser._id,
          ...(trimmedNote !== '' && { note: trimmedNote }),
        });

        toastSuccess(
          t('toaster.update_successed', {
            target: t('badge_management.badge_management'),
            ns: 'commons',
          }),
        );

        onGranted?.();
        onHide?.();
      } catch (err) {
        // e.g. 404 (badge type / user not found), 409 (already granted), 422
        // (automatic-category badge type) -- surface the server's message
        // rather than failing silently, and deliberately do NOT call
        // `onHide` so the admin can correct the form and retry.
        toastError(err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [selectedUser, selectedBadgeTypeId, note, onGranted, onHide, t],
  );

  const canSubmit =
    selectedUser != null && selectedBadgeTypeId !== '' && !isSubmitting;

  return (
    <>
      <ModalHeader tag="h4" toggle={onHide}>
        {t('badge_management.manual_grant.title')}
      </ModalHeader>

      <ModalBody>
        <form onSubmit={onSubmitHandler}>
          <div className="mb-3">
            <span className="form-label d-block">
              {t('badge_management.manual_grant.select_user')}
            </span>

            {selectedUser == null ? (
              <UserSearchList onSelectUser={setSelectedUser} />
            ) : (
              <div className="d-flex align-items-center">
                <span>
                  {t('badge_management.manual_grant.selected_user')}:{' '}
                  {selectedUser.name ?? selectedUser.username}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm ms-2"
                  onClick={onClearUserHandler}
                >
                  {t('badge_management.manual_grant.change_user')}
                </button>
              </div>
            )}
          </div>

          <div className="mb-3">
            <label htmlFor={badgeTypeId} className="form-label">
              {t('badge_management.manual_grant.badge_type')}
            </label>
            <select
              id={badgeTypeId}
              className="form-select"
              value={selectedBadgeTypeId}
              onChange={onChangeBadgeTypeHandler}
              disabled={manualBadgeTypes.length === 0}
              required
            >
              <option value="">
                {t('badge_management.manual_grant.badge_type_placeholder')}
              </option>
              {manualBadgeTypes.map((badgeType) => (
                <option key={badgeType._id} value={badgeType._id}>
                  {badgeType.name}
                </option>
              ))}
            </select>
            {manualBadgeTypes.length === 0 && (
              <p className="form-text text-muted">
                <small>
                  {t('badge_management.manual_grant.no_manual_badge_types')}
                </small>
              </p>
            )}
          </div>

          <div className="mb-3">
            <label htmlFor={noteId} className="form-label">
              {t('badge_management.manual_grant.note')}
            </label>
            <textarea
              id={noteId}
              className="form-control"
              placeholder={t('badge_management.manual_grant.note_placeholder')}
              value={note}
              onChange={onChangeNoteHandler}
            />
          </div>

          <div className="mt-4">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit}
            >
              {t('badge_management.manual_grant.grant')}
            </button>
          </div>
        </form>
      </ModalBody>
    </>
  );
};

/**
 * Mirrors `BadgeTypeModal.tsx`'s outer/substance split: the substance (and
 * its internal `useState`) is only mounted while `isShow` is true, so the
 * form resets on every open rather than carrying stale state between grants.
 */
export const ManualGrantModal: FC<Props> = (props: Props) => {
  const { isShow, onHide } = props;

  return (
    <Modal className="modal-lg" isOpen={isShow} toggle={onHide}>
      {isShow && <ManualGrantModalSubstance {...props} />}
    </Modal>
  );
};
