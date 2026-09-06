import { type JSX, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Card, CardBody } from 'reactstrap';

import AdminCustomizeContainer from '~/client/services/AdminCustomizeContainer';
import { toastError, toastSuccess } from '~/client/util/toastr';
import { DEFAULT_HOME_WIDGET_LAYOUT } from '~/features/home/consts';
import {
  type HomeWidgetsSiteConfig,
  type PinnedPageEntry,
  WIDGET_KEYS,
  type WidgetKey,
} from '~/features/home/interfaces/home-widgets';

import { withUnstatedContainers } from '../../UnstatedUtils';
import AdminUpdateButtonRow from '../Common/AdminUpdateButtonRow';

// NOTE: the "リスト系ウィジェットの表示件数" (per-widget item count) option from
// requirement 5.2 is intentionally NOT implemented here. `HomeWidgetsSiteConfig`
// (tasks 1.1/1.2) only carries `visible` / `order` per widget; adding a count
// field would ripple through the already-committed config/SSR/resolve tasks.
// Tracked as a known partial against requirement 5.2.

type Props = {
  adminCustomizeContainer: AdminCustomizeContainer;
};

const WIDGET_LABEL_I18N_KEY: Record<WidgetKey, string> = {
  search: 'admin:customize_settings.home_widget_labels.search',
  recentUpdates: 'admin:customize_settings.home_widget_labels.recentUpdates',
  bookmarks: 'admin:customize_settings.home_widget_labels.bookmarks',
  wipPages: 'admin:customize_settings.home_widget_labels.wipPages',
  classroomPosts: 'admin:customize_settings.home_widget_labels.classroomPosts',
  pinnedPages: 'admin:customize_settings.home_widget_labels.pinnedPages',
  homeFeed: 'admin:customize_settings.home_widget_labels.homeFeed',
};

type WidgetRow = {
  key: WidgetKey;
  visible: boolean;
};

const buildInitialRows = (config: HomeWidgetsSiteConfig): WidgetRow[] => {
  return WIDGET_KEYS.map((key) => ({
    key,
    visible: config[key]?.visible ?? DEFAULT_HOME_WIDGET_LAYOUT[key].visible,
    order: config[key]?.order ?? DEFAULT_HOME_WIDGET_LAYOUT[key].order,
  }))
    .sort((a, b) => a.order - b.order)
    .map(({ key, visible }) => ({ key, visible }));
};

const isValidPinnedPath = (path: string): boolean => {
  const trimmed = path.trim();
  return trimmed !== '' && trimmed.startsWith('/');
};

type PinnedPagesEditorProps = {
  entries: PinnedPageEntry[];
  onChange: (entries: PinnedPageEntry[]) => void;
};

