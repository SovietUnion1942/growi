import type { FC } from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'next-i18next';

import type { BadgeCategory, IBadgeLevel } from '../../../interfaces/badge';
import type { IBadgeTypeHasId } from '../../stores/badge-type';

/**
 * Data collected by this form on submit. `category` is included so callers
 * can branch (it is only ever sent to the server on create — see
 * `BadgeManagement.tsx`'s `updateBadgeType` handler, which drops it before
 * calling `PUT /badge-types/:id`, matching the route's validator which does
 * not accept `category` on update).
 */
export type BadgeTypeFormValues = {
  name: string;
  description: string;
  iconKey: string;
  category: BadgeCategory;
  levels: IBadgeLevel[];
};

type Props = {
  badgeType?: IBadgeTypeHasId;
  submitButtonLabel: string;
  onSubmit: (values: BadgeTypeFormValues) => Promise<void> | void;
};

// Local-only row shape: `clientId` exists purely to give React a stable key
// for dynamically added/removed level rows and is stripped before submit.
type LevelRow = IBadgeLevel & { clientId: string };

let levelRowSeq = 0;
const nextClientId = (): string => {
  levelRowSeq += 1;
  return `level-row-${levelRowSeq}`;
};

const toLevelRows = (levels: IBadgeLevel[]): LevelRow[] =>
  levels.map((level) => ({ ...level, clientId: nextClientId() }));

