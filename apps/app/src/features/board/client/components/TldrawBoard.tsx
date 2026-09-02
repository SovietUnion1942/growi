import type { JSX } from 'react';
import React from 'react';

type Props = {
  boardId: string;
  /** true when framed inside a wiki page via the `:board` directive */
  embed?: boolean;
};

/**
 * The infinite-canvas board editor.
 *
 * TODO(board): this is a placeholder. The real implementation renders a
 * tldraw canvas whose store is bound to a Yjs document, synced over a
 * dedicated websocket namespace that reuses GROWI's collab infrastructure:
 *
 *   - client: `@tldraw/tldraw` + a `y-websocket` provider pointed at
 *     `wss://<host>/board-yjs/<boardId>` (see server/service/board-yjs).
 *   - persistence: a second `MongodbPersistence` on the `board-yjs-writings`
 *     collection, cloned from `server/service/yjs/yjs.ts` with the wiki-body
 *     revision-sync logic removed.
 *   - auth: the `/board-yjs/` upgrade handler reuses
 *     `server/service/yjs/upgrade-handler.ts` verbatim (session-cookie check).
 *
 * tldraw ships global CSS, so it must be loaded here (a `dynamic(..., { ssr:
 * false })` boundary on a standalone page) and never from the wiki markdown
 * renderer -- hence the iframe in BoardViewer.
 */
export const TldrawBoard = React.memo((props: Props): JSX.Element => {
  const { boardId, embed } = props;

  return (
    <div
      data-testid="tldraw-board-placeholder"
      style={{
        position: embed ? 'absolute' : 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bs-body-bg)',
        color: 'var(--bs-secondary-color)',
      }}
    >
      board canvas: <code className="mx-1">{boardId}</code> (not yet
      implemented)
    </div>
  );
});
TldrawBoard.displayName = 'TldrawBoard';
