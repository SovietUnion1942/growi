import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateUserUISettings } from '~/client/services/user-ui-settings';
import { toastError, toastSuccess } from '~/client/util/toastr';
import type {
  HomeWidgetPreferences,
  HomeWidgetsSiteConfig,
  PinnedPageEntry,
  WidgetKey,
} from '~/features/home/interfaces/home-widgets';
import { HOME_WIDGET_DESCRIPTORS } from '~/features/home/widgets-registry';

import type { CustomizeWidgetEntry } from './widgets/HomeWidgets';
import { HomeWidgets } from './widgets/HomeWidgets';

type Props = {
  homeWidgetsSiteConfig?: HomeWidgetsSiteConfig;
  homePinnedPages?: PinnedPageEntry[];
  homeClassroomPathPrefix?: string | null;
  /** The persisted per-user preferences (SSR-hydrated). */
  homeWidgetPreferences?: HomeWidgetPreferences;
};

type ResolvedEntry = { key: WidgetKey; visible: boolean; order: number };

/**
 * Resolve the full 7-widget ordered list for the customize UI, keeping hidden
 * entries (which `resolveEffectiveWidgetLayout` drops). Precedence mirrors the
 * resolver: working per-user prefs, then site config, then descriptor default —
 * `visible` and `order` resolved independently. Sorted by order ascending;
 * ties keep descriptor order (stable sort).
 */
const readBool = (v: unknown): boolean | undefined =>
  typeof v === 'boolean' ? v : undefined;
const readNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const resolveCustomizeEntries = (
  workingPrefs: HomeWidgetPreferences,
  siteConfig: HomeWidgetsSiteConfig | undefined,
): ResolvedEntry[] => {
  return HOME_WIDGET_DESCRIPTORS.map((descriptor) => {
    const user = workingPrefs[descriptor.key];
    const site = siteConfig?.[descriptor.key];
    // Same per-field precedence as `resolveEffectiveWidgetLayout`
    // (user → site → default), and the same fail-safe: a malformed stored
    // value is ignored rather than trusted.
    return {
      key: descriptor.key,
      visible:
        readBool(user?.visible) ??
        readBool(site?.visible) ??
        descriptor.defaultVisible,
      order:
        readNum(user?.order) ?? readNum(site?.order) ?? descriptor.defaultOrder,
    };
  }).sort((a, b) => a.order - b.order);
};

/**
 * `/home` per-user widget customization (task 4.3, Requirements 6.1, 6.2, 6.4).
 *
 * Wraps `HomeWidgets`. Outside customize mode it renders a single "customize"
 * toggle plus the widget area driven by the persisted preferences. Inside
 * customize mode it keeps the whole working layout map in local state, hands
 * `HomeWidgets` the full 7-widget ordering (so hidden widgets still show a
 * frame) with up/down/visibility handlers, and offers 保存 / 初期状態に戻す /
 * 完了. 保存 persists the whole working map via `PUT /user-ui-settings`;
 * 初期状態に戻す persists an empty map so the user falls back to the site-wide
 * config (Req 6.4). On save failure the local edits are kept so the user can
 * retry (design: 個人別設定の保存失敗 → トースト通知).
 */
export const HomeWidgetCustomizePanel: FC<Props> = (props) => {
  const { t } = useTranslation();

  const [customizing, setCustomizing] = useState(false);
  const [workingPrefs, setWorkingPrefs] = useState<HomeWidgetPreferences>(
    () => props.homeWidgetPreferences ?? {},
  );

  // Re-sync the working map from a fresh persisted value (external update or a
  // new SSR value); also used after a successful save/reset.
  useEffect(() => {
    setWorkingPrefs(props.homeWidgetPreferences ?? {});
  }, [props.homeWidgetPreferences]);

  const siteConfig = props.homeWidgetsSiteConfig;

  const orderedForCustomize: CustomizeWidgetEntry[] = resolveCustomizeEntries(
    workingPrefs,
    siteConfig,
  ).map(({ key, visible }) => ({ key, visible }));

  const handleMoveWidget = useCallback(
    (key: WidgetKey, dir: 'up' | 'down') => {
      setWorkingPrefs((prev) => {
        const entries = resolveCustomizeEntries(prev, siteConfig);
        const index = entries.findIndex((e) => e.key === key);
        const target = dir === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= entries.length) {
          return prev;
        }
        const reordered = [...entries];
        [reordered[index], reordered[target]] = [
          reordered[target],
          reordered[index],
        ];
        // Rewrite every key with an explicit order reflecting the new sequence,
        // keeping each key's resolved visibility, so the saved map is
        // self-consistent regardless of the site config.
        const next: HomeWidgetPreferences = {};
        reordered.forEach((entry, i) => {
          next[entry.key] = { visible: entry.visible, order: (i + 1) * 10 };
        });
        return next;
      });
    },
    [siteConfig],
  );

  const handleToggleVisible = useCallback(
    (key: WidgetKey) => {
      setWorkingPrefs((prev) => {
        const entries = resolveCustomizeEntries(prev, siteConfig);
        const current = entries.find((e) => e.key === key);
        if (current == null) {
          return prev;
        }
        return {
          ...prev,
          [key]: {
            visible: !current.visible,
            order: prev[key]?.order ?? current.order,
          },
        };
      });
    },
    [siteConfig],
  );

  const handleSave = useCallback(async () => {
    try {
      await updateUserUISettings({ homeWidgetPreferences: workingPrefs });
      toastSuccess(t('home.customize.saved'));
      setCustomizing(false);
    } catch (err) {
      toastError(err as Error);
    }
  }, [workingPrefs, t]);

  const handleReset = useCallback(async () => {
    try {
      await updateUserUISettings({ homeWidgetPreferences: {} });
      setWorkingPrefs({});
      toastSuccess(t('home.customize.saved'));
      setCustomizing(false);
    } catch (err) {
      toastError(err as Error);
    }
  }, [t]);

  if (!customizing) {
    return (
      <div className="grw-home-widget-customize">
        <div className="d-flex justify-content-end mb-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            onClick={() => {
              setWorkingPrefs(props.homeWidgetPreferences ?? {});
              setCustomizing(true);
            }}
          >
            <span className="material-symbols-outlined">tune</span>
            {t('home.customize.toggle')}
          </button>
        </div>
        <HomeWidgets
          homeWidgetsSiteConfig={props.homeWidgetsSiteConfig}
          homePinnedPages={props.homePinnedPages}
          homeClassroomPathPrefix={props.homeClassroomPathPrefix}
          userWidgetPreferences={props.homeWidgetPreferences}
        />
      </div>
    );
  }

  return (
    <div className="grw-home-widget-customize">
      <div className="d-flex flex-wrap justify-content-end align-items-center gap-2 mb-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={handleSave}
        >
          {t('home.customize.save')}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={handleReset}
        >
          {t('home.customize.reset')}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => {
            setWorkingPrefs(props.homeWidgetPreferences ?? {});
            setCustomizing(false);
          }}
        >
          {t('home.customize.done')}
        </button>
      </div>
      <HomeWidgets
        homeWidgetsSiteConfig={props.homeWidgetsSiteConfig}
        homePinnedPages={props.homePinnedPages}
        homeClassroomPathPrefix={props.homeClassroomPathPrefix}
        userWidgetPreferences={workingPrefs}
        customizeMode
        orderedForCustomize={orderedForCustomize}
        onMoveWidget={handleMoveWidget}
        onToggleVisible={handleToggleVisible}
      />
    </div>
  );
};
