import type { FC } from 'react';
import { useTranslation } from 'next-i18next';

import type { IBadgeTypeHasId } from '../../stores/badge-type';

type Props = {
  headerLabel?: string;
  badgeTypes: IBadgeTypeHasId[];
  onEdit?: (badgeType: IBadgeTypeHasId) => void;
  onDelete?: (badgeType: IBadgeTypeHasId) => void;
};

export const BadgeTypeTable: FC<Props> = ({
  headerLabel,
  badgeTypes,
  onEdit,
  onDelete,
}: Props) => {
  const { t } = useTranslation('admin');

  const onClickEdit = (badgeType: IBadgeTypeHasId) => {
    if (onEdit == null) {
      return;
    }
    onEdit(badgeType);
  };

  const onClickDelete = (badgeType: IBadgeTypeHasId) => {
    if (onDelete == null) {
      return;
    }
    onDelete(badgeType);
  };

  return (
    <div data-testid="grw-badge-type-table" className="mb-5">
      <h3>{headerLabel}</h3>

      <table className="table table-bordered">
        <thead>
          <tr>
            <th>{t('badge_management.name')}</th>
            <th>{t('Description')}</th>
            <th>{t('badge_management.icon_key')}</th>
            <th>{t('badge_management.category')}</th>
            <th>{t('badge_management.levels')}</th>
            <th style={{ width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {badgeTypes.length === 0 && (
            <tr>
              <td colSpan={6}>{t('badge_management.no_badge_types')}</td>
            </tr>
          )}
          {badgeTypes.map((badgeType) => (
            <tr key={badgeType._id}>
              <td>{badgeType.name}</td>
              <td>{badgeType.description}</td>
              <td>
                {badgeType.iconType === 'image' ? (
                  // biome-ignore lint/performance/noImgElement: plain admin table thumbnail, not a Next.js page image.
                  <img
                    src={
                      badgeType.iconAttachment != null
                        ? `/attachment/${badgeType.iconAttachment}`
                        : undefined
                    }
                    alt=""
                    width={24}
                    height={24}
                  />
                ) : (
                  badgeType.iconKey
                )}
              </td>
              <td>{t(`badge_management.category_${badgeType.category}`)}</td>
              <td>{badgeType.levels.length}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => onClickEdit(badgeType)}
                  aria-label={t('Edit')}
                >
                  <span className="material-symbols-outlined">edit_square</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm ms-2"
                  onClick={() => onClickDelete(badgeType)}
                  aria-label={t('Delete')}
                >
                  <span className="material-symbols-outlined">
                    delete_forever
                  </span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
