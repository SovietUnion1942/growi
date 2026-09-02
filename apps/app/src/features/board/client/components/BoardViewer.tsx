import type { JSX } from 'react';
import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';

import { boardEnabledAtom } from '~/states/server-configurations';

type Props = {
  id?: string;
  height?: string;
};

const DEFAULT_HEIGHT = 600;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 2000;

const parseHeight = (raw?: string): number => {
  const n = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(n)) {
    return DEFAULT_HEIGHT;
  }
  return Math.min(Math.max(n, MIN_HEIGHT), MAX_HEIGHT);
};

/**
 * Renders wherever a page embeds `:board{id=...}` (see
 * client/remark/board-directive.ts).
 *
 * The canvas is an independent entity -- it does not belong to the wiki page
 * it is embedded on. This component only frames the standalone board editor
 * (`/board/{id}`) in an iframe, so:
 *   - the heavy canvas bundle (tldraw + its global CSS) stays off the wiki
 *     renderer and out of the Pages Router global-CSS restriction, and
 *   - the same board id embedded on several pages, or opened directly, is
 *     always the one live document.
 *
 * Renders nothing when the feature switch is off or no id was given.
 */
export const BoardViewer = React.memo((props: Props): JSX.Element | null => {
  const { id, height } = props;
  const enabled = useAtomValue(boardEnabledAtom);

  const src = useMemo(() => {
    if (id == null || id === '') {
      return null;
    }
    return `/board/${encodeURIComponent(id)}?embed=1`;
  }, [id]);

  if (!enabled || src == null) {
    return null;
  }

  return (
    <div className="board-viewer my-3">
      <iframe
        title={`board: ${id}`}
        src={src}
        style={{
          width: '100%',
          height: parseHeight(height),
          border: '1px solid var(--bs-border-color)',
          borderRadius: 'var(--bs-border-radius)',
        }}
        loading="lazy"
      />
    </div>
  );
});
BoardViewer.displayName = 'BoardViewer';
