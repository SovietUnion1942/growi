import type { JSX } from 'react';
import React, { useMemo } from 'react';
import { Tldraw } from 'tldraw';

import { BOARD_YJS_WEBSOCKET_BASE_PATH } from '../../interfaces/board';
import './TldrawBoard.vendor-styles.prebuilt';

import { useYjsStore } from './use-yjs-store';

type Props = {
  boardId: string;
  /** true when framed inside a wiki page via the `:board` directive */
  embed?: boolean;
  /**
   * tldraw SDK license key. Required on an HTTPS production domain -- without
   * it tldraw switches to `unlicensed-production` and hides the editor ~5s
   * after mount. Sourced from env (`TLDRAW_LICENSE_KEY`) via the page's
   * getServerSideProps.
   */
  licenseKey?: string;
};

const resolveHostUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${BOARD_YJS_WEBSOCKET_BASE_PATH}`;
};

/**
 * The infinite-canvas board editor: a tldraw canvas whose store is bound to
 * a Yjs document synced over `wss://<host>/board-yjs/<boardId>` (see
 * `features/board/server/board-yjs`).
 *
 * Loaded only behind a `dynamic(..., { ssr: false })` boundary on the
 * standalone `/board/{id}` page -- `tldraw/tldraw.css` is a global stylesheet
 * and must never reach the wiki markdown renderer (Pages Router global-CSS
 * restriction), which is why the wiki `:board` directive embeds this page in
 * an iframe rather than mounting the component inline.
 */
export const TldrawBoard = React.memo((props: Props): JSX.Element => {
  const { boardId, embed, licenseKey } = props;
  const hostUrl = useMemo(resolveHostUrl, []);
  const storeWithStatus = useYjsStore(boardId, hostUrl);

  return (
    <div
      data-testid="tldraw-board"
      style={{ position: embed ? 'absolute' : 'fixed', inset: 0 }}
    >
      <Tldraw store={storeWithStatus} licenseKey={licenseKey} />
    </div>
  );
});
TldrawBoard.displayName = 'TldrawBoard';
