import type { FC } from 'react';
import { useTranslation } from 'next-i18next';

import type { IBadgeTypeHasId } from '../../stores/badge-type';

type Props = {
  headerLabel?: string;
  badgeTypes: IBadgeTypeHasId[];
  onEdit?: (badgeType: IBadgeTypeHasId) => void;
};

export const BadgeTypeTable: FC<Props> = ({
  headerLabel,
  badgeTypes,
  onEdit,
}: Props) => {
  const { t } = useTranslation('admin');

  const onClickEdit = (badgeType: IBadgeTypeHasId) => {
    if (onEdit == null) {
      return;
    }
    onEdit(badgeType);
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
            <th style={{ width: 70 }}></th>
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
              <td>{badgeType.iconKey}</td>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
