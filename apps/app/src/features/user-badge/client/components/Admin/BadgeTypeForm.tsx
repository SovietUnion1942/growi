import type { FC } from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'next-i18next';

import type {
  BadgeCategory,
  BadgeIconType,
  IBadgeLevel,
} from '../../../interfaces/badge';
import type { IBadgeTypeHasId } from '../../stores/badge-type';

/**
 * Data collected by this form on submit. `category` is included so callers
 * can branch (it is only ever sent to the server on create — see
 * `BadgeManagement.tsx`'s `updateBadgeType` handler, which drops it before
 * calling `PUT /badge-types/:id`, matching the route's validator which does
 * not accept `category` on update).
 *
 * `iconType` selects how `iconKey` is interpreted (Material Symbols name /
 * emoji) or, when `'image'`, that an uploaded file should be used instead
 * (requirement 6.1). `iconImageFile` is only populated when `iconType`
 * is `'image'` and a file has been selected; callers (`BadgeManagement.tsx`)
 * use its presence to decide whether to submit as multipart/form-data to
 * the task-13.3 upload endpoint instead of a JSON body.
 */
export type BadgeTypeFormValues = {
  name: string;
  description: string;
  iconKey: string;
  iconType: BadgeIconType;
  iconImageFile?: File;
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
  const iconTypeMaterialSymbolId = `${formId}-icon-type-material-symbol`;
  const iconTypeEmojiId = `${formId}-icon-type-emoji`;
  const iconTypeImageId = `${formId}-icon-type-image`;
  const iconImageFileId = `${formId}-icon-image-file`;

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
  const [currentIconType, setIconType] = useState<BadgeIconType>(
    badgeType?.iconType ?? 'materialSymbol',
  );
  const [currentIconImageFile, setIconImageFile] = useState<File | undefined>(
    undefined,
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
      setIconType(badgeType.iconType ?? 'materialSymbol');
      setIconImageFile(undefined);
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

  const onChangeIconTypeHandler = useCallback((e) => {
    const nextIconType = e.target.value as BadgeIconType;
    setIconType(nextIconType);
    // The file input and the iconKey text input are mutually-exclusive
    // representations (see design constraints) — dropping a previously
    // selected file when switching away from 'image' keeps the discarded
    // input from silently resurfacing on a later re-selection of 'image'.
    if (nextIconType !== 'image') {
      setIconImageFile(undefined);
    }
  }, []);

  const onChangeIconImageFileHandler = useCallback((e) => {
    setIconImageFile(e.target.files?.[0]);
  }, []);

  const onChangeCategoryHandler = useCallback((e) => {
    const nextCategory = e.target.value as BadgeCategory;
    setCategory(nextCategory);
    // Requirement 6.1a: 'image' is only a valid iconType for manual badges.
    // Proactively reset to a non-image default when switching to
    // 'automatic' so an invalid combination is never submitted, rather than
    // relying on the server's 400 (task 13.1's schema validation).
    if (nextCategory === 'automatic') {
      setIconType((prev) => (prev === 'image' ? 'materialSymbol' : prev));
      setIconImageFile(undefined);
    }
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

  // Guards a known gap in the update path (task 13.3's PUT /badge-types/:id
  // route only ever derives `iconType` from an uploaded `file` — it never
  // reads a plain `iconType` field from the JSON body, unlike
  // BadgeTypeService.updateBadgeType, which WOULD honor it if the route
  // forwarded it). Concretely: switching an existing image-icon badge type's
  // radio to Material Symbols/Emoji and submitting without a new file would
  // report success while the server silently keeps `iconType: 'image'` and
  // the old attachment untouched. Block that specific transition client-side
  // rather than let the admin see a false-success toast; replacing the image
  // (staying on 'image' with a newly selected file) is unaffected and still
  // goes through the multipart route, which DOES apply correctly.
  const isUnsupportedImageTransition =
    isEditMode &&
    badgeType?.iconType === 'image' &&
    currentIconType !== 'image';

  const onSubmitHandler = useCallback(
    (e) => {
      e.preventDefault(); // no reload

      if (currentCategory === 'automatic' && currentLevels.length === 0) {
        setLevelsError(t('badge_management.levels_required_for_automatic'));
        return;
      }
      setLevelsError(null);

      // Defense in depth: the submit button is already disabled for this
      // case (see `isUnsupportedImageTransition`), but native Enter-key
      // submission from a text input can bypass a disabled submit button in
      // some browsers, so re-check here too.
      if (isUnsupportedImageTransition) {
        return;
      }

      onSubmit({
        name: currentName,
        description: currentDescription,
        iconKey: currentIconKey,
        iconType: currentIconType,
        ...(currentIconType === 'image' &&
          currentIconImageFile != null && {
            iconImageFile: currentIconImageFile,
          }),
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
      currentIconType,
      currentIconImageFile,
      isUnsupportedImageTransition,
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
        <span className="form-label d-block">
          {t('badge_management.icon_type')}
        </span>
        <div className="form-check form-check-inline">
          <input
            id={iconTypeMaterialSymbolId}
            className="form-check-input"
            type="radio"
            name="iconType"
            value="materialSymbol"
            checked={currentIconType === 'materialSymbol'}
            onChange={onChangeIconTypeHandler}
          />
          <label
            className="form-check-label"
            htmlFor={iconTypeMaterialSymbolId}
          >
            {t('badge_management.icon_type_material_symbol')}
          </label>
        </div>
        <div className="form-check form-check-inline">
          <input
            id={iconTypeEmojiId}
            className="form-check-input"
            type="radio"
            name="iconType"
            value="emoji"
            checked={currentIconType === 'emoji'}
            onChange={onChangeIconTypeHandler}
          />
          <label className="form-check-label" htmlFor={iconTypeEmojiId}>
            {t('badge_management.icon_type_emoji')}
          </label>
        </div>
        {/* Requirement 6.1a: the image-upload option only makes sense for
            manual badges — automatic badges resolve their icon per-level
            via the level rows' own iconKey inputs below. */}
        {!isAutomatic && (
          <div className="form-check form-check-inline">
            <input
              id={iconTypeImageId}
              className="form-check-input"
              type="radio"
              name="iconType"
              value="image"
              checked={currentIconType === 'image'}
              onChange={onChangeIconTypeHandler}
            />
            <label className="form-check-label" htmlFor={iconTypeImageId}>
              {t('badge_management.icon_type_image')}
            </label>
          </div>
        )}
        {isUnsupportedImageTransition && (
          <p className="text-danger mt-2 mb-0">
            <small>
              {t('badge_management.icon_type_image_transition_unsupported')}
            </small>
          </p>
        )}
      </div>

      {currentIconType === 'image' ? (
        <div className="mb-3" key="icon-image-file">
          <label htmlFor={iconImageFileId} className="form-label">
            {t('badge_management.icon_image_file')}
          </label>
          <input
            id={iconImageFileId}
            className="form-control"
            type="file"
            name="file"
            accept="image/*"
            onChange={onChangeIconImageFileHandler}
          />
        </div>
      ) : (
        <div className="mb-3" key="icon-key-text">
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
      )}

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
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isUnsupportedImageTransition}
        >
          {submitButtonLabel}
        </button>
      </div>
    </form>
  );
};
