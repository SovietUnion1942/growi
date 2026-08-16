import type { FC } from 'react';
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';

import {
  apiv3Delete,
  apiv3Post,
  apiv3PostForm,
  apiv3Put,
  apiv3PutForm,
} from '~/client/util/apiv3-client';
import { toastError, toastSuccess } from '~/client/util/toastr';

import type { IBadgeTypeHasId } from '../../stores/badge-type';
import { useSWRxBadgeTypeList } from '../../stores/badge-type';
import type { BadgeTypeFormValues } from './BadgeTypeForm';

const BadgeTypeModal = dynamic(
  () => import('./BadgeTypeModal').then((mod) => mod.BadgeTypeModal),
  { ssr: false },
);
const BadgeTypeTable = dynamic(
  () => import('./BadgeTypeTable').then((mod) => mod.BadgeTypeTable),
  { ssr: false },
);
const BadgeTypeDeleteModal = dynamic(
  () =>
    import('./BadgeTypeDeleteModal').then((mod) => mod.BadgeTypeDeleteModal),
  { ssr: false },
);
const ManualGrantModal = dynamic(
  () => import('./ManualGrantModal').then((mod) => mod.ManualGrantModal),
  { ssr: false },
);

export const BadgeManagement: FC = () => {
  const { t } = useTranslation('admin');

  /*
   * Fetch
   */
  const { data: badgeTypeList, mutate: mutateBadgeTypes } =
    useSWRxBadgeTypeList();
  const badgeTypes = badgeTypeList ?? [];

  /*
   * State
   */
  const [selectedBadgeType, setSelectedBadgeType] = useState<
    IBadgeTypeHasId | undefined
  >(undefined);
  const [isCreateModalShown, setCreateModalShown] = useState<boolean>(false);
  const [isUpdateModalShown, setUpdateModalShown] = useState<boolean>(false);
  const [deleteTargetBadgeType, setDeleteTargetBadgeType] = useState<
    IBadgeTypeHasId | undefined
  >(undefined);
  const [isDeleteModalShown, setDeleteModalShown] = useState<boolean>(false);
  const [isManualGrantModalShown, setManualGrantModalShown] =
    useState<boolean>(false);

  /*
   * Functions
   */
  const showCreateModal = useCallback(() => {
    setCreateModalShown(true);
  }, []);

  const hideCreateModal = useCallback(() => {
    setCreateModalShown(false);
  }, []);

  const showUpdateModal = useCallback((badgeType: IBadgeTypeHasId) => {
    setSelectedBadgeType(badgeType);
    setUpdateModalShown(true);
  }, []);

  const hideUpdateModal = useCallback(() => {
    setSelectedBadgeType(undefined);
    setUpdateModalShown(false);
  }, []);

  const showDeleteModal = useCallback((badgeType: IBadgeTypeHasId) => {
    setDeleteTargetBadgeType(badgeType);
    setDeleteModalShown(true);
  }, []);

  const hideDeleteModal = useCallback(() => {
    setDeleteTargetBadgeType(undefined);
    setDeleteModalShown(false);
  }, []);

  const showManualGrantModal = useCallback(() => {
    setManualGrantModalShown(true);
  }, []);

  const hideManualGrantModal = useCallback(() => {
    setManualGrantModalShown(false);
  }, []);

  const createBadgeType = useCallback(
    async (values: BadgeTypeFormValues) => {
      try {
        // When an image icon file is attached (requirement 6.1, task 13.3's
        // multipart endpoint), submit as multipart/form-data so the
        // server's `multer` middleware (`uploads.single('file')`) can parse
        // it; otherwise submit the usual JSON body.
        if (values.iconImageFile != null) {
          // `levels` is intentionally omitted here: an image iconType is
          // only reachable for manual badges (BadgeTypeForm resets it back
          // on switching to automatic), and manual badges always have an
          // empty `levels` array, which the create route already defaults
          // to when the field is absent (`levels = []` in badge-type.ts).
          // A JSON-stringified array wouldn't survive multipart/form-data
          // as a real array for the route's `isArray()` validator anyway.
          const formData = new FormData();
          formData.append('name', values.name);
          formData.append('description', values.description);
          formData.append('iconKey', values.iconKey);
          formData.append('iconType', values.iconType);
          formData.append('category', values.category);
          formData.append('file', values.iconImageFile);
          await apiv3PostForm('/badge-types', formData);
        } else {
          await apiv3Post('/badge-types', {
            name: values.name,
            description: values.description,
            iconKey: values.iconKey,
            iconType: values.iconType,
            category: values.category,
            levels: values.levels,
          });
        }

        toastSuccess(
          t('toaster.update_successed', {
            target: t('badge_management.badge_management'),
            ns: 'commons',
          }),
        );

        // mutate
        await mutateBadgeTypes();

        hideCreateModal();
      } catch (err) {
        toastError(err);
      }
    },
    [t, mutateBadgeTypes, hideCreateModal],
  );

  const updateBadgeType = useCallback(
    async (values: BadgeTypeFormValues) => {
      if (selectedBadgeType == null) {
        return;
      }

      try {
        // `category` is intentionally omitted: it is immutable after
        // creation (see BadgeTypeForm's disabled select in edit mode) and
        // the `PUT /badge-types/:id` route does not accept it. Likewise
        // `iconType` is not sent as a plain field: the update route only
        // ever derives it from an uploaded `file` (task 13.3's
        // `saveIconImage`) and otherwise leaves the existing `iconType`
        // untouched, so a non-image selection here has nothing new to send.
        if (values.iconImageFile != null) {
          const formData = new FormData();
          formData.append('name', values.name);
          formData.append('description', values.description);
          formData.append('iconKey', values.iconKey);
          formData.append('file', values.iconImageFile);
          await apiv3PutForm(`/badge-types/${selectedBadgeType._id}`, formData);
        } else {
          await apiv3Put(`/badge-types/${selectedBadgeType._id}`, {
            name: values.name,
            description: values.description,
            iconKey: values.iconKey,
            levels: values.levels,
          });
        }

        toastSuccess(
          t('toaster.update_successed', {
            target: t('badge_management.badge_management'),
            ns: 'commons',
          }),
        );

        // mutate
        await mutateBadgeTypes();

        hideUpdateModal();
      } catch (err) {
        toastError(err);
      }
    },
    [t, mutateBadgeTypes, hideUpdateModal, selectedBadgeType],
  );

  const deleteBadgeType = useCallback(
    async (badgeTypeId: string) => {
      try {
        await apiv3Delete(`/badge-types/${badgeTypeId}`);

        toastSuccess(
          t('toaster.update_successed', {
            target: t('badge_management.badge_management'),
            ns: 'commons',
          }),
        );

        // mutate: soft delete on the server means `listBadgeTypes(false)`
        // (the only query `GET /badge-types` runs) will no longer include
        // this item, so a re-fetch naturally removes it from the table.
        await mutateBadgeTypes();

        hideDeleteModal();
      } catch (err) {
        toastError(err);
      }
    },
    [t, mutateBadgeTypes, hideDeleteModal],
  );

  return (
    <div data-testid="admin-badge-management">
      <h2 className="border-bottom">
        {t('badge_management.badge_management')}
      </h2>

      <div className="mb-3 d-flex gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={showCreateModal}
        >
          {t('badge_management.create_badge_type')}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={showManualGrantModal}
        >
          {t('badge_management.manual_grant.button')}
        </button>
      </div>

      <BadgeTypeModal
        buttonLabel={t('Create')}
        onClickSubmit={createBadgeType}
        isShow={isCreateModalShown}
        onHide={hideCreateModal}
      />

      <BadgeTypeModal
        badgeType={selectedBadgeType}
        buttonLabel={t('Update')}
        onClickSubmit={updateBadgeType}
        isShow={isUpdateModalShown}
        onHide={hideUpdateModal}
      />

      <BadgeTypeTable
        headerLabel={t('badge_management.badge_type_list')}
        badgeTypes={badgeTypes}
        onEdit={showUpdateModal}
        onDelete={showDeleteModal}
      />

      <BadgeTypeDeleteModal
        badgeType={deleteTargetBadgeType}
        isShow={isDeleteModalShown}
        onHide={hideDeleteModal}
        onDelete={deleteBadgeType}
      />

      <ManualGrantModal
        isShow={isManualGrantModalShown}
        onHide={hideManualGrantModal}
      />
    </div>
  );
};
