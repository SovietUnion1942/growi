import type { FC } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal, ModalBody, ModalFooter, ModalHeader } from 'reactstrap';

import { toastError } from '~/client/util/toastr';

import {
  type IUserBadgeHasId,
  revokeUserBadge,
  useSWRxUserBadges,
} from '../../stores/user-badge';

type Props = {
  userId: string;
};

/**
 * Confirmation sub-component for revoking a single manually-granted
 * `UserBadge`. Mirrors `BadgeTypeDeleteModal.tsx`'s confirm-then-act
 * interaction pattern (open a modal naming the target, require an explicit
 * confirm click before the destructive API call fires) rather than a plain
 * `window.confirm`, so the UX and testing approach stay consistent with the
 * rest of this admin surface.
 */
type RevokeConfirmModalProps = {
  userBadge: IUserBadgeHasId;
  isShow: boolean;
  onHide: () => void;
  onConfirm: (userBadge: IUserBadgeHasId) => Promise<void> | void;
};

const RevokeConfirmModal: FC<RevokeConfirmModalProps> = ({
  userBadge,
  isShow,
  onHide,
  onConfirm,
}: RevokeConfirmModalProps) => {
  const { t } = useTranslation('admin');

  const handleConfirmClick = useCallback(() => {
    onConfirm(userBadge);
  }, [onConfirm, userBadge]);

  return (
    <Modal className="modal-md" isOpen={isShow} toggle={onHide}>
      <ModalHeader tag="h4" toggle={onHide}>
        {t('badge_management.granted_manual_badge_list.revoke_confirm_title')}
      </ModalHeader>
      <ModalBody>
        <div>
          <span className="fw-bold">{t('badge_management.name')}</span> : &quot;
          {userBadge.badgeType.name}&quot;
        </div>
        <div className="text-danger mt-3">
          {t('badge_management.granted_manual_badge_list.revoke_confirm_desc')}
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
          onClick={handleConfirmClick}
        >
          {t(
            'badge_management.granted_manual_badge_list.revoke_confirm_button',
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
};

/**
 * Lists every manually-granted `UserBadge` (both active and revoked) for the
 * given user, rendered inside `ManualGrantModal.tsx` once a target user is
 * selected (requirement 7.1, 7.7).
 *
 * Fetches with `includeRevoked: true` so revoked records are visible to the
 * admin (requirement 7.7), then filters client-side to `badgeType.category
 * === 'manual'` -- a defensive guard per the task description, even though
 * in practice every `UserBadge` reachable via this admin flow is already
 * manual-only.
 *
 * Active records get a revoke button gated behind `RevokeConfirmModal`
 * (mirrors `BadgeTypeDeleteModal.tsx`); revoked records show the revocation
 * date/actor instead of a button. After a successful revoke,
 * `revokeUserBadge`'s own `mutate` call (in `stores/user-badge.ts`)
 * revalidates the SWR cache this component reads from, so the row switches
 * to "revoked" automatically without any local state bookkeeping here.
 */
export const GrantedManualBadgeList: FC<Props> = ({ userId }: Props) => {
  const { t } = useTranslation('admin');

  const { data: userBadges } = useSWRxUserBadges(userId, {
    includeRevoked: true,
  });
  const manualUserBadges = (userBadges ?? []).filter(
    (userBadge) => userBadge.badgeType.category === 'manual',
  );

  const [revokeTarget, setRevokeTarget] = useState<IUserBadgeHasId | null>(
    null,
  );

  const onClickRevokeHandler = useCallback((userBadge: IUserBadgeHasId) => {
    setRevokeTarget(userBadge);
  }, []);

  const onHideConfirmHandler = useCallback(() => {
    setRevokeTarget(null);
  }, []);

  const onConfirmRevokeHandler = useCallback(
    async (userBadge: IUserBadgeHasId) => {
      try {
        await revokeUserBadge(userBadge._id, userId);
        setRevokeTarget(null);
      } catch (err) {
        toastError(err);
      }
    },
    [userId],
  );

  return (
    <div data-testid="grw-granted-manual-badge-list">
      <h4>{t('badge_management.granted_manual_badge_list.title')}</h4>

      {manualUserBadges.length === 0 ? (
        <p className="text-muted">
          {t('badge_management.granted_manual_badge_list.no_badges')}
        </p>
      ) : (
        <ul className="list-group">
          {manualUserBadges.map((userBadge) => (
            <li
              key={userBadge._id}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <span>{userBadge.badgeType.name}</span>

              {userBadge.revokedAt == null ? (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => onClickRevokeHandler(userBadge)}
                >
                  {t('badge_management.granted_manual_badge_list.revoke')}
                </button>
              ) : (
                <span className="text-muted">
                  <small>
                    {t(
                      'badge_management.granted_manual_badge_list.revoked_info',
                      {
                        date: new Date(
                          userBadge.revokedAt,
                        ).toLocaleDateString(),
                        revokedBy: userBadge.revokedBy ?? '',
                      },
                    )}
                  </small>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {revokeTarget != null && (
        <RevokeConfirmModal
          userBadge={revokeTarget}
          isShow={revokeTarget != null}
          onHide={onHideConfirmHandler}
          onConfirm={onConfirmRevokeHandler}
        />
      )}
    </div>
  );
};
