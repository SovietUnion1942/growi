import type {
  HomeWidgetPreferences,
  HomeWidgetsSiteConfig,
  OrderedWidgetView,
  WidgetDescriptor,
  WidgetPreference,
} from './interfaces/home-widgets';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Read a widget's `{ visible?, order? }` override out of an untrusted config
 * map, keeping only well-typed values. Anything malformed (not an object, a
 * non-object entry, wrong value types) yields an empty override, so the
 * caller falls back to the next source.
 */
const readOverride = (
  source: unknown,
  key: string,
): Partial<WidgetPreference> => {
  if (!isRecord(source)) {
    return {};
  }
  const entry = source[key];
  if (!isRecord(entry)) {
    return {};
  }

  const override: Partial<WidgetPreference> = {};
  if (typeof entry.visible === 'boolean') {
    override.visible = entry.visible;
  }
  if (typeof entry.order === 'number' && Number.isFinite(entry.order)) {
    override.order = entry.order;
  }
  return override;
};

/**
 * Derive the effective `/home` widget layout from three sources, most
 * specific first: per-user preference, then site-wide admin config, then the
 * descriptor default. `visible` and `order` are each resolved independently —
 * the first source that specifies a well-typed value wins.
 *
 * Pure and side-effect free: safe to run during SSR and on client re-render,
 * and it returns an equal result for equal input. Malformed config (not an
 * object, unknown keys, wrong value types) is ignored rather than throwing,
 * and unknown keys never appear in the result — only keys present in
 * `descriptors` are considered.
 *
 * The result contains only the visible widgets, sorted by resolved `order`
 * ascending; ties keep descriptor order (stable sort).
 */
export const resolveEffectiveWidgetLayout = (
  descriptors: readonly WidgetDescriptor[],
  siteConfig: HomeWidgetsSiteConfig | null | undefined,
  userPrefs: HomeWidgetPreferences | null | undefined,
): OrderedWidgetView[] => {
  return descriptors
    .map((descriptor) => {
      const site = readOverride(siteConfig, descriptor.key);
      const user = readOverride(userPrefs, descriptor.key);

      const visible = user.visible ?? site.visible ?? descriptor.defaultVisible;
      const order = user.order ?? site.order ?? descriptor.defaultOrder;

      return { descriptor, visible, order };
    })
    .filter((resolved) => resolved.visible)
    .sort((a, b) => a.order - b.order)
    .map(({ descriptor }) => ({
      key: descriptor.key,
      Component: descriptor.Component,
      fullWidth: descriptor.fullWidth,
    }));
};