const PinnedPagesEditor = (props: PinnedPagesEditorProps): JSX.Element => {
  const { entries, onChange } = props;
  const { t } = useTranslation();

  return (
    <div className="mt-2">
      <ul className="list-unstyled mb-2">
        {entries.map((entry, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id
          <li key={idx} className="d-flex align-items-center gap-2 mb-1">
            <input
              type="text"
              className="form-control form-control-sm"
              aria-label={t(
                'admin:customize_settings.home_widgets_form.pinned_page_path',
              )}
              placeholder="/example"
              value={entry.path}
              onChange={(e) =>
                onChange(
                  entries.map((it, i) =>
                    i === idx ? { ...it, path: e.target.value } : it,
                  ),
                )
              }
            />
            <input
              type="text"
              className="form-control form-control-sm"
              aria-label={t(
                'admin:customize_settings.home_widgets_form.pinned_page_label',
              )}
              value={entry.label ?? ''}
              onChange={(e) =>
                onChange(
                  entries.map((it, i) =>
                    i === idx ? { ...it, label: e.target.value } : it,
                  ),
                )
              }
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              aria-label={t(
                'admin:customize_settings.home_widgets_form.remove',
              )}
              onClick={() => onChange(entries.filter((_, i) => i !== idx))}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        aria-label={t(
          'admin:customize_settings.home_widgets_form.add_pinned_page',
        )}
        onClick={() => onChange([...entries, { path: '' }])}
      >
        {t('admin:customize_settings.home_widgets_form.add_pinned_page')}
      </button>
    </div>
  );
};

const CustomizeHomeWidgetsSetting = (props: Props): JSX.Element => {
  const { adminCustomizeContainer } = props;
  const { t } = useTranslation();

  const {
    currentHomeWidgets,
    currentHomePinnedPages,
    currentHomeClassroomPathPrefix,
    retrieveError,
  } = adminCustomizeContainer.state;

  const [rows, setRows] = useState<WidgetRow[]>(() =>
    buildInitialRows(currentHomeWidgets ?? {}),
  );
  const [pinnedPages, setPinnedPages] = useState<PinnedPageEntry[]>(
    () => currentHomePinnedPages ?? [],
  );
  const [classroomPathPrefix, setClassroomPathPrefix] = useState<string>(
    () => currentHomeClassroomPathPrefix ?? '',
  );
  const [expandedKey, setExpandedKey] = useState<WidgetKey | null>(null);

  // Re-sync local editing state whenever the container state changes (mirrors
  // the `reset()` effect in CustomizeHomeNoticeSetting) so a save's reflected
  // values, or a fresh retrieve, re-populate the form.
  useEffect(() => {
    setRows(buildInitialRows(currentHomeWidgets ?? {}));
    setPinnedPages(currentHomePinnedPages ?? []);
    setClassroomPathPrefix(currentHomeClassroomPathPrefix ?? '');
  }, [
    currentHomeWidgets,
    currentHomePinnedPages,
    currentHomeClassroomPathPrefix,
  ]);

  const moveRow = useCallback((from: number, to: number) => {
    setRows((prev) => {
      if (to < 0 || to >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const toggleVisible = useCallback((key: WidgetKey) => {
    setRows((prev) =>
      prev.map((row) =>
        row.key === key ? { ...row, visible: !row.visible } : row,
      ),
    );
  }, []);

  const onSubmit = useCallback(async () => {
    if (pinnedPages.some((entry) => !isValidPinnedPath(entry.path))) {
      toastError(
        new Error(
          t('admin:customize_settings.home_widgets_form.invalid_pinned_path'),
        ),
      );
      return;
    }

    const homeWidgets: HomeWidgetsSiteConfig = Object.fromEntries(
      rows.map((row, idx) => [
        row.key,
        { visible: row.visible, order: (idx + 1) * 10 },
      ]),
    );
    const homePinnedPages: PinnedPageEntry[] = pinnedPages.map((entry) => {
      const path = entry.path.trim();
      const label = entry.label?.trim();
      return label != null && label !== '' ? { path, label } : { path };
    });
    const trimmedPrefix = classroomPathPrefix.trim();
    const homeClassroomPathPrefix = trimmedPrefix === '' ? null : trimmedPrefix;

    try {
      adminCustomizeContainer.changeHomeWidgetsSettings({
        homeWidgets,
        homePinnedPages,
        homeClassroomPathPrefix,
      });
      await adminCustomizeContainer.updateHomeWidgets();
      toastSuccess(
        t('toaster.update_successed', {
          target: t('admin:customize_settings.home_widgets'),
          ns: 'commons',
        }),
      );
    } catch (err) {
      toastError(err);
    }
  }, [t, rows, pinnedPages, classroomPathPrefix, adminCustomizeContainer]);

  return (
    <div className="row">
      <div className="col-12">
        <h2 className="admin-setting-header">
          {t('admin:customize_settings.home_widgets')}
        </h2>

        <Card className="card custom-card bg-body-tertiary my-3">
          <CardBody className="px-0 py-2">
            <span
              // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted translation markup
              dangerouslySetInnerHTML={{
                __html: t('admin:customize_settings.home_widgets_detail'),
              }}
            />
          </CardBody>
        </Card>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <ul className="list-group mb-3">
            {rows.map((row, idx) => {
              const hasOptions =
                row.key === 'pinnedPages' || row.key === 'classroomPosts';
              const isExpanded = expandedKey === row.key;
              return (
                <li
                  key={row.key}
                  data-testid={`home-widget-row-${row.key}`}
                  className="list-group-item"
                >
                  <div className="d-flex align-items-center gap-2">
                    <span className="flex-grow-1">
                      {t(WIDGET_LABEL_I18N_KEY[row.key])}
                    </span>

                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      aria-label={t(
                        'admin:customize_settings.home_widgets_form.move_up',
                      )}
                      disabled={idx === 0}
                      onClick={() => moveRow(idx, idx - 1)}
                    >
                      <span className="material-symbols-outlined">
                        arrow_upward
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      aria-label={t(
                        'admin:customize_settings.home_widgets_form.move_down',
                      )}
                      disabled={idx === rows.length - 1}
                      onClick={() => moveRow(idx, idx + 1)}
                    >
                      <span className="material-symbols-outlined">
                        arrow_downward
                      </span>
                    </button>

                    <div className="form-check form-switch mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`home-widget-visible-${row.key}`}
                        aria-label={t(
                          'admin:customize_settings.home_widgets_form.show',
                        )}
                        checked={row.visible}
                        onChange={() => toggleVisible(row.key)}
                      />
                      <label
                        className="form-check-label"
                        htmlFor={`home-widget-visible-${row.key}`}
                      >
                        {t('admin:customize_settings.home_widgets_form.show')}
                      </label>
                    </div>

                    {hasOptions && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        aria-label={t(
                          'admin:customize_settings.home_widgets_form.expand_options',
                        )}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedKey(isExpanded ? null : row.key)
                        }
                      >
                        <span className="material-symbols-outlined">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    )}
                  </div>

                  {hasOptions && isExpanded && (
                    <div className="mt-2 ps-2 border-start">
                      {row.key === 'pinnedPages' && (
                        <>
                          <div className="fw-bold">
                            {t(
                              'admin:customize_settings.home_widgets_form.pinned_pages',
                            )}
                          </div>
                          <PinnedPagesEditor
                            entries={pinnedPages}
                            onChange={setPinnedPages}
                          />
                        </>
                      )}
                      {row.key === 'classroomPosts' && (
                        <label className="d-block">
                          <span className="fw-bold d-block">
                            {t(
                              'admin:customize_settings.home_widgets_form.classroom_path_prefix',
                            )}
                          </span>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            aria-label={t(
                              'admin:customize_settings.home_widgets_form.classroom_path_prefix',
                            )}
                            placeholder="/classroom"
                            value={classroomPathPrefix}
                            onChange={(e) =>
                              setClassroomPathPrefix(e.target.value)
                            }
                          />
                        </label>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <AdminUpdateButtonRow
            type="submit"
            disabled={retrieveError != null}
          />
        </form>
      </div>
    </div>
  );
};

const CustomizeHomeWidgetsSettingWrapper = withUnstatedContainers(
  CustomizeHomeWidgetsSetting,
  [AdminCustomizeContainer],
);

export default CustomizeHomeWidgetsSettingWrapper;