export const BadgeTypeForm: FC<Props> = (props: Props) => {
  const { t } = useTranslation('admin');

  const { badgeType, submitButtonLabel, onSubmit } = props;

  const isEditMode = badgeType != null;

  // Unique per form instance so multiple mounted forms (e.g. create + edit
  // modals in the DOM at once) never collide on id/htmlFor pairs.
  const formId = useId();
  const nameId = `${formId}-name`;
  const descriptionId = `${formId}-description`;
  const iconKeyId = `${formId}-icon-key`;
  const categoryId = `${formId}-category`;

  /*
   * State
   */
  const [currentName, setName] = useState<string>(badgeType?.name ?? '');
  const [currentDescription, setDescription] = useState<string>(
    badgeType?.description ?? '',
  );
  const [currentIconKey, setIconKey] = useState<string>(
    badgeType?.iconKey ?? '',
  );
  const [currentCategory, setCategory] = useState<BadgeCategory>(
    badgeType?.category ?? 'automatic',
  );
  const [currentLevels, setLevels] = useState<LevelRow[]>(
    toLevelRows(badgeType?.levels ?? []),
  );
  const [levelsError, setLevelsError] = useState<string | null>(null);

  useEffect(() => {
    if (badgeType != null) {
      setName(badgeType.name);
      setDescription(badgeType.description);
      setIconKey(badgeType.iconKey);
      setCategory(badgeType.category);
      setLevels(toLevelRows(badgeType.levels));
    }
  }, [badgeType]);

  /*
   * Functions
   */
  const onChangeNameHandler = useCallback((e) => {
    setName(e.target.value);
  }, []);

  const onChangeDescriptionHandler = useCallback((e) => {
    setDescription(e.target.value);
  }, []);

  const onChangeIconKeyHandler = useCallback((e) => {
    setIconKey(e.target.value);
  }, []);

  const onChangeCategoryHandler = useCallback((e) => {
    setCategory(e.target.value as BadgeCategory);
  }, []);

  const onAddLevelHandler = useCallback(() => {
    setLevels((prev) => [
      ...prev,
      {
        clientId: nextClientId(),
        level: prev.length + 1,
        name: '',
        iconKey: '',
        threshold: 1,
      },
    ]);
  }, []);

  const onRemoveLevelHandler = useCallback((clientId: string) => {
    setLevels((prev) => prev.filter((row) => row.clientId !== clientId));
  }, []);

  const onChangeLevelFieldHandler = useCallback(
    (clientId: string, field: keyof IBadgeLevel, value: string | number) => {
      setLevels((prev) =>
        prev.map((row) =>
          row.clientId === clientId ? { ...row, [field]: value } : row,
        ),
      );
    },
    [],
  );

  const onSubmitHandler = useCallback(
    (e) => {
      e.preventDefault(); // no reload

      if (currentCategory === 'automatic' && currentLevels.length === 0) {
        setLevelsError(t('badge_management.levels_required_for_automatic'));
        return;
      }
      setLevelsError(null);

      onSubmit({
        name: currentName,
        description: currentDescription,
        iconKey: currentIconKey,
        category: currentCategory,
        levels: currentLevels.map(({ clientId, ...level }) => level),
      });
    },
    [
      currentCategory,
      currentLevels,
      currentName,
      currentDescription,
      currentIconKey,
      onSubmit,
      t,
    ],
  );

  const isAutomatic = currentCategory === 'automatic';

  return (
    <form onSubmit={onSubmitHandler}>
      <div className="mb-3">
        <label htmlFor={nameId} className="form-label">
          {t('badge_management.name')}
        </label>
        <input
          id={nameId}
          className="form-control"
          type="text"
          name="name"
          value={currentName}
          onChange={onChangeNameHandler}
          required
        />
      </div>

      <div className="mb-3">
        <label htmlFor={descriptionId} className="form-label">
          {t('Description')}
        </label>
        <textarea
          id={descriptionId}
          className="form-control"
          name="description"
          value={currentDescription}
          onChange={onChangeDescriptionHandler}
          required
        />
      </div>

      <div className="mb-3">
        <label htmlFor={iconKeyId} className="form-label">
          {t('badge_management.icon_key')}
        </label>
        <input
          id={iconKeyId}
          className="form-control"
          type="text"
          name="iconKey"
          placeholder={t('badge_management.icon_key_placeholder')}
          value={currentIconKey}
          onChange={onChangeIconKeyHandler}
          required
        />
      </div>

      <div className="mb-3">
        <label htmlFor={categoryId} className="form-label">
          {t('badge_management.category')}
        </label>
        <select
          id={categoryId}
          className="form-select"
          name="category"
          value={currentCategory}
          onChange={onChangeCategoryHandler}
          disabled={isEditMode}
        >
          <option value="automatic">
            {t('badge_management.category_automatic')}
          </option>
          <option value="manual">
            {t('badge_management.category_manual')}
          </option>
        </select>
        {isEditMode && (
          <p className="form-text text-muted">
            <small>{t('badge_management.category_immutable_notice')}</small>
          </p>
        )}
      </div>

      {isAutomatic && (
        <div className="mb-3" data-testid="badge-type-levels-section">
          <div className="d-flex justify-content-between align-items-center">
            <span className="form-label mb-0">
              {t('badge_management.levels')}
            </span>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={onAddLevelHandler}
            >
              {t('badge_management.add_level')}
            </button>
          </div>

          {currentLevels.map((row) => (
            <div
              key={row.clientId}
              className="row g-2 align-items-center mb-2 mt-1"
              data-testid="badge-type-level-row"
            >
              <div className="col-2">
                <input
                  className="form-control"
                  type="number"
                  aria-label={t('badge_management.level_number')}
                  placeholder={t('badge_management.level_number')}
                  value={row.level}
                  onChange={(e) =>
                    onChangeLevelFieldHandler(
                      row.clientId,
                      'level',
                      Number(e.target.value),
                    )
                  }
                  required
                />
              </div>
              <div className="col-3">
                <input
                  className="form-control"
                  type="text"
                  aria-label={t('badge_management.level_name')}
                  placeholder={t('badge_management.level_name')}
                  value={row.name}
                  onChange={(e) =>
                    onChangeLevelFieldHandler(
                      row.clientId,
                      'name',
                      e.target.value,
                    )
                  }
                  required
                />
              </div>
              <div className="col-3">
                <input
                  className="form-control"
                  type="text"
                  aria-label={t('badge_management.level_icon_key')}
                  placeholder={t('badge_management.level_icon_key')}
                  value={row.iconKey}
                  onChange={(e) =>
                    onChangeLevelFieldHandler(
                      row.clientId,
                      'iconKey',
                      e.target.value,
                    )
                  }
                  required
                />
              </div>
              <div className="col-3">
                <input
                  className="form-control"
                  type="number"
                  aria-label={t('badge_management.level_threshold')}
                  placeholder={t('badge_management.level_threshold')}
                  value={row.threshold}
                  onChange={(e) =>
                    onChangeLevelFieldHandler(
                      row.clientId,
                      'threshold',
                      Number(e.target.value),
                    )
                  }
                  required
                />
              </div>
              <div className="col-1">
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  aria-label={t('badge_management.remove_level')}
                  onClick={() => onRemoveLevelHandler(row.clientId)}
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          ))}

          {levelsError != null && (
            <p className="text-danger mt-2 mb-0">
              <small>{levelsError}</small>
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <button type="submit" className="btn btn-primary">
          {submitButtonLabel}
        </button>
      </div>
    </form>
  );
};
